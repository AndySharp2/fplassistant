import type { Player, PlayerProjection, Position } from '../types';

const POSITION_ORDER: Position[] = ['GKP', 'DEF', 'MID', 'FWD'];

export const SQUAD_POSITION_REQUIREMENTS: Record<Position, number> = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
export const TOTAL_SQUAD_BUDGET_TENTHS = 1000; // £100.0m
export const MAX_PLAYERS_PER_CLUB = 3;

/** Hard invariant check shared by the AI squad builder and transfer optimizer - a squad
 *  must have exactly 15 players in the correct position split, never exceed the £100m
 *  budget, and never have more than 3 players from one club. Returns a list of human
 *  readable issues; an empty list means the squad is fully legal. */
export function validateFullSquad(
  squadPlayers: { playerId: number; purchasePrice: number }[],
  players: Map<number, Player>
): string[] {
  const issues: string[] = [];

  if (squadPlayers.length !== 15) {
    issues.push(`Squad has ${squadPlayers.length} players instead of the required 15.`);
  }

  const totalSpend = squadPlayers.reduce((sum, sp) => sum + sp.purchasePrice, 0);
  if (totalSpend > TOTAL_SQUAD_BUDGET_TENTHS) {
    issues.push(`Squad cost £${(totalSpend / 10).toFixed(1)}m exceeds the £100.0m budget.`);
  }

  const positionCounts: Record<Position, number> = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  const clubCounts = new Map<number, number>();
  for (const sp of squadPlayers) {
    const player = players.get(sp.playerId);
    if (!player) {
      issues.push(`Squad references unknown player id ${sp.playerId}.`);
      continue;
    }
    positionCounts[player.position]++;
    clubCounts.set(player.teamId, (clubCounts.get(player.teamId) ?? 0) + 1);
  }

  for (const pos of POSITION_ORDER) {
    if (positionCounts[pos] !== SQUAD_POSITION_REQUIREMENTS[pos]) {
      issues.push(`Squad has ${positionCounts[pos]} ${pos} players instead of the required ${SQUAD_POSITION_REQUIREMENTS[pos]}.`);
    }
  }

  for (const [clubId, count] of clubCounts) {
    if (count > MAX_PLAYERS_PER_CLUB) {
      issues.push(`Squad has ${count} players from club ${clubId}, exceeding the limit of ${MAX_PLAYERS_PER_CLUB}.`);
    }
  }

  return issues;
}


function pointsForGameweek(playerId: number, projections: Map<number, PlayerProjection>, gameweekIndex: number): number {
  return projections.get(playerId)?.perGameweek[gameweekIndex]?.expectedPoints ?? 0;
}

function formationScore(players: Player[], projections: Map<number, PlayerProjection>, gameweekIndex: number): number {
  return players.reduce((sum, player) => sum + pointsForGameweek(player.id, projections, gameweekIndex), 0);
}

/** Picks the highest-scoring valid starting XI for a specific gameweek from a 15-player squad. */
export function pickBestFormationForGameweek(
  squad: Player[],
  projections: Map<number, PlayerProjection>,
  gameweekIndex: number
): Player[] {
  const byPosition: Record<Position, Player[]> = { GKP: [], DEF: [], MID: [], FWD: [] };
  for (const player of squad) byPosition[player.position].push(player);
  for (const pos of POSITION_ORDER) {
    byPosition[pos].sort((a, b) => pointsForGameweek(b.id, projections, gameweekIndex) - pointsForGameweek(a.id, projections, gameweekIndex));
  }

  const goalkeeper = byPosition.GKP.slice(0, 1);
  let best: { total: number; players: Player[] } = { total: -Infinity, players: [] };

  for (let defenders = 3; defenders <= 5; defenders++) {
    for (let forwards = 1; forwards <= 3; forwards++) {
      const midfielders = 10 - defenders - forwards;
      if (midfielders < 2 || midfielders > 5) continue;
      if (defenders > byPosition.DEF.length || midfielders > byPosition.MID.length || forwards > byPosition.FWD.length) continue;

      const chosen = [
        ...goalkeeper,
        ...byPosition.DEF.slice(0, defenders),
        ...byPosition.MID.slice(0, midfielders),
        ...byPosition.FWD.slice(0, forwards),
      ];
      const total = formationScore(chosen, projections, gameweekIndex);
      if (total > best.total) best = { total, players: chosen };
    }
  }

  return best.players;
}

/** Scores a squad by summing the best valid starting XI for each gameweek in the horizon. */
export function scoreSquadHorizon(players: Player[], projections: Map<number, PlayerProjection>): number {
  const horizonLength = players.length ? (projections.get(players[0].id)?.perGameweek.length ?? 0) : 0;
  let total = 0;

  for (let gameweekIndex = 0; gameweekIndex < horizonLength; gameweekIndex++) {
    const bestFormation = pickBestFormationForGameweek(players, projections, gameweekIndex);
    total += formationScore(bestFormation, projections, gameweekIndex);
  }

  return Math.round(total * 100) / 100;
}

/** Scores a squad from a specific gameweek onward, using the best XI for each event. */
export function scoreSquadFromGameweek(players: Player[], projections: Map<number, PlayerProjection>, startGameweekIndex: number): number {
  const horizonLength = players.length ? (projections.get(players[0].id)?.perGameweek.length ?? 0) : 0;
  let total = 0;

  for (let gameweekIndex = startGameweekIndex; gameweekIndex < horizonLength; gameweekIndex++) {
    const bestFormation = pickBestFormationForGameweek(players, projections, gameweekIndex);
    total += formationScore(bestFormation, projections, gameweekIndex);
  }

  return Math.round(total * 100) / 100;
}
