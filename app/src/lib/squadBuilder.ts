// Builds a full 15-player squad (+ starting XI, captain, vice-captain) from scratch,
// maximising total expected points over the horizon within budget and squad rules.
//
// The primary path uses an exact mixed-integer optimisation model so the squad is
// solved with the same objective as transfer recommendations: maximize the best XI
// for each gameweek across the horizon, subject to budget, position, and club limits.
// A greedy heuristic remains as a fallback if the solver cannot produce a feasible
// answer for some reason.
import type { Player, PlayerProjection, Position, Squad, SquadPlayer } from '../types';
import solver from 'javascript-lp-solver';
import { pickBestFormationForGameweek } from './squadEvaluation';

const SQUAD_SLOTS: Record<Position, number> = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
const MAX_PER_CLUB = 3;
const TOTAL_BUDGET_TENTHS = 1000; // £100.0m

interface OptimizedVariableMap {
  [key: string]: number;
}

/** Weighted ranking that favours next-gameweek expected points over the wider horizon total,
 *  since near-term form/fixtures are more reliable predictors than the full horizon. */
function rankingScore(playerId: number, projections: Map<number, PlayerProjection>): number {
  const proj = projections.get(playerId);
  if (!proj) return 0;
  const nextGw = proj.perGameweek[0]?.expectedPoints ?? 0;
  if (nextGw <= 0 || proj.horizonTotal <= 0) return 0;
  return nextGw * 1000 + proj.horizonTotal;
}

export interface BuiltSquad {
  squad: Squad;
  captainId: number;
  viceCaptainId: number;
  notes: string[];
}

export function buildBestSquad(players: Player[], projections: Map<number, PlayerProjection>): BuiltSquad {
  const exact = buildExactBestSquad(players, projections);
  if (exact) return exact;
  return buildGreedyBestSquad(players, projections);
}

