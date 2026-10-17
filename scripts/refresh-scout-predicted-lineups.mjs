// Scrapes the Fantasy Football Scout predicted line-ups, matches each starter to an FPL
// player id, and publishes the result.
//
// Two sinks:
//   --dataverse  upserts the snapshot into the Dataverse table the app reads at runtime
//                (this is what keeps the deployed app fresh). Gets a token either via an
//                Entra ID app registration's client-credentials flow (AZURE_CLIENT_ID /
//                AZURE_CLIENT_SECRET / AZURE_TENANT_ID env vars - no Azure subscription
//                required, just a free app registration added as an Application User in
//                the Dataverse environment), or by falling back to the signed-in `az`/`pac`
//                CLI session for local/manual runs.
//   --file       rewrites app/src/lib/scoutPredictedLineups.ts, the offline fallback
//                bundled into the build
// Defaults to both. Each starter is matched to an FPL player primarily by Scout's photo
// code, falling back to a fuzzy last-name match within that player's own team when the
// code isn't in FPL's bootstrap data (the two sites occasionally spell/transliterate a
// name or assign a photo id differently for the same player). The parse is still
// validated hard - unless all 20 teams and 220 starters are matched by one method or the
// other, nothing is written to either sink, so a site redesign can never silently
// publish a half-scraped line-up.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SCOUT_URL = 'https://www.fantasyfootballscout.co.uk/team-news';
const FPL_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const OUTPUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'src', 'lib', 'scoutPredictedLineups.ts');
const DEFAULT_ENVIRONMENT_URL = 'https://orgdce3257b.crm11.dynamics.com';
const EXPECTED_TEAMS = 20;
const EXPECTED_STARTERS = 220;

const TEAM_ALIASES = new Map([
  ['Brighton and Hove Albion', 'Brighton'],
  ['Leeds United', 'Leeds'],
  ['Manchester City', 'Man City'],
  ['Manchester United', 'Man Utd'],
  ['Newcastle United', 'Newcastle'],
  ['Nottingham Forest', "Nott'm Forest"],
  ['Tottenham Hotspur', 'Spurs'],
]);

const args = process.argv.slice(2);
const environmentUrl = (args.find((arg) => arg.startsWith('--environment-url=')) ?? '').split('=')[1] || DEFAULT_ENVIRONMENT_URL;
const sinkRequested = args.includes('--dataverse') || args.includes('--file');
const wantsDataverse = args.includes('--dataverse') || !sinkRequested;
const wantsFile = args.includes('--file') || !sinkRequested;

// Keeps only letters, lower-cased, for fuzzy last-name comparisons (e.g. "Yarmolyuk" vs
// FPL's "Yarmoliuk" - real-world transliteration differences between the two sites).
function normalizeName(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function levenshtein(a, b) {
  const rows = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) rows[i][0] = i;
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = a[i - 1] === b[j - 1]
        ? rows[i - 1][j - 1]
        : 1 + Math.min(rows[i - 1][j - 1], rows[i][j - 1], rows[i - 1][j]);
    }
  }
  return rows[a.length][b.length];
}

// Last resort when a player's Scout photo code isn't in FPL's bootstrap data (most often a
// one-off transliteration mismatch for a single player, not a page layout change): find the
// closest last-name match among that team's own FPL roster.
function matchByName(scoutLastName, teamId, fpl, alreadyUsedIds) {
  const target = normalizeName(scoutLastName);
  let best = null;
  let bestDistance = Infinity;
  for (const player of fpl.elements) {
    if (player.team !== teamId || alreadyUsedIds.has(player.id)) continue;
    const distance = Math.min(
      levenshtein(target, normalizeName(player.second_name)),
      levenshtein(target, normalizeName(player.web_name))
    );
    if (distance < bestDistance) {
      best = player;
      bestDistance = distance;
    }
  }
  // Allow a couple of character edits (transliteration quirks), but not an unrelated player.
  return bestDistance <= 2 ? best : null;
}

function parseScoutLineups(html, fpl) {
  const teamIdsByName = new Map(fpl.teams.map((team) => [team.name, team.id]));
  const playersByCode = new Map(fpl.elements.map((player) => [String(player.code), player]));
  const starterIds = new Set();
  let validatedTeams = 0;

  for (const section of html.split('<h2').slice(1)) {
    const headingEnd = section.indexOf('</h2>');
    if (headingEnd === -1) continue;

    const heading = section.slice(0, headingEnd);
    const scoutTeamName = heading.slice(heading.indexOf('>') + 1).replace(/<[^>]+>/g, '').trim();
    const teamId = teamIdsByName.get(scoutTeamName) ?? teamIdsByName.get(TEAM_ALIASES.get(scoutTeamName));
    if (teamId === undefined) continue;

    // Each predicted starter is a `<li title="LastName (FirstName)">` wrapping a photo
    // `<img>` whose filename is the player's Scout photo code.
    const starterMatches = [...section.slice(headingEnd).matchAll(/title="([^"(]+)[^"]*"[\s\S]{0,400}?110x140\/(\d+)\.png/g)].slice(0, 11);
    const starters = starterMatches.map(([, lastName, code]) => ({ lastName: lastName.trim(), player: playersByCode.get(code) }));

    // Players this team has already placed (by code or an earlier fallback match in this
    // same loop), so a fallback can't double-assign one player to two line-up slots.
    const usedInTeam = new Set([...starterIds, ...starters.map(({ player }) => player?.id).filter(Boolean)]);
    for (const starter of starters) {
      if (!starter.player) {
        starter.player = matchByName(starter.lastName, teamId, fpl, usedInTeam);
        if (starter.player) usedInTeam.add(starter.player.id);
      }
    }

    if (starters.length !== 11 || starters.some(({ player }) => !player)) {
      throw new Error(`Could not match all 11 predicted starters for ${scoutTeamName}. Nothing was published.`);
    }

    starters.forEach(({ player }) => starterIds.add(player.id));
    validatedTeams++;
  }

  if (validatedTeams !== EXPECTED_TEAMS || starterIds.size !== EXPECTED_STARTERS) {
    throw new Error(
      `Expected ${EXPECTED_TEAMS} teams and ${EXPECTED_STARTERS} starters; found ${validatedTeams} teams and ${starterIds.size} starters. Nothing was published.`
    );
  }

  return { ids: [...starterIds].sort((left, right) => left - right), validatedTeams };
}

