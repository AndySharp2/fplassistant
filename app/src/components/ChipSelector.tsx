import { makeStyles, tokens, Text, Button, Badge } from '@fluentui/react-components';
import {
  WandRegular,
  ArrowSwapRegular,
  ArrowExpandRegular,
  StarEmphasisRegular,
} from '@fluentui/react-icons';
import type { ReactElement } from 'react';
import type { Chip, Squad } from '../types';

const CHIP_META: Record<Chip, { label: string; description: string; icon: ReactElement }> = {
  wildcard: {
    label: 'Wildcard',
    description: 'Unlimited free transfers this gameweek',
    icon: <WandRegular />,
  },
  freehit: {
    label: 'Free Hit',
    description: 'Unlimited transfers for one gameweek only - reverts after',
    icon: <ArrowSwapRegular />,
  },
  benchboost: {
    label: 'Bench Boost',
    description: "Bench players' points count this gameweek",
    icon: <ArrowExpandRegular />,
  },
  triplecaptain: {
    label: 'Triple Captain',
    description: 'Captain scores triple instead of double',
    icon: <StarEmphasisRegular />,
  },
};

const useStyles = makeStyles({
  row: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
});

export function ChipSelector({ squad, updateSquad }: { squad: Squad; updateSquad: (fn: (prev: Squad) => Squad) => void }) {
  const styles = useStyles();

  function toggleChip(chip: Chip) {
    updateSquad((prev) => ({ ...prev, activeChip: prev.activeChip === chip ? null : chip }));
  }

  return (
    <div>
      <Text weight="semibold" block style={{ marginBottom: tokens.spacingVerticalXS }}>
        Chips
      </Text>
      <div className={styles.row}>
        {(Object.keys(CHIP_META) as Chip[]).map((chip) => {
          const available = squad.chipsAvailable.includes(chip);
          const active = squad.activeChip === chip;
          return (
            <Button
              key={chip}
              appearance={active ? 'primary' : 'outline'}
              icon={CHIP_META[chip].icon}
              disabled={!available && !active}
              onClick={() => toggleChip(chip)}
              title={CHIP_META[chip].description}
            >
              {CHIP_META[chip].label}
            </Button>
          );
        })}
        {squad.activeChip && (
          <Badge appearance="tint" color="brand">
            {CHIP_META[squad.activeChip].label} active this gameweek
          </Badge>
        )}
      </div>
    </div>
  );
}
