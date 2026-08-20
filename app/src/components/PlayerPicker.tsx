import { useMemo, useState } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Dropdown,
  Option,
  Button,
  Badge,
} from '@fluentui/react-components';
import type { BadgeProps } from '@fluentui/react-components';
import { AddRegular, DismissRegular, SearchRegular, ArrowUpRegular, ArrowDownRegular } from '@fluentui/react-icons';
import { useAppData } from '../context/AppDataContext';
import { PlayerInsights } from './PlayerInsights';
import type { Position, Squad } from '../types';

const SQUAD_LIMITS: Record<Position, number> = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
const STARTING_LIMITS: Record<Position, { min: number; max: number }> = {
  GKP: { min: 1, max: 1 },
  DEF: { min: 3, max: 5 },
  MID: { min: 3, max: 5 },
  FWD: { min: 1, max: 3 },
};

const POSITION_COLOR: Record<Position, BadgeProps['color']> = {
  GKP: 'warning',
  DEF: 'informative',
  MID: 'success',
  FWD: 'danger',
};

type SortKey = 'xpts' | 'points' | 'price';

function formatPrice(tenths: number): string {
  return `£${(tenths / 10).toFixed(1)}m`;
}

const useStyles = makeStyles({
  controls: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
    marginBottom: tokens.spacingVerticalM,
  },
  searchInput: {
    flexGrow: 1,
    minWidth: '160px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    maxHeight: '460px',
    overflowY: 'auto',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalXS,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  rowSelected: {
    backgroundColor: tokens.colorNeutralBackground3,
  },
  rowName: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

type PendingSwap = {
  playerId: number;
  direction: 'toStarting' | 'toBench';
} | null;

/** Shared player list used by both "My Team" and "Transfers" - add/remove toggle per row, like the FPL site's Player Selection panel. */
export function PlayerPicker({
  squad,
  updateSquad,
  pendingSwap,
  onBeginSwap,
}: {
  squad: Squad;
  updateSquad: (fn: (prev: Squad) => Squad) => void;
  pendingSwap: PendingSwap;
  onBeginSwap: (playerId: number, direction: 'toStarting' | 'toBench') => void;
}) {
  const styles = useStyles();
  const { players, teamsById, playersById, projections } = useAppData();
  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<Position | 'ALL'>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('xpts');

  const squadIds = useMemo(() => new Set(squad.players.map((sp) => sp.playerId)), [squad.players]);
  const startingXICount = squad.players.filter((p) => p.inStartingXI).length;

  const squadPositionCounts = useMemo(() => {
    const counts: Record<Position, number> = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const sp of squad.players) {
      const player = playersById.get(sp.playerId);
      if (player) counts[player.position]++;
    }
    return counts;
  }, [squad.players, playersById]);

  const startingPositionCounts = useMemo(() => {
    const counts: Record<Position, number> = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const sp of squad.players) {
      if (!sp.inStartingXI) continue;
      const player = playersById.get(sp.playerId);
      if (player) counts[player.position]++;
    }
    return counts;
  }, [squad.players, playersById]);

  const remainingBudget = useMemo(() => {
    const spent = squad.players.reduce((sum, sp) => sum + sp.purchasePrice, 0);
    return 1000 - spent + squad.bank;
  }, [squad.bank, squad.players]);

  function xPts(playerId: number): number {
    return projections.get(playerId)?.perGameweek[0]?.expectedPoints ?? 0;
  }

  function horizonPts(playerId: number): number {
    return projections.get(playerId)?.horizonTotal ?? 0;
  }

  function sortValue(p: (typeof players)[number]): number {
    if (sortKey === 'points') return p.totalPoints;
    if (sortKey === 'price') return p.nowCostTenths;
    return xPts(p.id);
  }

  const filteredPlayers = players
    .filter((p) => positionFilter === 'ALL' || p.position === positionFilter)
    .filter((p) => p.webName.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sortValue(b) - sortValue(a))
    .slice(0, 40);

  function addPlayer(playerId: number, position: Position, price: number) {
    if (squad.players.length >= 15) return;
    if (squadPositionCounts[position] >= SQUAD_LIMITS[position]) return;
    const clubCount = squad.players.filter((sp) => playersById.get(sp.playerId)?.teamId === players.find((p) => p.id === playerId)?.teamId).length;
    if (clubCount >= 3) return;
    if (price > remainingBudget) return;
    const shouldStart = startingXICount < 11 && canStartPlayer(position);
    updateSquad((prev) => ({
      ...prev,
      players: [...prev.players, { playerId, purchasePrice: price, inStartingXI: shouldStart }],
    }));
  }

  function removePlayer(playerId: number) {
    updateSquad((prev) => ({ ...prev, players: prev.players.filter((sp) => sp.playerId !== playerId) }));
  }

  function canStartPlayer(position: Position): boolean {
    const current = startingPositionCounts[position];
    return current < STARTING_LIMITS[position].max;
  }

  function canBenchPlayer(position: Position): boolean {
    const current = startingPositionCounts[position];
    return current > STARTING_LIMITS[position].min;
  }

  function beginSwap(playerId: number, direction: 'toStarting' | 'toBench') {
    const player = playersById.get(playerId);
    if (!player) return;
    if (direction === 'toStarting' && !canStartPlayer(player.position)) return;
    if (direction === 'toBench' && !canBenchPlayer(player.position)) return;
    onBeginSwap(playerId, direction);
  }

  return (
    <div>
      <div className={styles.controls}>
        <Input
          className={styles.searchInput}
          contentBefore={<SearchRegular />}
          placeholder="Find a player..."
          value={search}
          onChange={(_, data) => setSearch(data.value)}
        />
        <Dropdown
          value={positionFilter === 'ALL' ? 'All players' : positionFilter}
          selectedOptions={[positionFilter]}
          onOptionSelect={(_, data) => setPositionFilter(data.optionValue as Position | 'ALL')}
        >
          <Option value="ALL">All players</Option>
          <Option value="GKP">Goalkeepers</Option>
          <Option value="DEF">Defenders</Option>
          <Option value="MID">Midfielders</Option>
          <Option value="FWD">Forwards</Option>
        </Dropdown>
        <Dropdown value={sortKey === 'xpts' ? 'xPts' : sortKey === 'points' ? 'Total points' : 'Price'} selectedOptions={[sortKey]} onOptionSelect={(_, data) => setSortKey(data.optionValue as SortKey)}>
          <Option value="xpts">xPts</Option>
          <Option value="points">Total points</Option>
          <Option value="price">Price</Option>
        </Dropdown>
      </div>
      <div className={styles.list}>
        {filteredPlayers.map((p) => {
          const selected = squadIds.has(p.id);
          const squadPlayer = squad.players.find((sp) => sp.playerId === p.id);
          const isStarting = !!squadPlayer?.inStartingXI;
          const isPendingSource = pendingSwap?.playerId === p.id;
          return (
            <div className={`${styles.row} ${selected || isPendingSource ? styles.rowSelected : ''}`} key={p.id}>
              <Badge color={POSITION_COLOR[p.position]} shape="rounded">
                {p.position}
              </Badge>
              <Text className={styles.rowName}>
                {p.webName} ({teamsById.get(p.teamId)?.shortName}) - {formatPrice(p.nowCostTenths)}
              </Text>
              <Badge appearance="tint" color="brand">
                {xPts(p.id).toFixed(2)} / {horizonPts(p.id).toFixed(2)} xPts
              </Badge>
              <PlayerInsights playerId={p.id} playerName={p.webName} />
              {selected ? (
                <>
                  {isStarting ? (
                    <Button size="small" appearance="subtle" icon={<ArrowDownRegular />} onClick={() => beginSwap(p.id, 'toBench')} title="Move to bench" />
                  ) : (
                    <Button size="small" appearance="subtle" icon={<ArrowUpRegular />} onClick={() => beginSwap(p.id, 'toStarting')} title="Move to starting XI" />
                  )}
                  <Button size="small" appearance="subtle" icon={<DismissRegular />} onClick={() => removePlayer(p.id)} />
                </>
              ) : (
                <Button size="small" appearance="primary" icon={<AddRegular />} onClick={() => addPlayer(p.id, p.position, p.nowCostTenths)} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
