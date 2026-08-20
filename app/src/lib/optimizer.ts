// Multi-gameweek transfer recommendation engine.
//
// This uses a sequential squad-planning heuristic: repeatedly find the best
// affordable same-position swap, apply it, then re-score the updated squad so
// budget, club-count and bench-order knock-on effects are all reflected in the
// next step.
import type { Player, PlayerProjection, RecommendationResult, Squad, TransferSuggestion } from '../types';
import { pickBestFormationForGameweek, scoreSquadFromGameweek } from './squadEvaluation';

const MAX_PER_CLUB = 3;
const TRANSFER_COST = 4;

export interface RecommendInput {
  squad: Squad;
  players: Map<number, Player>;
  projections: Map<number, PlayerProjection>;
  startGameweek: number;
  maxSuggestions?: number;
  unlimitedTransfers?: boolean;
  preSeason?: boolean;
}

export function recommendTransfers({ squad, players, projections, startGameweek, maxSuggestions = 5, unlimitedTransfers = false, preSeason = false }: RecommendInput): RecommendationResult {
  const notes: string[] = [];
  const currentPlayers = squad.players.map((sp) => players.get(sp.playerId)).filter((player): player is Player => !!player);
  const doNothingBaseline = scoreSquadWindow(currentPlayers, projections, 0, Math.min(3, getProjectionLength(projections)));
  const horizonLength = currentPlayers.length > 0 ? (projections.get(currentPlayers[0].id)?.perGameweek.length ?? 0) : 0;
  const transferBank = createTransferBankState(squad.freeTransfers, horizonLength, preSeason || unlimitedTransfers);

  const suggestions: TransferSuggestion[] = [];
  let workingPlayers = [...currentPlayers];
  let workingSquadPlayers = squad.players.map((sp) => ({ ...sp }));
  let workingBank = squad.bank;
  let hitTaken = false;
  let earliestAllowedGameweek = startGameweek;

  while (suggestions.length < maxSuggestions) {
    const step = findBestTransferStep({
      squad,
      squadPlayers: workingPlayers,
      bank: workingBank,
      projections,
      players,
      allowHit: !unlimitedTransfers && squad.activeChip !== 'wildcard' && squad.activeChip !== 'freehit' && !hitTaken,
      transferBank,
      startGameweek,
      earliestAllowedGameweek,
    });

    if (!step) break;

    if (step.suggestion.transferCost === 0) {
      transferBank.useFreeTransfer(step.suggestion.recommendedGameweek - startGameweek);
    } else if (step.suggestion.transferCost < 0) {
      hitTaken = true;
    }

    suggestions.push(step.suggestion);
    earliestAllowedGameweek = step.suggestion.recommendedGameweek;
    workingPlayers = step.workingPlayers;
    workingSquadPlayers = applySuggestionToSquadPlayers(workingSquadPlayers, players, step.suggestion);

    if (hitTaken) break;
  }

  suggestions.sort((a, b) => {
    if (a.recommendedGameweek !== b.recommendedGameweek) return a.recommendedGameweek - b.recommendedGameweek;
    if (b.netGain !== a.netGain) return b.netGain - a.netGain;
    return b.horizonPointsGain - a.horizonPointsGain;
  });

  const resultingSquad = buildResultingSquad({
    squad,
    squadPlayers: workingSquadPlayers,
    players,
    projections,
    bank: Number.isFinite(workingBank) ? workingBank : squad.bank,
    freeTransfers: transferBank.finalFreeTransfers(),
  });

  if (preSeason || unlimitedTransfers) {
    notes.push("It's before Gameweek 1 deadline - all transfers are free while you set up your squad.");
  } else if (squad.activeChip === 'wildcard' || squad.activeChip === 'freehit') {
    notes.push(`${squad.activeChip === 'wildcard' ? 'Wildcard' : 'Free Hit'} is active this gameweek - all transfers below are free.`);
  } else if (squad.freeTransfers === 0) {
    notes.push('You have 0 free transfers - each transfer below costs -4 points unless you play Wildcard or Free Hit.');
  }
  if (!unlimitedTransfers && !squad.activeChip && squad.chipsAvailable.includes('wildcard')) {
    notes.push('Wildcard is available: it removes the -4 cost per transfer, useful if several swaps are worthwhile at once.');
  }
  notes.push('This is a sequential transfer plan: each step is re-scored after the previous one, so budget, club count and bench order are already accounted for.');
  if (hitTaken) {
    notes.push('A -4 hit is included only when the next move still improves the squad after the hit cost.');
  } else {
    notes.push('No -4 hit is recommended unless a later squad change opens up a better move.');
  }

  return {
    horizonGameweeks: horizonLength,
    freeTransfersAvailable: transferBank.bankByWeek[0] ?? squad.freeTransfers,
    suggestions: suggestions.slice(0, maxSuggestions),
    doNothingBaseline,
    resultingSquad,
    notes,
  };
}

