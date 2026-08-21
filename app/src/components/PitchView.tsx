import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Star, X } from 'lucide-react';
import { PlayerShirt } from './PlayerShirt';
import { useAppData } from '../context/AppDataContext';
import { fdrStyle } from '../lib/ui';
import type { Position, Squad } from '../types';
import { pickBestFormationForGameweek } from '../lib/squadEvaluation';

const POSITION_ORDER: Position[] = ['GKP', 'DEF', 'MID', 'FWD'];

function cardClassName(benchCard: boolean, candidate: boolean, source: boolean) {
  const base = `flex w-[96px] flex-col items-center gap-1 rounded-[14px] border px-1.5 py-2 text-center backdrop-blur-md transition ${
    benchCard ? 'border-white/[0.06] bg-[rgba(6,2,10,0.5)]' : 'border-white/[0.08] bg-[rgba(6,2,10,0.62)] shadow-[0_10px_24px_rgba(0,0,0,0.38)]'
  }`;
  const state = candidate ? 'ring-2 ring-[#00ff87] cursor-pointer' : 'cursor-grab';
  const sourceState = source ? 'ring-2 ring-[#ffb86c]' : '';
  return `${base} ${state} ${sourceState}`;
}

type PendingSwap = {
  playerId: number;
  direction: 'toStarting' | 'toBench';
} | null;

