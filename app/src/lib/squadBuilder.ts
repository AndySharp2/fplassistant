// Builds a full 15-player squad (+ starting XI, captain, vice-captain) from scratch.
//
// The objective is deliberately the same one the transfer optimiser uses: the sum of the
// best legal starting XI for each gameweek in the horizon. That means bench players are
// only worth what they contribute when they actually start, and a squad is judged over
// the whole horizon rather than the next gameweek alone.
//
// Construction is a hill climb from a guaranteed-legal base rather than an exact solve.
// An earlier mixed-integer model was tried here but produced ~2,400 integer variables for
// a full player pool, took ~100s and never returned a usable answer, so every build fell
// through to the heuristic anyway.
import type { Player, PlayerProjection, Position, Squad, SquadPlayer } from '../types';
import { pickBestFormationForGameweek, scoreSquadFromGameweek, validateFullSquad } from './squadEvaluation';

const SQUAD_SLOTS: Record<Position, number> = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
const MAX_PER_CLUB = 3;
const TOTAL_BUDGET_TENTHS = 1000; // £100.0m

// Scoring the full squad for every affordable player in the league would be ~9,000
// evaluations per pass. Candidates are ordered by horizon points, so the best available
// upgrade for a slot is near the front of the list; this caps the work without
// meaningfully changing the outcome.
const CANDIDATES_PER_POSITION = 30;
const FUNDED_CANDIDATES_PER_POSITION = 12;
const MAX_UPGRADE_PASSES = 80;
const MAX_TIE_BREAK_PASSES = 20;

export interface BuiltSquad {
  squad: Squad;
  captainId: number;
  viceCaptainId: number;
  notes: string[];
}

function horizonPoints(playerId: number, projections: Map<number, PlayerProjection>): number {
  return projections.get(playerId)?.horizonTotal ?? 0;
}

function nextGameweekPoints(playerId: number, projections: Map<number, PlayerProjection>): number {
  return projections.get(playerId)?.perGameweek[0]?.expectedPoints ?? 0;
}

function applySwap(
  picked: Player[],
  pickedIds: Set<number>,
  clubCounts: Map<number, number>,
  outIndex: number,
  incoming: Player
): void {
  const outgoing = picked[outIndex];
  picked[outIndex] = incoming;
  pickedIds.delete(outgoing.id);
  pickedIds.add(incoming.id);
  clubCounts.set(outgoing.teamId, (clubCounts.get(outgoing.teamId) ?? 1) - 1);
  clubCounts.set(incoming.teamId, (clubCounts.get(incoming.teamId) ?? 0) + 1);
}

function isSwapLegal(
  outgoing: Player,
  incoming: Player,
  pickedIds: Set<number>,
  clubCounts: Map<number, number>
): boolean {
  if (pickedIds.has(incoming.id)) return false;
  const incomingClubCount = clubCounts.get(incoming.teamId) ?? 0;
  const projected = incoming.teamId === outgoing.teamId ? incomingClubCount : incomingClubCount + 1;
  return projected <= MAX_PER_CLUB;
}

interface FundedSwap {
  upgrade: { outIndex: number; incoming: Player; released: number };
  downgrade: { outIndex: number; incoming: Player; released: number };
  gain: number;
}

/** Finds the best pair of "sell one slot down to buy another up" moves. Funding candidates
 *  are limited to the cheapest legal option per slot, which is where the money realistically
 *  comes from, keeping this to a few thousand evaluations rather than hundreds of thousands. */
function findFundedSwap(
  picked: Player[],
  byPosition: Record<Position, Player[]>,
  pickedIds: Set<number>,
  clubCounts: Map<number, number>,
  budgetRemaining: number,
  projections: Map<number, PlayerProjection>,
  baseline: number
): FundedSwap | null {
  const downgrades: Array<{ outIndex: number; incoming: Player; released: number }> = [];
  for (let outIndex = 0; outIndex < picked.length; outIndex++) {
    const outgoing = picked[outIndex];
    let cheapest: Player | null = null;
    for (const candidate of byPosition[outgoing.position]) {
      if (candidate.nowCostTenths >= outgoing.nowCostTenths) continue;
      if (!isSwapLegal(outgoing, candidate, pickedIds, clubCounts)) continue;
      if (!cheapest || candidate.nowCostTenths < cheapest.nowCostTenths) cheapest = candidate;
    }
    if (cheapest) downgrades.push({ outIndex, incoming: cheapest, released: outgoing.nowCostTenths - cheapest.nowCostTenths });
  }
  if (downgrades.length === 0) return null;

  let best: FundedSwap | null = null;

  for (const downgrade of downgrades) {
    const funded = budgetRemaining + downgrade.released;

    for (let outIndex = 0; outIndex < picked.length; outIndex++) {
      if (outIndex === downgrade.outIndex) continue;
      const outgoing = picked[outIndex];
      const affordable = funded + outgoing.nowCostTenths;
      let evaluated = 0;

      for (const incoming of byPosition[outgoing.position]) {
        if (evaluated >= FUNDED_CANDIDATES_PER_POSITION) break;
        if (incoming.nowCostTenths > affordable) continue;
        if (incoming.nowCostTenths <= outgoing.nowCostTenths) continue;
        if (!isSwapLegal(outgoing, incoming, pickedIds, clubCounts)) continue;
        if (incoming.id === downgrade.incoming.id) continue;

        evaluated++;
        const hypothetical = picked.slice();
        hypothetical[downgrade.outIndex] = downgrade.incoming;
        hypothetical[outIndex] = incoming;
        const gain = scoreSquadFromGameweek(hypothetical, projections, 0) - baseline;
        if (gain <= 0) continue;
        if (!best || gain > best.gain) {
          best = {
            upgrade: { outIndex, incoming, released: outgoing.nowCostTenths - incoming.nowCostTenths },
            downgrade,
            gain,
          };
        }
      }
    }
  }

  return best;
}