function createTransferBankState(initialTransfers: number, horizonLength: number, setupMode: boolean) {
  const bankByWeek = Array.from({ length: Math.max(1, horizonLength) }, () => 0);
  const usedFreeTransfersByWeek = Array.from({ length: Math.max(1, horizonLength) }, () => 0);

  function recompute() {
    let bank = setupMode ? 1 : Math.max(0, initialTransfers);
    for (let week = 0; week < bankByWeek.length; week++) {
      if (setupMode && week === 0) {
        bankByWeek[week] = Number.POSITIVE_INFINITY;
        continue;
      }

      bankByWeek[week] = bank;
      const previousWeek = Math.max(0, week - 1);
      bank = Math.min(5, Math.max(0, bank - usedFreeTransfersByWeek[previousWeek]) + 1);
    }
  }

  function useFreeTransfer(weekIndex: number) {
    if (weekIndex < 0 || weekIndex >= usedFreeTransfersByWeek.length) return;
    if (setupMode && weekIndex === 0) return;
    usedFreeTransfersByWeek[weekIndex]++;
    recompute();
  }

  function finalFreeTransfers() {
    return bankByWeek.length > 0 ? bankByWeek[bankByWeek.length - 1] : Math.max(0, initialTransfers);
  }

  recompute();

  return {
    bankByWeek,
    usedFreeTransfersByWeek,
    useFreeTransfer,
    finalFreeTransfers,
  };
}

interface BestTransferStep {
  suggestion: TransferSuggestion;
  workingPlayers: Player[];
  workingBank: number;
}

