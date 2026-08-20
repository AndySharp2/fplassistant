import { useEffect, useMemo, useState } from 'react';
import {
  makeStyles,
  tokens,
  Card,
  CardHeader,
  CardPreview,
  Title2,
  Subtitle2,
  Text,
  Badge,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import type { BadgeProps } from '@fluentui/react-components';
import { useAppData } from '../context/AppDataContext';
import { getFixtures } from '../services/fplApi';
import type { Fixture } from '../types';

const DIFFICULTY_LABEL: Record<number, string> = { 1: 'Very easy', 2: 'Easy', 3: 'Average', 4: 'Hard', 5: 'Very hard' };
const DIFFICULTY_COLOR: Record<number, BadgeProps['color']> = {
  1: 'success',
  2: 'success',
  3: 'warning',
  4: 'danger',
  5: 'danger',
};

const useStyles = makeStyles({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  card: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
  },
  matchList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    marginTop: tokens.spacingVerticalS,
  },
  match: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalXS,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  teamName: {
    minWidth: '48px',
    textAlign: 'center',
  },
});

export function FixtureList() {
  const styles = useStyles();
  const { teamsById, currentEvent } = useAppData();
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFixtures()
      .then(setFixtures)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load fixtures.'));
  }, []);

  const upcomingByEvent = useMemo(() => {
    const map = new Map<number, Fixture[]>();
    for (const f of fixtures) {
      if (f.event === null || f.finished || f.event < currentEvent || f.event > currentEvent + 5) continue;
      const list = map.get(f.event) ?? [];
      list.push(f);
      map.set(f.event, list);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [fixtures, currentEvent]);

  if (error) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>{error}</MessageBarBody>
      </MessageBar>
    );
  }

  return (
    <div className={styles.stack}>
      <Title2>Upcoming Fixtures</Title2>
      <Text>Next 5 gameweeks, colour-coded by fixture difficulty rating (FDR)</Text>
      {upcomingByEvent.map(([event, list]) => (
        <Card className={styles.card} key={event}>
          <CardHeader header={<Subtitle2>Gameweek {event}</Subtitle2>} />
          <CardPreview>
            <div className={styles.matchList}>
              {list.map((f) => (
                <div className={styles.match} key={f.id}>
                  <Text weight="semibold" className={styles.teamName}>{teamsById.get(f.teamH)?.shortName ?? f.teamH}</Text>
                  <Badge color={DIFFICULTY_COLOR[f.teamHDifficulty]} shape="rounded" title={DIFFICULTY_LABEL[f.teamHDifficulty]}>
                    {f.teamHDifficulty}
                  </Badge>
                  <Text>vs</Text>
                  <Badge color={DIFFICULTY_COLOR[f.teamADifficulty]} shape="rounded" title={DIFFICULTY_LABEL[f.teamADifficulty]}>
                    {f.teamADifficulty}
                  </Badge>
                  <Text weight="semibold" className={styles.teamName}>{teamsById.get(f.teamA)?.shortName ?? f.teamA}</Text>
                </div>
              ))}
            </div>
          </CardPreview>
        </Card>
      ))}
    </div>
  );
}