/** The objective only counts the best XI, so a slot that never reaches it - the reserve
 *  keeper above all - scores the same whoever fills it and the climb has no reason to prefer
 *  one player over another. This pass settles those ties on horizon points, so the bench
 *  holds the strongest legal option it can afford. Swaps that move the objective at all are
 *  rejected, so this can only ever change players the squad score is indifferent to. */
function applyBenchTieBreaks(
  picked: Player[],
  byPosition: Record<Position, Player[]>,
  pickedIds: Set<number>,
  clubCounts: Map<number, number>,
  budgetRemaining: number,
  projections: Map<number, PlayerProjection>
): number {
  let remaining = budgetRemaining;

  for (let pass = 0; pass < MAX_TIE_BREAK_PASSES; pass++) {
    const baseline = scoreSquadFromGameweek(picked, projections, 0);
    let best: { outIndex: number; incoming: Player; gain: number } | null = null;

    for (let outIndex = 0; outIndex < picked.length; outIndex++) {
      const outgoing = picked[outIndex];
      const outgoingHorizon = horizonPoints(outgoing.id, projections);
      const affordable = remaining + outgoing.nowCostTenths;

      // Candidates are ordered by horizon points, so the first affordable one that leaves the
      // objective alone is the best available for this slot. No cap here: the strongest option
      // a bench slot can afford sits far down a list sorted by points.
      for (const incoming of byPosition[outgoing.position]) {
        if (horizonPoints(incoming.id, projections) <= outgoingHorizon) break;
        if (incoming.nowCostTenths > affordable) continue;
        if (!isSwapLegal(outgoing, incoming, pickedIds, clubCounts)) continue;

        const hypothetical = picked.slice();
        hypothetical[outIndex] = incoming;
        if (Math.abs(scoreSquadFromGameweek(hypothetical, projections, 0) - baseline) > 1e-9) continue;

        const gain = horizonPoints(incoming.id, projections) - outgoingHorizon;
        if (!best || gain > best.gain) best = { outIndex, incoming, gain };
        break;
      }
    }

    if (!best) break;
    const outgoing = picked[best.outIndex];
    remaining += outgoing.nowCostTenths - best.incoming.nowCostTenths;
    applySwap(picked, pickedIds, clubCounts, best.outIndex, best.incoming);
  }

  return remaining;
}

export function buildBestSquad(players: Player[], projections: Map<number, PlayerProjection>): BuiltSquad {
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const built = buildSquadByUpgrade(players, projections);

  const issues = validateFullSquad(built.squad.players, playerMap);
  if (issues.length > 0) {
    built.notes.push(`Warning: could not build a fully legal squad from the available player pool. ${issues.join(' ')}`);
  }
  return built;
}

