import { useEffect, useMemo, useState } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Badge,
  Caption1,
  Button,
  Tooltip,
} from '@fluentui/react-components';
import { StarRegular, StarFilled, DismissRegular, ArrowUpRegular, ArrowDownRegular } from '@fluentui/react-icons';
import { PlayerShirt } from './PlayerShirt';
import { useAppData } from '../context/AppDataContext';
import type { Position, Squad } from '../types';
import { pickBestFormationForGameweek } from '../lib/squadEvaluation';

const useStyles = makeStyles({
  pitch: {
    background: `repeating-linear-gradient(0deg, #1e7d32, #1e7d32 40px, #237a37 40px, #237a37 80px)`,
    borderRadius: tokens.borderRadiusLarge,
    padding: tokens.spacingVerticalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    border: `2px solid ${tokens.colorNeutralStroke1}`,
  },
  row: {
    display: 'flex',
    justifyContent: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    minHeight: '112px',
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalXS,
  },
  rowDragOver: {
    outline: `2px dashed ${tokens.colorNeutralForegroundOnBrand}`,
    outlineOffset: '2px',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    width: '98px',
    minHeight: '138px',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalXS}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    boxShadow: `0 4px 12px ${tokens.colorNeutralShadowAmbient}`,
    cursor: 'grab',
    textAlign: 'center',
  },
  swapCandidate: {
    outline: `3px solid ${tokens.colorBrandStroke1}`,
    outlineOffset: '2px',
    boxShadow: `0 0 0 2px ${tokens.colorBrandStroke1}, 0 4px 12px ${tokens.colorNeutralShadowAmbient}`,
    cursor: 'pointer',
  },
  swapSource: {
    outline: `3px solid ${tokens.colorStatusWarningForeground1}`,
    outlineOffset: '2px',
  },
  shirtWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
  },
  name: {
    color: '#fff',
    fontSize: '11px',
    lineHeight: '1.1',
    maxWidth: '88px',
    minHeight: '24px',
    whiteSpace: 'normal',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  infoStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  fixtureLine: {
    color: '#f5f5f5',
    fontSize: '10px',
    lineHeight: '1.1',
  },
  xpts: {
    color: '#e8ffe8',
    fontSize: '10px',
    lineHeight: '1.1',
  },
  meta: {
    color: '#d7d7e0',
    fontSize: '10px',
    lineHeight: '1.1',
  },
  captainRow: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  bench: {
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalM,
  },
  benchLabel: {
    marginBottom: tokens.spacingVerticalXS,
  },
  benchRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  benchCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    width: '98px',
    minHeight: '138px',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalXS}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: `0 4px 12px ${tokens.colorNeutralShadowAmbient}`,
    cursor: 'grab',
    textAlign: 'center',
  },
  benchSwapCandidate: {
    outline: `3px solid ${tokens.colorBrandStroke1}`,
    outlineOffset: '2px',
    cursor: 'pointer',
  },
  gwBar: {
    display: 'flex',
    justifyContent: 'flex-start',
    marginBottom: tokens.spacingVerticalM,
  },
  gwRail: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalS,
    borderLeft: `4px solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  gwChip: {
    minWidth: '112px',
    justifyContent: 'center',
  },
});

const POSITION_ORDER: Position[] = ['GKP', 'DEF', 'MID', 'FWD'];

type PendingSwap = {
  playerId: number;
  direction: 'toStarting' | 'toBench';
} | null;

export function PitchView({
  squad,
  updateSquad,
  onRemovePlayer,
  selectedGameweekIndex,
  onSelectedGameweekChange,
  onBeginSwap,
  pendingSwap,
  onClearSwap,
}: {
  squad: Squad;
  updateSquad: (fn: (prev: Squad) => Squad) => void;
  onRemovePlayer: (playerId: number) => void;
  selectedGameweekIndex: number;
  onSelectedGameweekChange: (gameweekIndex: number) => void;
  onBeginSwap: (playerId: number, direction: 'toStarting' | 'toBench') => void;
  pendingSwap: PendingSwap;
  onClearSwap: () => void;
}) {
  const styles = useStyles();
  const { playersById, teamsById, projections, currentEvent, horizonGameweeks } = useAppData();
  const [dragOverRow, setDragOverRow] = useState<Position | 'bench' | null>(null);
  const [lineupLocked, setLineupLocked] = useState(false);
  const currentGameweek = currentEvent + selectedGameweekIndex;
  const maxGameweekIndex = useMemo(() => {
    const firstProjection = projections.values().next().value as { perGameweek?: { expectedPoints: number }[] } | undefined;
    return Math.max(0, (firstProjection?.perGameweek?.length ?? 1) - 1);
  }, [projections]);

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
    return (
      <div
        key={playerId}
        className={`${benchCard ? styles.benchCard : styles.card} ${candidate ? (benchCard ? styles.benchSwapCandidate : styles.swapCandidate) : ''} ${source ? styles.swapSource : ''}`}
        draggable
        onDragStart={(e) => handleDragStart(e, playerId)}
        onClick={candidate ? () => commitSwap(playerId) : undefined}
      >
        <div className={styles.shirtWrap}>
          <PlayerShirt teamId={player.teamId} position={player.position} teamShortName={team?.shortName ?? '?'} />
        </div>
        <Text className={benchCard ? undefined : styles.name}>{player.webName}</Text>
        <div className={styles.infoStack}>
          <Caption1 className={styles.fixtureLine}>{projectedFixtureLabel(playerId)}</Caption1>
          <Caption1 className={styles.meta}>
            {team?.shortName ?? '?'} · £{(player.nowCostTenths / 10).toFixed(1)}m
          </Caption1>
          <Caption1 className={benchCard ? undefined : styles.xpts}>
            GW{currentGameweek} xPts: {xPts(playerId).toFixed(2)} / {horizonPts(playerId).toFixed(2)}
          </Caption1>
        </div>
        <div className={styles.captainRow}>
          {benchCard ? (
            <Tooltip content="Move to starting XI" relationship="label">
              <Button
                appearance="transparent"
                size="small"
                icon={<ArrowUpRegular />}
                onClick={() => onBeginSwap(playerId, 'toStarting')}
              />
            </Tooltip>
          ) : (
            <Tooltip content="Move to bench" relationship="label">
              <Button
                appearance="transparent"
                size="small"
                icon={<ArrowDownRegular />}
                onClick={() => onBeginSwap(playerId, 'toBench')}
              />
            </Tooltip>
          )}
          <Button
            appearance="transparent"
            size="small"
            icon={<DismissRegular />}
            onClick={() => onRemovePlayer(playerId)}
            title="Remove from squad"
          />
        </div>
        {!benchCard && (
          <div className={styles.captainRow}>
            <Tooltip content="Set as captain (2x points)" relationship="label">
              <Button
                appearance="transparent"
                size="small"
                icon={isCaptain ? <StarFilled /> : <StarRegular />}
                onClick={() => setCaptain(playerId, false)}
              />
            </Tooltip>
            {isViceCaptain && (
              <Badge size="small" color="informative">
                VC
              </Badge>
            )}
            {!isViceCaptain && !isCaptain && (
              <Button appearance="transparent" size="small" onClick={() => setCaptain(playerId, true)}>
                VC
              </Button>
            )}
          </div>
        )}
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
      <div className={styles.gwBar}>
        <div className={styles.gwRail}>
          <Text weight="semibold">Squad GW</Text>
          <Button appearance="secondary" size="small" onClick={() => onSelectedGameweekChange(Math.max(0, selectedGameweekIndex - 1))} disabled={selectedGameweekIndex === 0}>
            Previous
          </Button>
          <Badge className={styles.gwChip} appearance="tint" color="brand">
            Gameweek {currentGameweek}
          </Badge>
          <Button appearance="secondary" size="small" onClick={() => onSelectedGameweekChange(Math.min(maxGameweekIndex, selectedGameweekIndex + 1))} disabled={selectedGameweekIndex >= maxGameweekIndex}>
            Next
          </Button>
        </div>
      </div>
      {pendingSwap && (
        <div style={{ marginBottom: tokens.spacingVerticalS }}>
          <Text>
            Pick the player to replace. The source player is highlighted, and only legal swap targets are selectable.
          </Text>
          <Button appearance="subtle" size="small" onClick={onClearSwap} style={{ marginLeft: tokens.spacingHorizontalS }}>
            Cancel
          </Button>
        </div>
      )}
      <div className={styles.pitch}>
        {POSITION_ORDER.map((pos) => (
          <div
            key={pos}
            className={`${styles.row} ${dragOverRow === pos ? styles.rowDragOver : ''}`}
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
      <div
        className={styles.bench}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverRow('bench');
        }}
        onDragLeave={() => setDragOverRow(null)}
        onDrop={handleBenchDrop}
        style={dragOverRow === 'bench' ? { outline: `2px dashed ${tokens.colorBrandStroke1}` } : undefined}
      >
        <Caption1 className={styles.benchLabel}>Bench</Caption1>
        <div className={styles.benchRow}>{bench.map((sp) => renderCard(sp.playerId, false, false, true))}</div>
      </div>
      <Text block style={{ marginTop: tokens.spacingVerticalM }}>
        Team expected points - Next GW: <strong>{teamNextGwPts.toFixed(1)}</strong> · Next 3 GW: <strong>{teamHorizonPts.toFixed(1)}</strong>
      </Text>
    </div>
  );
}