function findBestTransferStep({
  squad,
  squadPlayers,
  bank,
  projections,
  players,
  allowHit,
  transferBank,
  startGameweek,
  earliestAllowedGameweek,
}: {
  squad: Squad;
  squadPlayers: Player[];
  bank: number;
  projections: Map<number, PlayerProjection>;
  players: Map<number, Player>;
  allowHit: boolean;
  transferBank: {
    bankByWeek: number[];
    usedFreeTransfersByWeek: number[];
  };
  startGameweek: number;
  earliestAllowedGameweek: number;
}): BestTransferStep | null {
  const squadIds = new Set(squadPlayers.map((p) => p.id));
  const clubCounts = new Map<number, number>();
  for (const player of squadPlayers) clubCounts.set(player.teamId, (clubCounts.get(player.teamId) ?? 0) + 1);

  const baselineScore = scoreSquadWindow(squadPlayers, projections, 0, Math.min(3, projections.values().next().value?.perGameweek.length ?? 0));
  let best: BestTransferStep | null = null;

  for (const outPlayer of squadPlayers) {
    const outProjection = projections.get(outPlayer.id);
    if (!outProjection) continue;

    const budget = bank + (players.get(outPlayer.id)?.nowCostTenths ?? 0);

    for (const candidate of projections.values()) {
      if (squadIds.has(candidate.playerId)) continue;
      if (candidate.position !== outPlayer.position) continue;
      if ((candidate.perGameweek[0]?.expectedPoints ?? 0) <= 0) continue;
      if (candidate.horizonTotal <= 0) continue;
      if (candidate.priceNowTenths > budget) continue;

      const candidatePlayer = players.get(candidate.playerId);
      if (!candidatePlayer) continue;

      const outgoingClubCount = clubCounts.get(outPlayer.teamId) ?? 0;
      const incomingClubCount = clubCounts.get(candidatePlayer.teamId) ?? 0;
      const projectedClubCount = candidatePlayer.teamId === outPlayer.teamId ? outgoingClubCount : incomingClubCount + 1;
      if (projectedClubCount > MAX_PER_CLUB) continue;

      const hypotheticalPlayers = squadPlayers.map((player) => (player.id === outPlayer.id ? candidatePlayer : player));
      const hypotheticalScore = scoreSquadWindow(hypotheticalPlayers, projections, 0, Math.min(3, getProjectionLength(projections)));
      const horizonPointsGain = round2(hypotheticalScore - baselineScore);
      if (horizonPointsGain <= 0) continue;

      const recommendedGameweek = findBestTransferGameweek({
        squad,
        suggestion: {
          out: { playerId: outPlayer.id, webName: outPlayer.webName },
          in: { playerId: candidatePlayer.id, webName: candidatePlayer.webName, priceTenths: candidatePlayer.nowCostTenths },
          horizonPointsGain,
          transferCost: 0,
          netGain: horizonPointsGain,
          recommendedGameweek: 1,
          reason: '',
        },
        projections,
        players,
        horizonLength: Math.min(3, outProjection.perGameweek.length),
        startGameweek,
        earliestAllowedGameweek,
      });

      const weekIndex = Math.max(0, recommendedGameweek - startGameweek);
      const freeTransfersAvailable = transferBank.bankByWeek[weekIndex] ?? 0;
      const freeTransfersUsed = transferBank.usedFreeTransfersByWeek[weekIndex] ?? 0;
      const transferCost = freeTransfersAvailable > freeTransfersUsed ? 0 : allowHit ? -TRANSFER_COST : Number.NEGATIVE_INFINITY;
      const netGain = round2(horizonPointsGain + transferCost);
      if (netGain <= 0) continue;

      const suggestion: TransferSuggestion = {
        out: { playerId: outPlayer.id, webName: outPlayer.webName },
        in: { playerId: candidatePlayer.id, webName: candidatePlayer.webName, priceTenths: candidatePlayer.nowCostTenths },
        horizonPointsGain,
        transferCost,
        netGain,
        recommendedGameweek,
        reason: buildReason(candidatePlayer.webName, outProjection, candidate, hypotheticalScore, baselineScore, transferCost, recommendedGameweek, startGameweek),
      };

      if (!best || suggestion.netGain > best.suggestion.netGain) {
        best = {
          suggestion,
          workingPlayers: hypotheticalPlayers,
          workingBank: bank + (players.get(outPlayer.id)?.nowCostTenths ?? 0) - candidatePlayer.nowCostTenths,
        };
      }
    }
  }

  return best;
}

function findBestTransferGameweek({
  squad,
  suggestion,
  projections,
  players,
  horizonLength,
  startGameweek,
  earliestAllowedGameweek,
}: {
  squad: Squad;
  suggestion: TransferSuggestion;
  projections: Map<number, PlayerProjection>;
  players: Map<number, Player>;
  horizonLength: number;
  startGameweek: number;
  earliestAllowedGameweek: number; // Pass earliest allowed gameweek
}): number {
  const basePlayers = squad.players.map((sp) => players.get(sp.playerId)).filter((player): player is Player => !!player);
  let bestGameweek = Math.max(startGameweek, earliestAllowedGameweek);
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let gw = Math.max(0, earliestAllowedGameweek - startGameweek); gw < horizonLength; gw++) {
    const modifiedPlayers = basePlayers
      .map((player) => (player.id === suggestion.out.playerId ? players.get(suggestion.in.playerId) ?? player : player))
      .filter((player): player is Player => !!player);
    const beforeScore = scoreSquadFromGameweek(basePlayers, projections, gw);
    const afterScore = scoreSquadFromGameweek(modifiedPlayers, projections, gw);
    const delta = afterScore - beforeScore;
    if (delta > bestScore) {
      bestScore = delta;
      bestGameweek = startGameweek + gw;
    }
  }

  return bestGameweek;
}