function buildSquadByUpgrade(players: Player[], projections: Map<number, PlayerProjection>): BuiltSquad {
  const eligible = players.filter((p) => {
    const proj = projections.get(p.id);
    if (!proj || ['i', 's', 'u'].includes(p.status) || proj.horizonTotal <= 0) return false;
    // Bench fodder still has to be someone who plays - an auto-sub only pays out if the
    // replacement is on the pitch. 'unknown' means the line-up snapshot is stale or missing,
    // in which case there is nothing to filter on.
    return proj.scoutStatus !== 'bench';
  });

  const byPosition: Record<Position, Player[]> = { GKP: [], DEF: [], MID: [], FWD: [] };
  for (const p of eligible) byPosition[p.position].push(p);

  const positions = Object.keys(SQUAD_SLOTS) as Position[];
  const clubCounts = new Map<number, number>();
  const picked: Player[] = [];
  let spend = 0;

  // Phase 1: cheapest legal 15. Starting from a guaranteed-feasible squad makes the
  // 15-player, position-split, club-limit and budget rules impossible to break, and leaves
  // the maximum budget free for the upgrade pass to spend where it actually scores.
  for (const pos of positions) {
    const cheapestFirst = [...byPosition[pos]].sort((a, b) => a.nowCostTenths - b.nowCostTenths);
    let needed = SQUAD_SLOTS[pos];
    for (const player of cheapestFirst) {
      if (needed === 0) break;
      if ((clubCounts.get(player.teamId) ?? 0) >= MAX_PER_CLUB) continue;
      picked.push(player);
      clubCounts.set(player.teamId, (clubCounts.get(player.teamId) ?? 0) + 1);
      spend += player.nowCostTenths;
      needed--;
    }
  }

  // Candidates are tried best-first so the per-slot cap keeps the strongest options.
  for (const pos of positions) {
    byPosition[pos].sort((a, b) => horizonPoints(b.id, projections) - horizonPoints(a.id, projections));
  }

  // Phase 2: repeatedly apply the single swap that most improves the best-XI-over-horizon
  // score. Because a benched player contributes nothing to that score, spending is drawn
  // towards players who will actually start, and the bench stays cheap on its own.
  const pickedIds = new Set(picked.map((p) => p.id));
  let budgetRemaining = TOTAL_BUDGET_TENTHS - spend;

  for (let pass = 0; pass < MAX_UPGRADE_PASSES; pass++) {
    const baseline = scoreSquadFromGameweek(picked, projections, 0);
    let bestSwap: { outIndex: number; incoming: Player; gain: number } | null = null;

    for (let outIndex = 0; outIndex < picked.length; outIndex++) {
      const outgoing = picked[outIndex];
      const affordable = budgetRemaining + outgoing.nowCostTenths;
      let evaluated = 0;

      for (const incoming of byPosition[outgoing.position]) {
        if (evaluated >= CANDIDATES_PER_POSITION) break;
        if (pickedIds.has(incoming.id)) continue;
        if (incoming.nowCostTenths > affordable) continue;

        const incomingClubCount = clubCounts.get(incoming.teamId) ?? 0;
        const projectedClubCount = incoming.teamId === outgoing.teamId ? incomingClubCount : incomingClubCount + 1;
        if (projectedClubCount > MAX_PER_CLUB) continue;

        evaluated++;
        const hypothetical = picked.slice();
        hypothetical[outIndex] = incoming;
        const gain = scoreSquadFromGameweek(hypothetical, projections, 0) - baseline;
        if (gain <= 0) continue;
        if (!bestSwap || gain > bestSwap.gain) bestSwap = { outIndex, incoming, gain };
      }
    }

    if (!bestSwap) {
      // A single swap has to pay for itself out of the bank, so once the budget is spent the
      // climb stalls even when trading a mid-price starter down would fund a much better
      // player elsewhere. This pass looks for exactly that pair.
      const fundedSwap = findFundedSwap(picked, byPosition, pickedIds, clubCounts, budgetRemaining, projections, baseline);
      if (!fundedSwap) break;
      applySwap(picked, pickedIds, clubCounts, fundedSwap.downgrade.outIndex, fundedSwap.downgrade.incoming);
      applySwap(picked, pickedIds, clubCounts, fundedSwap.upgrade.outIndex, fundedSwap.upgrade.incoming);
      budgetRemaining +=
        fundedSwap.downgrade.released + fundedSwap.upgrade.released;
      continue;
    }

    const outgoing = picked[bestSwap.outIndex];
    budgetRemaining += outgoing.nowCostTenths - bestSwap.incoming.nowCostTenths;
    applySwap(picked, pickedIds, clubCounts, bestSwap.outIndex, bestSwap.incoming);
  }

  budgetRemaining = applyBenchTieBreaks(picked, byPosition, pickedIds, clubCounts, budgetRemaining, projections);

  const startingXI = pickBestFormationForGameweek(picked, projections, 0);
  const startingIds = new Set(startingXI.map((p) => p.id));

  // Captaincy is a next-gameweek decision, so it ranks on that rather than the horizon.
  const startersRanked = [...startingXI].sort(
    (a, b) => nextGameweekPoints(b.id, projections) - nextGameweekPoints(a.id, projections)
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
    notes.push(
      `Captain: ${captain.webName} - ${nextGameweekPoints(captainId, projections).toFixed(1)} xPts this gameweek (doubled while captain).`
    );
  }
  notes.push(
    `Projected ${scoreSquadFromGameweek(picked, projections, 0).toFixed(1)} pts from the best XI across the horizon.`
  );
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