function buildExactBestSquad(players: Player[], projections: Map<number, PlayerProjection>): BuiltSquad | null {
  const eligible = players.filter((p) => !['i', 's', 'u'].includes(p.status) && projections.has(p.id));
  const firstProjection = eligible.length > 0 ? projections.get(eligible[0].id) : undefined;
  const horizonLength = firstProjection?.perGameweek.length ?? 0;
  if (eligible.length < 15 || horizonLength === 0) return null;

  const clubs = new Set(eligible.map((p) => p.teamId));
  const model: {
    optimize: string;
    opType: 'max';
    constraints: Record<string, { equal?: number; max?: number; min?: number }>;
    variables: Record<string, OptimizedVariableMap>;
    ints: Record<string, 1>;
  } = {
    optimize: 'objective',
    opType: 'max',
    constraints: {
      squadSize: { equal: 15 },
      budget: { max: TOTAL_BUDGET_TENTHS },
      squadGKP: { equal: 2 },
      squadDEF: { equal: 5 },
      squadMID: { equal: 5 },
      squadFWD: { equal: 3 },
    },
    variables: {},
    ints: {},
  };

  for (const clubId of clubs) {
    model.constraints[`club_${clubId}`] = { max: MAX_PER_CLUB };
  }

  for (let gw = 0; gw < horizonLength; gw++) {
    model.constraints[`startTotal_${gw}`] = { equal: 11 };
    model.constraints[`startGKP_${gw}`] = { equal: 1 };
    model.constraints[`startDEF_${gw}`] = { min: 3, max: 5 };
    model.constraints[`startMID_${gw}`] = { min: 2, max: 5 };
    model.constraints[`startFWD_${gw}`] = { min: 1, max: 3 };
  }

  for (const player of eligible) {
    const projection = projections.get(player.id);
    if (!projection) continue;

    const squadVar = `squad_${player.id}`;
    model.variables[squadVar] = {
      objective: 0,
      squadSize: 1,
      budget: player.nowCostTenths,
      squadGKP: player.position === 'GKP' ? 1 : 0,
      squadDEF: player.position === 'DEF' ? 1 : 0,
      squadMID: player.position === 'MID' ? 1 : 0,
      squadFWD: player.position === 'FWD' ? 1 : 0,
      [`club_${player.teamId}`]: 1,
    };
    model.ints[squadVar] = 1;

    for (let gw = 0; gw < horizonLength; gw++) {
      const gwPoints = projection.perGameweek[gw]?.expectedPoints ?? 0;
      const startVar = `start_${player.id}_${gw}`;
      const linkConstraint = `link_${player.id}_${gw}`;
      model.constraints[linkConstraint] = { max: 0 };
      model.variables[startVar] = {
        objective: gwPoints,
        startTotal: 1,
        [`startTotal_${gw}`]: 1,
        [`startGKP_${gw}`]: player.position === 'GKP' ? 1 : 0,
        [`startDEF_${gw}`]: player.position === 'DEF' ? 1 : 0,
        [`startMID_${gw}`]: player.position === 'MID' ? 1 : 0,
        [`startFWD_${gw}`]: player.position === 'FWD' ? 1 : 0,
        [linkConstraint]: 1,
      };
      model.variables[squadVar][linkConstraint] = -1;
      model.ints[startVar] = 1;
    }
  }

  const solution = solver.Solve(model) as Record<string, number | boolean | undefined> & { feasible?: boolean; result?: number };
  if (!solution || solution.feasible === false) return null;

  const selectedPlayers = eligible.filter((player) => (Number(solution[`squad_${player.id}`]) || 0) > 0.5);
  if (selectedPlayers.length !== 15) return null;

  const startingXI = selectedPlayers.filter((player) => (Number(solution[`start_${player.id}_0`]) || 0) > 0.5);
  const starterSet = new Set(startingXI.map((player) => player.id));
  const orderedStarters = [...startingXI].sort((a, b) => {
    const aPoints = projections.get(a.id)?.perGameweek[0]?.expectedPoints ?? 0;
    const bPoints = projections.get(b.id)?.perGameweek[0]?.expectedPoints ?? 0;
    if (bPoints !== aPoints) return bPoints - aPoints;
    return (projections.get(b.id)?.horizonTotal ?? 0) - (projections.get(a.id)?.horizonTotal ?? 0);
  });
  const captainId = orderedStarters[0]?.id;
  const viceCaptainId = orderedStarters[1]?.id;

  const squadPlayers: SquadPlayer[] = selectedPlayers.map((player) => ({
    playerId: player.id,
    purchasePrice: player.nowCostTenths,
    inStartingXI: starterSet.has(player.id),
    isCaptain: player.id === captainId,
    isViceCaptain: player.id === viceCaptainId,
  }));

  const notes: string[] = [];
  const captain = players.find((player) => player.id === captainId);
  if (captain) {
    const projection = projections.get(captainId);
    notes.push(`Captain: ${captain.webName} - projected ${projection?.horizonTotal ?? 0} pts over the horizon (doubled while captain).`);
  }
  if (typeof solution.result === 'number') {
    notes.push(`Exact optimizer solved the squad at ${solution.result.toFixed(1)} projected points across the horizon.`);
  } else {
    notes.push('Exact optimizer solved the squad across the horizon objective shared with transfer suggestions.');
  }

  return {
    squad: {
      players: squadPlayers,
      bank: Math.max(0, TOTAL_BUDGET_TENTHS - selectedPlayers.reduce((sum, player) => sum + player.nowCostTenths, 0)),
      freeTransfers: 1,
      chipsAvailable: ['wildcard', 'freehit', 'benchboost', 'triplecaptain'],
      activeChip: null,
    },
    captainId,
    viceCaptainId,
    notes,
  };
}