export function PitchView({
  squad,
  updateSquad,
  onRemovePlayer,
  selectedGameweekIndex,
  onBeginSwap,
  pendingSwap,
  onClearSwap,
}: {
  squad: Squad;
  updateSquad: (fn: (prev: Squad) => Squad) => void;
  onRemovePlayer: (playerId: number) => void;
  selectedGameweekIndex: number;
  onBeginSwap: (playerId: number, direction: 'toStarting' | 'toBench') => void;
  pendingSwap: PendingSwap;
  onClearSwap: () => void;
}) {
  const { playersById, teamsById, projections, currentEvent, horizonGameweeks } = useAppData();
  const [dragOverRow, setDragOverRow] = useState<Position | 'bench' | null>(null);
  const [lineupLocked, setLineupLocked] = useState(false);
  const currentGameweek = currentEvent + selectedGameweekIndex;

  function xPts(playerId: number): number {
    return projections.get(playerId)?.perGameweek[selectedGameweekIndex]?.expectedPoints ?? 0;
  }

  function horizonPts(playerId: number): number {
    const perGameweek = projections.get(playerId)?.perGameweek ?? [];
    return perGameweek.slice(selectedGameweekIndex, selectedGameweekIndex + horizonGameweeks).reduce((sum, gw) => sum + gw.expectedPoints, 0);
  }

  const playerObjects = squad.players.map((sp) => playersById.get(sp.playerId)).filter((player): player is NonNullable<typeof player> => !!player);
  const bestFormation = useMemo(() => pickBestFormationForGameweek(playerObjects, projections, selectedGameweekIndex), [playerObjects, projections, selectedGameweekIndex]);
  const bestFormationIds = new Set(bestFormation.map((player) => player.id));
  const lineupIds = lineupLocked ? new Set(squad.players.filter((sp) => sp.inStartingXI).map((sp) => sp.playerId)) : bestFormationIds;
  const startingPositionCounts = useMemo(() => {
    const counts: Record<Position, number> = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const sp of squad.players) {
      if (!lineupIds.has(sp.playerId)) continue;
      const player = playersById.get(sp.playerId);
      if (player) counts[player.position]++;
    }
    return counts;
  }, [lineupIds, playersById, squad.players]);

  useEffect(() => {
    if (pendingSwap) setLineupLocked(true);
  }, [pendingSwap]);
  const rankedStarters = useMemo(() => {
    const starterPlayers = squad.players
      .filter((sp) => lineupIds.has(sp.playerId))
      .map((sp) => playersById.get(sp.playerId))
      .filter((player): player is NonNullable<typeof player> => !!player);
    return [...starterPlayers].sort((a, b) => {
      const aPoints = projections.get(a.id)?.perGameweek[selectedGameweekIndex]?.expectedPoints ?? 0;
      const bPoints = projections.get(b.id)?.perGameweek[selectedGameweekIndex]?.expectedPoints ?? 0;
      if (bPoints !== aPoints) return bPoints - aPoints;
      return (projections.get(b.id)?.horizonTotal ?? 0) - (projections.get(a.id)?.horizonTotal ?? 0);
    });
  }, [lineupIds, playersById, projections, squad.players, selectedGameweekIndex]);
  const captainId = rankedStarters[0]?.id;
  const viceCaptainId = rankedStarters[1]?.id;

  useEffect(() => {
    if (lineupLocked) return;
    updateSquad((prev) => {
      const nextPlayers = prev.players.map((sp) => ({
        ...sp,
        inStartingXI: bestFormationIds.has(sp.playerId),
        isCaptain: sp.playerId === captainId,
        isViceCaptain: sp.playerId === viceCaptainId,
      }));
      const changed = nextPlayers.some((sp, index) => {
        const current = prev.players[index];
        return !current || current.inStartingXI !== sp.inStartingXI || current.isCaptain !== sp.isCaptain || current.isViceCaptain !== sp.isViceCaptain;
      });
      if (!changed) return prev;
      return { ...prev, players: nextPlayers };
    });
  }, [bestFormationIds, captainId, viceCaptainId, lineupLocked, updateSquad]);

  const starters = squad.players.filter((sp) => lineupIds.has(sp.playerId));
  const bench = squad.players
    .filter((sp) => !lineupIds.has(sp.playerId))
    .sort((a, b) => {
      const pa = playersById.get(a.playerId)?.position;
      const pb = playersById.get(b.playerId)?.position;
      if (pa !== pb) return POSITION_ORDER.indexOf(pa ?? 'FWD') - POSITION_ORDER.indexOf(pb ?? 'FWD');
      return xPts(b.playerId) - xPts(a.playerId);
    });

  const rows = useMemo(() => {
    const byPos: Record<Position, typeof starters> = { GKP: [], DEF: [], MID: [], FWD: [] };
    for (const sp of starters) {
      const pos = playersById.get(sp.playerId)?.position;
      if (pos) byPos[pos].push(sp);
    }
    return byPos;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starters, playersById]);

  const teamNextGwPts = bestFormation.reduce((sum, player) => sum + xPts(player.id), 0);
  const teamHorizonPts = bestFormation.reduce((sum, player) => sum + horizonPts(player.id), 0);

  function canLegalSwap(sourceId: number, targetId: number): boolean {
    const source = squad.players.find((sp) => sp.playerId === sourceId);
    const target = squad.players.find((sp) => sp.playerId === targetId);
    const sourcePlayer = playersById.get(sourceId);
    const targetPlayer = playersById.get(targetId);
    if (!source || !target || !sourcePlayer || !targetPlayer) return false;
    if (source.inStartingXI === target.inStartingXI) return false;

    const nextCounts: Record<Position, number> = { ...startingPositionCounts };
    if (source.inStartingXI) {
      nextCounts[sourcePlayer.position]--;
      nextCounts[targetPlayer.position]++;
    } else {
      nextCounts[sourcePlayer.position]++;
      nextCounts[targetPlayer.position]--;
    }

    return nextCounts.GKP === 1 && nextCounts.DEF >= 3 && nextCounts.DEF <= 5 && nextCounts.MID >= 3 && nextCounts.MID <= 5 && nextCounts.FWD >= 1 && nextCounts.FWD <= 3;
  }

  function commitSwap(targetId: number) {
    if (!pendingSwap) return;
    const sourceId = pendingSwap.playerId;
    if (!canLegalSwap(sourceId, targetId)) return;

    updateSquad((prev) => {
      const source = prev.players.find((sp) => sp.playerId === sourceId);
      const target = prev.players.find((sp) => sp.playerId === targetId);
      if (!source || !target) return prev;
      return {
        ...prev,
        players: prev.players.map((sp) => {
          if (sp.playerId === sourceId) {
            return {
              ...sp,
              inStartingXI: target.inStartingXI,
              isCaptain: target.isCaptain,
              isViceCaptain: target.isViceCaptain,
            };
          }
          if (sp.playerId === targetId) {
            return {
              ...sp,
              inStartingXI: source.inStartingXI,
              isCaptain: source.isCaptain,
              isViceCaptain: source.isViceCaptain,
            };
          }
          return sp;
        }),
      };
    });
    onClearSwap();
  }

  function isSwapCandidate(playerId: number): boolean {
    if (!pendingSwap) return false;
    const squadPlayer = squad.players.find((sp) => sp.playerId === playerId);
    if (!squadPlayer) return false;
    if (pendingSwap.direction === 'toStarting' && squadPlayer.inStartingXI) {
      return canLegalSwap(pendingSwap.playerId, playerId);
    }
    if (pendingSwap.direction === 'toBench' && !squadPlayer.inStartingXI) {
      return canLegalSwap(pendingSwap.playerId, playerId);
    }
    return false;
  }

  function swapIntoStarting(position: Position, incomingPlayerId: number) {
    setLineupLocked(true);
    updateSquad((prev) => {
      const currentStarters = prev.players.filter(
        (sp) => sp.inStartingXI && playersById.get(sp.playerId)?.position === position
      );
      if (currentStarters.length === 0) return prev;
      const weakest = [...currentStarters].sort((a, b) => xPts(a.playerId) - xPts(b.playerId))[0];
      if (weakest.playerId === incomingPlayerId) return prev;
      return {
        ...prev,
        players: prev.players.map((sp) => {
          if (sp.playerId === incomingPlayerId) return { ...sp, inStartingXI: true };
          if (sp.playerId === weakest.playerId) return { ...sp, inStartingXI: false, isCaptain: false, isViceCaptain: false };
          return sp;
        }),
      };
    });
  }

  function swapToBench(outgoingPlayerId: number) {
    setLineupLocked(true);
    updateSquad((prev) => {
      const outgoing = prev.players.find((sp) => sp.playerId === outgoingPlayerId);
      const position = playersById.get(outgoingPlayerId)?.position;
      if (!outgoing || !position) return prev;
      const benchOfSamePos = prev.players
        .filter((sp) => !sp.inStartingXI && playersById.get(sp.playerId)?.position === position)
        .sort((a, b) => xPts(b.playerId) - xPts(a.playerId));
      const promoted = benchOfSamePos[0];
      if (!promoted) return prev;
      return {
        ...prev,
        players: prev.players.map((sp) => {
          if (sp.playerId === outgoingPlayerId) return { ...sp, inStartingXI: false, isCaptain: false, isViceCaptain: false };
          if (sp.playerId === promoted.playerId) return { ...sp, inStartingXI: true };
          return sp;
        }),
      };
    });
  }

  function setCaptain(playerId: number, vice: boolean) {
    setLineupLocked(true);
    updateSquad((prev) => ({
      ...prev,
      players: prev.players.map((sp) => {
        if (vice) return { ...sp, isViceCaptain: sp.playerId === playerId };
        return { ...sp, isCaptain: sp.playerId === playerId };
      }),
    }));
  }

  function handleDragStart(e: React.DragEvent, playerId: number) {
    setLineupLocked(true);
    e.dataTransfer.setData('text/plain', String(playerId));
  }

  function handleRowDrop(e: React.DragEvent, position: Position) {
    e.preventDefault();
    setDragOverRow(null);
    const playerId = Number(e.dataTransfer.getData('text/plain'));
    const player = playersById.get(playerId);
    if (!player || player.position !== position) return;
    const sp = squad.players.find((p) => p.playerId === playerId);
    if (sp?.inStartingXI) return;
    swapIntoStarting(position, playerId);
  }

  function handleBenchDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOverRow(null);
    const playerId = Number(e.dataTransfer.getData('text/plain'));
    const sp = squad.players.find((p) => p.playerId === playerId);
    if (!sp?.inStartingXI) return;
    swapToBench(playerId);
  }

  function renderCard(playerId: number, isCaptain?: boolean, isViceCaptain?: boolean, benchCard = false) {
    const player = playersById.get(playerId);
    if (!player) return null;
    const team = teamsById.get(player.teamId);
    const candidate = isSwapCandidate(playerId);
    const source = pendingSwap?.playerId === playerId;
    const fixture = projections.get(playerId)?.perGameweek[selectedGameweekIndex];
    const armband = isCaptain ? 'C' : isViceCaptain ? 'V' : null;

    return (
      <div
        key={playerId}
        className={`group ${cardClassName(benchCard, candidate, source)}`}
        draggable
        onDragStart={(e) => handleDragStart(e, playerId)}
        onClick={candidate ? () => commitSwap(playerId) : undefined}
      >
        <div className="relative flex items-center justify-center">
          <PlayerShirt teamId={player.teamId} position={player.position} teamShortName={team?.shortName ?? '?'} />
          {armband && (
            <span
              className={`absolute -right-1.5 -top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-bold ${
                isCaptain ? 'bg-[#00ff87] text-[#0d2b1c]' : 'bg-white/85 text-[#12002a]'
              }`}
            >
              {armband}
            </span>
          )}
        </div>

        <span className="w-full truncate text-[12px] font-semibold leading-tight text-[#f2ecf7]">{player.webName}</span>

        <span className="flex items-center gap-1 text-[10px] leading-tight text-[#b7a9c6]">
          {projectedFixtureLabel(playerId)}
          {fixture && fixture.fixtureDifficulty > 0 && <span className={fdrStyle(fixture.fixtureDifficulty)}>{fixture.fixtureDifficulty}</span>}
        </span>

        <span className="num text-[13px] font-bold leading-none text-[#00ff87]">{xPts(playerId).toFixed(1)}</span>
        <span className="num text-[10px] leading-none text-[#7d7089]">£{(player.nowCostTenths / 10).toFixed(1)}m</span>

        {/* Controls stay hidden until the card is hovered or focused so the pitch reads as a team sheet. */}
        <div className="mt-0.5 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            onClick={() => onBeginSwap(playerId, benchCard ? 'toStarting' : 'toBench')}
            aria-label={benchCard ? `Move ${player.webName} to the starting XI` : `Move ${player.webName} to the bench`}
            className="flex h-6 w-6 items-center justify-center rounded-[7px] text-[#9d8fb0] transition hover:bg-white/10 hover:text-[#f2ecf7]"
          >
            {benchCard ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
          </button>
          {!benchCard && (
            <button
              type="button"
              onClick={() => setCaptain(playerId, !isCaptain && !isViceCaptain ? true : false)}
              aria-label={`Make ${player.webName} ${isCaptain ? 'vice-captain' : 'captain'}`}
              className="flex h-6 w-6 items-center justify-center rounded-[7px] text-[#9d8fb0] transition hover:bg-white/10 hover:text-[#00ff87]"
            >
              <Star className={`h-3.5 w-3.5 ${isCaptain ? 'fill-current text-[#00ff87]' : ''}`} />
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemovePlayer(playerId)}
            aria-label={`Remove ${player.webName} from squad`}
            className="flex h-6 w-6 items-center justify-center rounded-[7px] text-[#9d8fb0] transition hover:bg-[#ff5f6d]/20 hover:text-[#ff8f9a]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  function projectedFixtureLabel(playerId: number): string {
    const fixture = projections.get(playerId)?.perGameweek[selectedGameweekIndex];
    if (!fixture) return 'No fixture';
    if (fixture.opponentTeamId === 0) return 'Blank';
    const opponent = teamsById.get(fixture.opponentTeamId)?.shortName ?? '?';
    return `${opponent} ${fixture.isHome ? '(H)' : '(A)'}`;
  }

  return (
    <div>
      {pendingSwap && (
        <div className="mb-2.5 flex items-center gap-3 rounded-[13px] border border-[#ffb86c]/25 bg-[#ffb86c]/10 px-3.5 py-2.5">
          <span className="text-[12px] text-[#ffb86c]">Pick the player to replace — only legal targets are selectable.</span>
          <button type="button" onClick={onClearSwap} className="ml-auto text-[11px] font-semibold text-[#f2ecf7] underline-offset-2 hover:underline">
            Cancel
          </button>
        </div>
      )}
      <div className="relative overflow-hidden rounded-[20px] border border-[#00ff87]/14 bg-[linear-gradient(180deg,#0f3a24_0%,#0a2a1a_50%,#071c12_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_60px_rgba(0,0,0,0.5)]">
        <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(180deg,rgba(255,255,255,0.035)_0px,rgba(255,255,255,0.035)_52px,rgba(255,255,255,0)_52px,rgba(255,255,255,0)_104px)]" />
        <div className="pointer-events-none absolute inset-x-6 inset-y-4 rounded-[8px] border border-[#00ff87]/14" />
        <div className="pointer-events-none absolute inset-y-4 left-1/2 w-px -translate-x-1/2 bg-[#00ff87]/10" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[100px] w-[100px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#00ff87]/10" />
        <div className="relative flex flex-col gap-2 px-4 py-4">
          {POSITION_ORDER.map((pos) => (
            <div
              key={pos}
              className={`flex flex-wrap justify-center gap-2.5 rounded-[12px] py-1 ${dragOverRow === pos ? 'ring-2 ring-[#00ff87]/70' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverRow(pos);
              }}
              onDragLeave={() => setDragOverRow(null)}
              onDrop={(e) => handleRowDrop(e, pos)}
            >
              {rows[pos].map((sp) => renderCard(sp.playerId, sp.isCaptain, sp.isViceCaptain))}
            </div>
          ))}
        </div>
      </div>
      <div
        className={`mt-2.5 rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-3 ${dragOverRow === 'bench' ? 'ring-2 ring-[#00ff87]/70' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverRow('bench');
        }}
        onDragLeave={() => setDragOverRow(null)}
        onDrop={handleBenchDrop}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="eyebrow">Bench</span>
          <span className="text-[11px] text-[#7d7089]">
            GW{currentGameweek} <span className="num font-bold text-[#f2ecf7]">{teamNextGwPts.toFixed(1)}</span>
            <span className="mx-1.5 text-[#7d7089]">·</span>
            Next 3 <span className="num font-bold text-[#f2ecf7]">{teamHorizonPts.toFixed(1)}</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-2.5">{bench.map((sp) => renderCard(sp.playerId, false, false, true))}</div>
      </div>
    </div>
  );
}