async function dataverseRequest(token, path, { method = 'GET', body } = {}) {
  const response = await fetch(`${environmentUrl}/api/data/v9.2/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Dataverse ${method} ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
}

// App-only auth: no Azure subscription needed, just an Entra ID app registration added
// as an Application User in the Dataverse environment (Power Platform admin center ->
// environment -> Settings -> Users + permissions -> Application users).
async function getTokenFromServicePrincipal(clientId, clientSecret, tenantId) {
  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: `${environmentUrl}/.default`,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Could not get a Dataverse token from Entra ID: ${payload.error_description ?? JSON.stringify(payload)}`);
  }
  return payload.access_token;
}

// Local/manual fallback: reuse whatever account is already signed in via the Azure CLI
// (e.g. `az login`), handy for testing without setting up a service principal.
async function getTokenFromAzureCli() {
  const { stdout } = await execFileAsync(
    'az',
    ['account', 'get-access-token', '--resource', environmentUrl, '--query', 'accessToken', '-o', 'tsv'],
    { shell: true }
  );
  const token = stdout.trim();
  if (!token) throw new Error("Could not get a Dataverse token. Run 'az login' first.");
  return token;
}

async function getDataverseToken() {
  const { AZURE_CLIENT_ID: clientId, AZURE_CLIENT_SECRET: clientSecret, AZURE_TENANT_ID: tenantId } = process.env;
  if (clientId && clientSecret && tenantId) {
    return getTokenFromServicePrincipal(clientId, clientSecret, tenantId);
  }
  return getTokenFromAzureCli();
}

async function publishToDataverse(ids, validatedTeams, refreshedAt) {
  const token = await getDataverseToken();
  const record = {
    cra06_name: 'Scout Predicted Lineups',
    cra06_starteridsjson: JSON.stringify(ids),
    cra06_refreshedon: refreshedAt,
    cra06_teamcount: validatedTeams,
    cra06_startercount: ids.length,
  };

  // Single-row table: refresh the existing snapshot if present, otherwise seed it.
  const existing = await dataverseRequest(token, 'cra06_scoutlineups?$select=cra06_scoutlineupid&$top=1');
  const existingId = existing?.value?.[0]?.cra06_scoutlineupid;

  if (existingId) {
    await dataverseRequest(token, `cra06_scoutlineups(${existingId})`, { method: 'PATCH', body: record });
    console.log(`Refreshed Dataverse snapshot ${existingId} with ${ids.length} predicted starters.`);
  } else {
    await dataverseRequest(token, 'cra06_scoutlineups', { method: 'POST', body: record });
    console.log(`Seeded Dataverse snapshot with ${ids.length} predicted starters.`);
  }
}

async function publishToFile(ids, validatedTeams, refreshedAt) {
  const source =
    `// Offline fallback copy of the Fantasy Football Scout predicted line-ups.\n` +
    `// The app prefers the live Dataverse snapshot and only falls back to this when that read fails.\n` +
    `export const SCOUT_SNAPSHOT_REFRESHED_AT = '${refreshedAt}';\n` +
    `export const SCOUT_PREDICTED_STARTER_IDS: ReadonlySet<number> = new Set([\n  ${ids.join(', ')}\n]);\n`;
  await writeFile(OUTPUT_PATH, source);
  console.log(`Updated ${OUTPUT_PATH} with ${ids.length} predicted starters from ${validatedTeams} teams.`);
}

const [scoutResponse, fplResponse] = await Promise.all([
  fetch(SCOUT_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } }),
  fetch(FPL_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } }),
]);
if (!scoutResponse.ok) throw new Error(`Scout request failed: ${scoutResponse.status}`);
if (!fplResponse.ok) throw new Error(`FPL request failed: ${fplResponse.status}`);

const [html, fpl] = await Promise.all([scoutResponse.text(), fplResponse.json()]);
const { ids, validatedTeams } = parseScoutLineups(html, fpl);
const refreshedAt = new Date().toISOString();

if (wantsFile) await publishToFile(ids, validatedTeams, refreshedAt);
if (wantsDataverse) await publishToDataverse(ids, validatedTeams, refreshedAt);