function buildGreedyBestSquad(players: Player[], projections: Map<number, PlayerProjection>): BuiltSquad {
  const eligible = players.filter((p) => {
    const proj = projections.get(p.id);
    return !['i', 's', 'u'].includes(p.status) && !!proj && proj.horizonTotal > 0;
  });

  const byPosition: Record<Position, Player[]> = { GKP: [], DEF: [], MID: [], FWD: [] };
  for (const p of eligible) byPosition[p.position].push(p);
  for (const pos of Object.keys(byPosition) as Position[]) {
    byPosition[pos].sort((a, b) => rankingScore(b.id, projections) - rankingScore(a.id, projections));
  }

  // Cheapest-available price per position, used to reserve budget for slots not yet filled.
  const cheapestPrice: Record<Position, number> = {
    GKP: Math.min(...byPosition.GKP.map((p) => p.nowCostTenths)),
    DEF: Math.min(...byPosition.DEF.map((p) => p.nowCostTenths)),
    MID: Math.min(...byPosition.MID.map((p) => p.nowCostTenths)),
    FWD: Math.min(...byPosition.FWD.map((p) => p.nowCostTenths)),
  };

  const slotsRemaining: Record<Position, number> = { ...SQUAD_SLOTS };
  const clubCounts = new Map<number, number>();
  const picked: Player[] = [];
  let budgetRemaining = TOTAL_BUDGET_TENTHS;

  const allSortedByValue = [...eligible].sort(
    (a, b) => rankingScore(b.id, projections) - rankingScore(a.id, projections)
  );

  for (const player of allSortedByValue) {
    if (picked.length >= 15) break;
    if (slotsRemaining[player.position] <= 0) continue;
    if ((clubCounts.get(player.teamId) ?? 0) >= MAX_PER_CLUB) continue;

    const otherSlotsReserve = (Object.keys(slotsRemaining) as Position[]).reduce((sum, pos) => {
      const count = pos === player.position ? slotsRemaining[pos] - 1 : slotsRemaining[pos];
      return sum + count * cheapestPrice[pos];
    }, 0);
    if (player.nowCostTenths + otherSlotsReserve > budgetRemaining) continue;

    picked.push(player);
    slotsRemaining[player.position]--;
    clubCounts.set(player.teamId, (clubCounts.get(player.teamId) ?? 0) + 1);
    budgetRemaining -= player.nowCostTenths;
  }

  // Fallback fill: if the value-sorted pass couldn't fill every slot (rare budget edge cases),
  // fill remaining slots with the cheapest eligible players regardless of ranking.
  for (const pos of Object.keys(slotsRemaining) as Position[]) {
    const cheapSorted = [...byPosition[pos]].sort((a, b) => a.nowCostTenths - b.nowCostTenths);
    for (const player of cheapSorted) {
      if (slotsRemaining[pos] <= 0) break;
      if (picked.includes(player)) continue;
      if ((clubCounts.get(player.teamId) ?? 0) >= MAX_PER_CLUB) continue;
      if ((projections.get(player.id)?.horizonTotal ?? 0) <= 0) continue;
      if (player.nowCostTenths > budgetRemaining) continue;
      picked.push(player);
      slotsRemaining[pos]--;
      clubCounts.set(player.teamId, (clubCounts.get(player.teamId) ?? 0) + 1);
      budgetRemaining -= player.nowCostTenths;
    }
  }

  const startingXI = pickBestFormationForGameweek(picked, projections, 0);
  const startingIds = new Set(startingXI.map((p) => p.id));

  const startersRanked = [...startingXI].sort(
    (a, b) => rankingScore(b.id, projections) - rankingScore(a.id, projections)
  );
  const captainId = startersRanked[0]?.id;
  const viceCaptainId = startersRanked[1]?.id;

  const squadPlayers: SquadPlayer[] = picked.map((p) => ({
    playerId: p.id,
    purchasePrice: p.nowCostTenths,
    inStartingXI: startingIds.has(p.id),
    isCaptain: p.id === captainId,
    isViceCaptain: p.id === viceCaptainId,
  }));

  const notes: string[] = [];
  const captain = players.find((p) => p.id === captainId);
  if (captain) {
    const proj = projections.get(captainId);
    notes.push(`Captain: ${captain.webName} - projected ${proj?.horizonTotal ?? 0} pts over the horizon (doubled while captain).`);
  }
  notes.push(`Total squad cost: £${((TOTAL_BUDGET_TENTHS - budgetRemaining) / 10).toFixed(1)}m of £100.0m.`);

  return {
    squad: {
      players: squadPlayers,
      bank: budgetRemaining,
      freeTransfers: 1,
      chipsAvailable: ['wildcard', 'freehit', 'benchboost', 'triplecaptain'],
      activeChip: null,
    },
    captainId,
    viceCaptainId,
    notes,
  };
}

