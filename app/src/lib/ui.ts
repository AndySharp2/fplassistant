// Surface and control classes matching the redesign concept. Radii, borders and fills are
// centralised here because each component previously re-derived them slightly differently
// (rounded-2xl vs rounded-[28px], bg-white/6 vs /8).

type SurfaceVariant = 'default' | 'raised' | 'plum';

/** Standard content card - the 18px radius panel used for every list and stat block. */
export function card(variant: SurfaceVariant = 'default'): string {
  if (variant === 'raised') return 'rounded-[18px] border border-white/[0.09] bg-white/[0.04]';
  if (variant === 'plum') return 'rounded-[18px] border border-white/[0.09] bg-gradient-to-br from-[rgba(55,0,60,0.8)] to-[rgba(11,6,16,0.55)]';
  return 'rounded-[18px] border border-white/[0.08] bg-white/[0.03]';
}

/** Inset control surface - filter bars, segmented toggles, stat pills. */
export function field(): string {
  return 'rounded-[11px] border border-white/[0.07] bg-white/[0.04]';
}

/** Primary action. The concept uses a single green gradient CTA per screen. */
export const primaryAction =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] bg-gradient-to-br from-[#00ff87] to-[#00c46a] px-4 text-[13px] font-bold text-[#0d2b1c] shadow-[0_6px_18px_rgba(0,255,135,0.22)] transition hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100';

export const secondaryAction =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] border border-white/[0.07] bg-white/[0.04] px-4 text-[13px] font-semibold text-[#f2ecf7] transition hover:bg-white/[0.08] disabled:opacity-50';

export const dangerAction =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] border border-[#ff5f6d]/25 bg-[#ff5f6d]/10 px-4 text-[13px] font-semibold text-[#ff8f9a] transition hover:bg-[#ff5f6d]/20';

/** Fixture Difficulty Rating chip - colour encodes the value rather than being decorative. */
export function fdrStyle(difficulty: number): string {
  const base = 'num inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] px-1.5 text-[11px] font-bold';
  if (difficulty <= 2) return `${base} bg-[#00ff87]/16 text-[#00ff87]`;
  if (difficulty === 3) return `${base} bg-white/[0.08] text-[#b7a9c6]`;
  if (difficulty === 4) return `${base} bg-[#ffb86c]/16 text-[#ffb86c]`;
  return `${base} bg-[#ff5f6d]/16 text-[#ff8f9a]`;
}

const POSITION_TONE: Record<string, string> = {
  GKP: 'bg-[#ffb86c]/16 text-[#ffb86c]',
  DEF: 'bg-[#5ec8ff]/16 text-[#5ec8ff]',
  MID: 'bg-[#00ff87]/16 text-[#00ff87]',
  FWD: 'bg-[#ff7ad9]/16 text-[#ff7ad9]',
};

export function positionTag(position: string): string {
  return `inline-flex h-5 items-center rounded-[6px] px-1.5 text-[10px] font-bold tracking-wide ${
    POSITION_TONE[position] ?? 'bg-white/[0.08] text-[#9d8fb0]'
  }`;
}
