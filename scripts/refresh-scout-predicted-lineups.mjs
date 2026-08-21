// Scrapes the Fantasy Football Scout predicted line-ups, matches each starter to an FPL
// player id, and publishes the result.
//
// Two sinks:
//   --dataverse  upserts the snapshot into the Dataverse table the app reads at runtime
//                (needs `az login`; this is what keeps the deployed app fresh)
//   --file       rewrites app/src/lib/scoutPredictedLineups.ts, the offline fallback
//                bundled into the build
// Defaults to both. The parse is validated hard - unless all 20 teams and 220 starters
// match, nothing is written to either sink, so a site redesign can never silently
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

function parseScoutLineups(html, fpl) {
  const teams = new Set(fpl.teams.map((team) => team.name));
  const playersByCode = new Map(fpl.elements.map((player) => [String(player.code), player]));
  const starterIds = new Set();
  let validatedTeams = 0;

  for (const section of html.split('<h2').slice(1)) {
    const headingEnd = section.indexOf('</h2>');
    if (headingEnd === -1) continue;

    const heading = section.slice(0, headingEnd);
    const scoutTeamName = heading.slice(heading.indexOf('>') + 1).replace(/<[^>]+>/g, '').trim();
    if (!teams.has(scoutTeamName) && !teams.has(TEAM_ALIASES.get(scoutTeamName))) continue;

    const codes = [...section.slice(headingEnd).matchAll(/110x140\/(\d+)\.png/g)].map((match) => match[1]).slice(0, 11);
    const starters = codes.map((code) => playersByCode.get(code));
    if (starters.length !== 11 || starters.some((player) => !player)) {
      throw new Error(`Could not match all 11 predicted starters for ${scoutTeamName}. Nothing was published.`);
    }

    starters.forEach((player) => starterIds.add(player.id));
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

async function getDataverseToken() {
  const { stdout } = await execFileAsync(
    'az',
    ['account', 'get-access-token', '--resource', environmentUrl, '--query', 'accessToken', '-o', 'tsv'],
    { shell: true }
  );
  const token = stdout.trim();
  if (!token) throw new Error("Could not get a Dataverse token. Run 'az login' first.");
  return token;
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