function buildReason(
  inName: string,
  outProj: PlayerProjection,
  inProj: PlayerProjection,
  hypotheticalScore: number,
  baselineScore: number,
  transferCost: number,
  recommendedGameweek: number,
  startGameweek: number
): string {
  const weekIndex = Math.max(0, recommendedGameweek - startGameweek);
  const outNext = outProj.perGameweek[weekIndex];
  const inNext = inProj.perGameweek[weekIndex];
  const costText = transferCost === 0 ? 'with a free transfer' : 'after a -4 hit';
  return `${inName} improves the squad's best-XI horizon score from ${baselineScore} to ${hypotheticalScore} ${costText}. Best made in Gameweek ${recommendedGameweek} - next fixture difficulty ${inNext?.fixtureDifficulty ?? '?'} vs ${outNext?.fixtureDifficulty ?? '?'}.`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function scoreSquadWindow(players: Player[], projections: Map<number, PlayerProjection>, startGameweekIndex: number, windowLength: number): number {
  const horizonLength = getProjectionLength(projections);
  const end = Math.min(horizonLength, startGameweekIndex + windowLength);
  let total = 0;

  for (let gameweekIndex = startGameweekIndex; gameweekIndex < end; gameweekIndex++) {
    const bestFormation = pickBestFormationForGameweek(players, projections, gameweekIndex);
    total += bestFormation.reduce((sum, player) => sum + (projections.get(player.id)?.perGameweek[gameweekIndex]?.expectedPoints ?? 0), 0);
  }

  return Math.round(total * 100) / 100;
}

function getProjectionLength(projections: Map<number, PlayerProjection>): number {
  const firstProjection = projections.values().next().value as PlayerProjection | undefined;
  return firstProjection?.perGameweek.length ?? 0;
}

function applySuggestionToSquadPlayers(
  squadPlayers: { playerId: number; purchasePrice: number; inStartingXI: boolean; isCaptain?: boolean; isViceCaptain?: boolean }[],
  players: Map<number, Player>,
  suggestion: TransferSuggestion
): { playerId: number; purchasePrice: number; inStartingXI: boolean; isCaptain?: boolean; isViceCaptain?: boolean }[] {
  const outgoingPlayer = players.get(suggestion.out.playerId);
  const incomingPlayer = players.get(suggestion.in.playerId);
  if (!outgoingPlayer || !incomingPlayer) return squadPlayers;

  const next = squadPlayers
    .filter((sp) => sp.playerId !== outgoingPlayer.id)
    .map((sp) => ({
      ...sp,
      isCaptain: false,
      isViceCaptain: false,
    }));

  next.push({
    playerId: incomingPlayer.id,
    purchasePrice: suggestion.in.priceTenths,
    inStartingXI: false,
    isCaptain: false,
    isViceCaptain: false,
  });

  return next;
}

function buildResultingSquad({
  squad,
  squadPlayers,
  players,
  projections,
  bank,
  freeTransfers,
}: {
  squad: Squad;
  squadPlayers: { playerId: number; purchasePrice: number; inStartingXI: boolean; isCaptain?: boolean; isViceCaptain?: boolean }[];
  players: Map<number, Player>;
  projections: Map<number, PlayerProjection>;
  bank: number;
  freeTransfers: number;
}): Squad {
  const playerObjects = squadPlayers.map((sp) => players.get(sp.playerId)).filter((player): player is Player => !!player);
  const bestFormation = playerObjects.length === 15 ? pickBestFormationForGameweek(playerObjects, projections, 0) : [];
  const starterIds = new Set(bestFormation.map((player) => player.id));
  const startersRanked = [...bestFormation].sort((a, b) => {
    const aPoints = projections.get(a.id)?.perGameweek[0]?.expectedPoints ?? 0;
    const bPoints = projections.get(b.id)?.perGameweek[0]?.expectedPoints ?? 0;
    if (bPoints !== aPoints) return bPoints - aPoints;
    return (projections.get(b.id)?.horizonTotal ?? 0) - (projections.get(a.id)?.horizonTotal ?? 0);
  });
  const captainId = startersRanked[0]?.id;
  const viceCaptainId = startersRanked[1]?.id;

  return {
    ...squad,
    bank: Math.max(0, bank),
    freeTransfers: Math.max(0, freeTransfers),
    players: squadPlayers.map((sp) => ({
      ...sp,
      inStartingXI: starterIds.has(sp.playerId),
      isCaptain: sp.playerId === captainId,
      isViceCaptain: sp.playerId === viceCaptainId,
    })),
  };
}
