// Approximate primary/secondary shirt colours per club, keyed by FPL short_name.
// Used to render a procedural SVG kit (no external image hotlinking, which the
// code app's sandboxed rendering can block) instead of team crests/logos.
const TEAM_COLORS: Record<string, { primary: string; secondary: string }> = {
  ARS: { primary: '#EF0107', secondary: '#063672' },
  AVL: { primary: '#670E36', secondary: '#95BFE5' },
  BOU: { primary: '#DA291C', secondary: '#000000' },
  BRE: { primary: '#E30613', secondary: '#FFFFFF' },
  BHA: { primary: '#0057B8', secondary: '#FFFFFF' },
  BUR: { primary: '#6C1D45', secondary: '#99D6EA' },
  CHE: { primary: '#034694', secondary: '#FFFFFF' },
  CRY: { primary: '#1B458F', secondary: '#C4122E' },
  EVE: { primary: '#003399', secondary: '#FFFFFF' },
  FUL: { primary: '#FFFFFF', secondary: '#000000' },
  LEE: { primary: '#FFCD00', secondary: '#1D428A' },
  LIV: { primary: '#C8102E', secondary: '#00B2A9' },
  MCI: { primary: '#6CABDD', secondary: '#1C2C5B' },
  MUN: { primary: '#DA291C', secondary: '#FBE122' },
  NEW: { primary: '#241F20', secondary: '#FFFFFF' },
  NFO: { primary: '#DD0000', secondary: '#FFFFFF' },
  SUN: { primary: '#EB172B', secondary: '#FFFFFF' },
  TOT: { primary: '#FFFFFF', secondary: '#132257' },
  WHU: { primary: '#7A263A', secondary: '#1BB1E7' },
  WOL: { primary: '#FDB913', secondary: '#231F20' },
};

const FALLBACK_PALETTE = ['#5B2C6F', '#1F618D', '#B03A2E', '#117864', '#B7950B'];

export function getTeamColors(shortName: string, teamId: number): { primary: string; secondary: string } {
  const known = TEAM_COLORS[shortName];
  if (known) return known;
  const color = FALLBACK_PALETTE[teamId % FALLBACK_PALETTE.length];
  return { primary: color, secondary: '#FFFFFF' };
}
