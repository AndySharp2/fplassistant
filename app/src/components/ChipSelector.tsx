import {
  WandRegular,
  ArrowSwapRegular,
  ArrowExpandRegular,
  StarEmphasisRegular,
} from '@fluentui/react-icons';
import type { ReactElement } from 'react';
import { card } from '../lib/ui';
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

export function ChipSelector({ squad, updateSquad }: { squad: Squad; updateSquad: (fn: (prev: Squad) => Squad) => void }) {
  function toggleChip(chip: Chip) {
    updateSquad((prev) => ({ ...prev, activeChip: prev.activeChip === chip ? null : chip }));
  }

  return (
    <div className="space-y-4">
      <h3 className="eyebrow">Chips</h3>
      <div className={`${card()} grid gap-2 p-3 sm:grid-cols-2`}>
        {(Object.keys(CHIP_META) as Chip[]).map((chip) => {
          const available = squad.chipsAvailable.includes(chip);
          const active = squad.activeChip === chip;
          const disabled = !available && !active;
          return (
            <button
              key={chip}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => toggleChip(chip)}
              className={`flex min-h-11 items-start gap-3 rounded-[13px] border px-4 py-3 text-left transition ${
                active
                  ? 'border-[#00ff87]/35 bg-[#00ff87]/12 text-[#f2ecf7]'
                  : 'border-white/[0.07] bg-white/[0.025] text-[#f2ecf7] hover:bg-white/[0.06]'
              } ${disabled ? 'cursor-not-allowed opacity-45' : ''}`}
            >
              <span className="mt-0.5 shrink-0 text-[#00ff87]" aria-hidden="true">
                {CHIP_META[chip].icon}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold">{CHIP_META[chip].label}</span>
                {/* Previously only in a title tooltip, so it was unreachable on touch and by keyboard. */}
                <span className="mt-0.5 block text-[11px] leading-snug text-[#9d8fb0]">{CHIP_META[chip].description}</span>
                {active && <span className="mt-1 block text-[11px] font-semibold text-[#00ff87]">Active this gameweek</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
