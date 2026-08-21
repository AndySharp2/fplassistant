// Data access layer for FPL data - runs entirely client-side (in the browser),
// with all prediction/optimization math in ../lib. Local dev goes through the
// Vite dev-server proxy for FPL API calls (see vite.config.ts); once published,
// this should go through the Power Platform custom connector data source instead
// (see FPL/docs/custom-connector.md).
import { getFixtures as fetchFixtures, getPlayers, getTeams, getCurrentOrNextEvent, isPreSeason } from '../lib/fplClient';
import { buildAllProjections } from '../lib/projections';
import { recommendTransfers } from '../lib/optimizer';
import { buildBestSquad, type BuiltSquad } from '../lib/squadBuilder';
import { getScoutLineups } from './scoutLineupRepository';
import type { Fixture, Player, PlayerProjection, RecommendationResult, Squad, Team } from '../types';

export interface BootstrapResponse {
  players: Player[];
  teams: Team[];
  currentEvent: number;
  preSeason: boolean;
}

export async function getBootstrap(): Promise<BootstrapResponse> {
  const [players, teams, currentEvent, preSeason] = await Promise.all([getPlayers(), getTeams(), getCurrentOrNextEvent(), isPreSeason()]);
  return { players, teams, currentEvent, preSeason };
}

export function getFixtures(): Promise<Fixture[]> {
  return fetchFixtures();
}

export async function getRecommendations(
  squad: Squad,
  startGameweek: number,
  horizonGameweeks = 3,
  maxSuggestions = 5
): Promise<RecommendationResult> {
  const [playersList, teams, fixtures, preSeason, scoutLineups] = await Promise.all([
    getPlayers(),
    getTeams(),
    fetchFixtures(),
    isPreSeason(),
    getScoutLineups(),
  ]);
  const players = new Map(playersList.map((p) => [p.id, p]));
  const projections = buildAllProjections(playersList, teams, fixtures, startGameweek, horizonGameweeks, preSeason, scoutLineups);

  return recommendTransfers({ squad, players, projections, startGameweek, maxSuggestions, unlimitedTransfers: false, preSeason });
}

export interface ProjectionsBundle {
  currentEvent: number;
  horizonGameweeks: number;
  projectionsByPlayerId: Map<number, PlayerProjection>;
}

/** Fetches live data and computes horizon projections for the whole player pool - used for xPts displays and squad building. */
export async function getProjections(horizonGameweeks = 3): Promise<ProjectionsBundle> {
  const [playersList, teams, fixtures, currentEvent, preSeason, scoutLineups] = await Promise.all([
    getPlayers(),
    getTeams(),
    fetchFixtures(),
    getCurrentOrNextEvent(),
    isPreSeason(),
    getScoutLineups(),
  ]);
  const projectionsByPlayerId = buildAllProjections(playersList, teams, fixtures, currentEvent, horizonGameweeks, preSeason, scoutLineups);
  return { currentEvent, horizonGameweeks, projectionsByPlayerId };
}

/** Builds a brand-new 15-player squad from scratch, maximising expected points within budget (e.g. for Gameweek 1). */
export async function buildSuggestedSquad(horizonGameweeks = 3): Promise<BuiltSquad> {
  const [playersList, teams, fixtures, currentEvent, preSeason, scoutLineups] = await Promise.all([
    getPlayers(),
    getTeams(),
    fetchFixtures(),
    getCurrentOrNextEvent(),
    isPreSeason(),
    getScoutLineups(),
  ]);
  const projections = buildAllProjections(playersList, teams, fixtures, currentEvent, horizonGameweeks, preSeason, scoutLineups);
  return buildBestSquad(playersList, projections);
}
