import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SCOUT_URL = 'https://www.fantasyfootballscout.co.uk/team-news';
const FPL_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const OUTPUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'src', 'lib', 'scoutPredictedLineups.ts');
const TEAM_ALIASES = new Map([
  ['Brighton and Hove Albion', 'Brighton'],
  ['Leeds United', 'Leeds'],
  ['Manchester City', 'Man City'],
  ['Manchester United', 'Man Utd'],
  ['Newcastle United', 'Newcastle'],
  ['Nottingham Forest', "Nott'm Forest"],
  ['Tottenham Hotspur', 'Spurs'],
]);

const [scoutResponse, fplResponse] = await Promise.all([fetch(SCOUT_URL), fetch(FPL_URL)]);
if (!scoutResponse.ok) throw new Error(`Scout request failed: ${scoutResponse.status}`);
if (!fplResponse.ok) throw new Error(`FPL request failed: ${fplResponse.status}`);

const [html, fpl] = await Promise.all([scoutResponse.text(), fplResponse.json()]);
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
    throw new Error(`Could not match all 11 predicted starters for ${scoutTeamName}. Snapshot not updated.`);
  }

  starters.forEach((player) => starterIds.add(player.id));
  validatedTeams++;
}

if (validatedTeams !== 20 || starterIds.size !== 220) {
  throw new Error(`Expected 20 teams and 220 starters; found ${validatedTeams} teams and ${starterIds.size} starters. Snapshot not updated.`);
}

const ids = [...starterIds].sort((left, right) => left - right);
const source = `// Fantasy Football Scout predicted line-ups snapshot, refreshed ${new Date().toISOString().slice(0, 10)}.\nexport const SCOUT_PREDICTED_STARTER_IDS: ReadonlySet<number> = new Set([\n  ${ids.join(', ')}\n]);\n`;
await writeFile(OUTPUT_PATH, source);
console.log(`Updated ${OUTPUT_PATH} with ${ids.length} predicted starters from ${validatedTeams} teams.`);
