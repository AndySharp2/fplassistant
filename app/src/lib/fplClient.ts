// Thin client for the public (unauthenticated) Fantasy Premier League API.
//
// Calls go through the "Fantasy Premier League API" custom connector added via
// `pac code add-data-source` (see FPL/docs/custom-connector.md). Power Platform
// calls the connector server-side, so the browser's CORS restriction never applies.
// Run `pac code run` to test this locally against the real connection.
import { FantasyPremierLeagueAPIService } from '../generated';
import type { Fixture, Player, Position, Team } from '../types';

const POSITION_BY_TYPE: Record<number, Position> = {
  1: 'GKP',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};

const cache = new Map<string, { expiresAt: number; value: unknown }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Card rates are per-90, so a player with a couple of substitute appearances and one booking
// would otherwise read as ~7 yellows per 90 and be scored several points below everyone else.
// Dividing by at least five full games' worth of minutes keeps small samples in a sane range.
const MIN_MINUTES_FOR_RATE = 450;

export function clearFplClientCache(): void {
  cache.clear();
}

async function cachedCall<T>(cacheKey: string, call: () => Promise<{ success: boolean; data: T; error?: unknown }>): Promise<T> {
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }
  const result = await call();
  if (!result.success) {
    throw new Error(`FPL connector call failed (${cacheKey}): ${JSON.stringify(result.error)}`);
  }
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: result.data });
  return result.data;
}

interface BootstrapResponse {
  events: Array<{ id: number; is_current: boolean; is_next: boolean; finished: boolean }>;
  teams: Array<{
    id: number;
    code: number;
    name: string;
    short_name: string;
    strength_overall_home: number;
    strength_overall_away: number;
    strength_attack_home: number;
    strength_attack_away: number;
    strength_defence_home: number;
    strength_defence_away: number;
  }>;
  elements: Array<{
    id: number;
    code: number;
    web_name: string;
    first_name: string;
    second_name: string;
    team: number;
    element_type: number;
    now_cost: number;
    total_points: number;
    points_per_game: string;
    form: string;
    selected_by_percent: string;
    minutes: number;
    starts: number;
    chance_of_playing_next_round: number | null;
    status: string;
    expected_goals_per_90: string;
    expected_assists_per_90: string;
    expected_goals_conceded_per_90: string;
    clean_sheets_per_90: string;
    saves_per_90: string;
    bonus: number;
    yellow_cards: number;
    red_cards: number;
    ep_next: string | null;
  }>;
}

interface FixturesResponseItem {
  id: number;
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  kickoff_time: string | null;
  finished: boolean;
}

async function getBootstrap() {
  return cachedCall('bootstrap-static', () => FantasyPremierLeagueAPIService.GetBootstrapStatic() as unknown as Promise<{ success: boolean; data: BootstrapResponse; error?: unknown }>);
}

export async function getTeams(): Promise<Team[]> {
  const data = await getBootstrap();
  return data.teams.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    shortName: t.short_name,
    strengthOverallHome: t.strength_overall_home,
    strengthOverallAway: t.strength_overall_away,
    strengthAttackHome: t.strength_attack_home,
    strengthAttackAway: t.strength_attack_away,
    strengthDefenceHome: t.strength_defence_home,
    strengthDefenceAway: t.strength_defence_away,
  }));
}

export async function getPlayers(): Promise<Player[]> {
  const data = await getBootstrap();
  return data.elements.map((e) => ({
    id: e.id,
    code: e.code,
    webName: e.web_name,
    fullName: `${e.first_name} ${e.second_name}`,
    teamId: e.team,
    position: POSITION_BY_TYPE[e.element_type] ?? 'MID',
    nowCostTenths: e.now_cost,
    totalPoints: e.total_points,
    pointsPerGame: Number(e.points_per_game) || 0,
    form: Number(e.form) || 0,
    selectedByPercent: Number(e.selected_by_percent) || 0,
    minutes: e.minutes,
    starts: e.starts,
    chanceOfPlayingNextRound: e.chance_of_playing_next_round,
    status: e.status,
    expectedGoalsPer90: Number(e.expected_goals_per_90) || 0,
    expectedAssistsPer90: Number(e.expected_assists_per_90) || 0,
    expectedGoalsConcededPer90: Number(e.expected_goals_conceded_per_90) || 0,
    cleanSheetsPer90: Number(e.clean_sheets_per_90) || 0,
    savesPer90: Number(e.saves_per_90) || 0,
    bonusPerGame: e.starts > 0 ? e.bonus / Math.max(e.starts, 1) : 0,
    yellowCardsPer90: e.minutes > 0 ? e.yellow_cards / (Math.max(e.minutes, MIN_MINUTES_FOR_RATE) / 90) : 0,
    redCardsPer90: e.minutes > 0 ? e.red_cards / (Math.max(e.minutes, MIN_MINUTES_FOR_RATE) / 90) : 0,
  }));
}

export async function getCurrentOrNextEvent(): Promise<number> {
  const data = await getBootstrap();
  const current = data.events.find((e) => e.is_current);
  const next = data.events.find((e) => e.is_next);
  return (current ?? next ?? data.events[0]).id;
}

/** True before the season's first gameweek has kicked off (no event is yet "current"). */
export async function isPreSeason(): Promise<boolean> {
  const data = await getBootstrap();
  return !data.events.some((e) => e.is_current);
}

export async function getFixtures(): Promise<Fixture[]> {
  const items = await cachedCall('fixtures', () => FantasyPremierLeagueAPIService.GetFixtures() as unknown as Promise<{ success: boolean; data: FixturesResponseItem[]; error?: unknown }>);
  return items.map((f) => ({
    id: f.id,
    event: f.event,
    teamH: f.team_h,
    teamA: f.team_a,
    teamHDifficulty: f.team_h_difficulty,
    teamADifficulty: f.team_a_difficulty,
    kickoffTime: f.kickoff_time,
    finished: f.finished,
  }));
}

interface ElementSummaryResponse {
  history_past: Array<{
    season_name: string;
    total_points: number;
    minutes: number;
    goals_scored: number;
    assists: number;
    clean_sheets: number;
    bonus: number;
  }>;
  history: Array<{ round: number; total_points: number; minutes: number }>;
}

export interface PlayerHistory {
  pastSeasons: Array<{
    seasonName: string;
    totalPoints: number;
    minutes: number;
    goalsScored: number;
    assists: number;
    cleanSheets: number;
    bonus: number;
  }>;
  thisSeasonByRound: Array<{ round: number; totalPoints: number; minutes: number }>;
}

/** On-demand only (one player at a time) - not used for bulk scoring since 700+ calls would be too slow. */
export async function getPlayerHistory(playerId: number): Promise<PlayerHistory> {
  const data = await cachedCall(`element-summary-${playerId}`, () => FantasyPremierLeagueAPIService.GetElementSummary(playerId) as unknown as Promise<{ success: boolean; data: ElementSummaryResponse; error?: unknown }>);
  return {
    pastSeasons: data.history_past.map((s) => ({
      seasonName: s.season_name,
      totalPoints: s.total_points,
      minutes: s.minutes,
      goalsScored: s.goals_scored,
      assists: s.assists,
      cleanSheets: s.clean_sheets,
      bonus: s.bonus,
    })),
    thisSeasonByRound: data.history.map((h) => ({ round: h.round, totalPoints: h.total_points, minutes: h.minutes })),
  };
}
