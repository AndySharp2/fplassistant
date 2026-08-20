import { useMemo, useState } from 'react';
import {
  makeStyles,
  tokens,
  Title2,
  Text,
  Card,
  CardPreview,
  Dropdown,
  Option,
  Badge,
  Spinner,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import type { BadgeProps } from '@fluentui/react-components';
import { TrophyRegular } from '@fluentui/react-icons';
import { useAppData } from '../context/AppDataContext';
import { PlayerShirt } from './PlayerShirt';
import type { Position } from '../types';

const POSITION_COLOR: Record<Position, BadgeProps['color']> = {
  GKP: 'warning',
  DEF: 'informative',
  MID: 'success',
  FWD: 'danger',
};

function formatPrice(tenths: number): string {
  return `£${(tenths / 10).toFixed(1)}m`;
}

const useStyles = makeStyles({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
  },
  card: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingVerticalS,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  rank: {
    width: '28px',
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  name: {
    flexGrow: 1,
    minWidth: 0,
  },
  centerState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
  },
});

type ScopeKey = 'next' | 'horizon';

export function TopScorers() {
  const styles = useStyles();
  const { players, teamsById, projections, projectionsLoading, projectionsError, currentEvent, horizonGameweeks } = useAppData();
  const [positionFilter, setPositionFilter] = useState<Position | 'ALL'>('ALL');
  const [scope, setScope] = useState<ScopeKey>('next');

  const ranked = useMemo(() => {
    return players
      .filter((p) => positionFilter === 'ALL' || p.position === positionFilter)
      .map((p) => {
        const proj = projections.get(p.id);
        const nextGw = proj?.perGameweek[0]?.expectedPoints ?? 0;
        const horizon = proj?.horizonTotal ?? 0;
        return { player: p, nextGw, horizon };
      })
      .filter((r) => r.nextGw > 0 || r.horizon > 0)
      .sort((a, b) => (scope === 'next' ? b.nextGw - a.nextGw : b.horizon - a.horizon))
      .slice(0, 25);
  }, [players, projections, positionFilter, scope]);

  if (projectionsLoading) {
    return (
      <div className={styles.centerState}>
        <Spinner label="Calculating predicted scores..." />
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      <div className={styles.headerRow}>
        <div>
          <Title2>AI Top Scorers</Title2>
          <Text block>
            Predicted top performers for {scope === 'next' ? `Gameweek ${currentEvent}` : `the next ${horizonGameweeks} gameweeks`}
          </Text>
        </div>
        <div style={{ display: 'flex', gap: tokens.spacingHorizontalS }}>
          <Dropdown
            value={scope === 'next' ? 'This gameweek' : 'Next gameweeks'}
            selectedOptions={[scope]}
            onOptionSelect={(_, data) => setScope(data.optionValue as ScopeKey)}
          >
            <Option value="next">This gameweek</Option>
            <Option value="horizon" text={`Next ${horizonGameweeks} gameweeks`}>
              Next {horizonGameweeks} gameweeks
            </Option>
          </Dropdown>
          <Dropdown
            value={positionFilter === 'ALL' ? 'All positions' : positionFilter}
            selectedOptions={[positionFilter]}
            onOptionSelect={(_, data) => setPositionFilter(data.optionValue as Position | 'ALL')}
          >
            <Option value="ALL">All positions</Option>
            <Option value="GKP">Goalkeepers</Option>
            <Option value="DEF">Defenders</Option>
            <Option value="MID">Midfielders</Option>
            <Option value="FWD">Forwards</Option>
          </Dropdown>
        </div>
      </div>

      {projectionsError && (
        <MessageBar intent="warning">
          <MessageBarBody>Predictions unavailable: {projectionsError}</MessageBarBody>
        </MessageBar>
      )}

      <Card className={styles.card}>
        <CardPreview>
          <div className={styles.list}>
            {ranked.map((r, i) => {
              const team = teamsById.get(r.player.teamId);
              return (
                <div className={styles.row} key={r.player.id}>
                  <Text className={styles.rank} weight={i < 3 ? 'bold' : 'regular'}>
                    {i === 0 ? <TrophyRegular /> : i + 1}
                  </Text>
                  <PlayerShirt teamId={r.player.teamId} position={r.player.position} teamShortName={team?.shortName ?? '?'} />
                  <Badge color={POSITION_COLOR[r.player.position]} shape="rounded">
                    {r.player.position}
                  </Badge>
                  <Text className={styles.name}>
                    {r.player.webName} ({team?.shortName}) - {formatPrice(r.player.nowCostTenths)}
                  </Text>
                  <Badge appearance="tint" color="brand" size="large">
                    {(scope === 'next' ? r.nextGw : r.horizon).toFixed(2)} xPts
                  </Badge>
                </div>
              );
            })}
            {ranked.length === 0 && <Text italic>No predictions available yet.</Text>}
          </div>
        </CardPreview>
      </Card>
    </div>
  );
}
