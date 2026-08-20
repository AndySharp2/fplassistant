import type { Player, PlayerProjection, Position } from '../types';

const POSITION_ORDER: Position[] = ['GKP', 'DEF', 'MID', 'FWD'];

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
