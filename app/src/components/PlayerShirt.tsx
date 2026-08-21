import { getTeamColors } from '../lib/teamColors';
import type { Position } from '../types';

type KitPattern = 'plain' | 'stripes' | 'sleeves' | 'hoops' | 'sash'

function getKitPattern(shortName: string): KitPattern {
  switch (shortName) {
    case 'ARS':
    case 'BHA':
    case 'CRY':
    case 'NEW':
    case 'SUN':
      return 'stripes'
    case 'AVL':
    case 'BUR':
    case 'WHU':
      return 'sleeves'
    case 'FUL':
    case 'TOT':
      return 'plain'
    case 'BOU':
      return 'sash'
    case 'BRE':
      return 'hoops'
    default:
      return 'plain'
  }
}

function bodyPattern(pattern: KitPattern, body: string, trim: string, accent: string) {
  switch (pattern) {
    case 'stripes':
      return (
        <>
          <rect x="13" y="10" width="4" height="18" rx="1.5" fill={trim} opacity="0.95" />
          <rect x="19" y="10" width="4" height="18" rx="1.5" fill={body} opacity="0.95" />
          <rect x="25" y="10" width="4" height="18" rx="1.5" fill={trim} opacity="0.95" />
        </>
      )
    case 'sleeves':
      return (
        <>
          <rect x="12" y="10" width="16" height="18" rx="5" fill={body} opacity="0.96" />
          <rect x="12" y="10" width="16" height="4" rx="2" fill={trim} opacity="0.92" />
          <rect x="12" y="24" width="16" height="4" rx="2" fill={accent} opacity="0.86" />
        </>
      )
    case 'hoops':
      return (
        <>
          <rect x="12" y="10" width="16" height="4" rx="2" fill={trim} opacity="0.95" />
          <rect x="12" y="15" width="16" height="4" rx="2" fill={body} opacity="0.96" />
          <rect x="12" y="20" width="16" height="4" rx="2" fill={trim} opacity="0.9" />
          <rect x="12" y="25" width="16" height="3" rx="1.5" fill={body} opacity="0.96" />
        </>
      )
    case 'sash':
      return (
        <path d="M13 27L26 11" stroke={trim} strokeWidth="4" strokeLinecap="round" opacity="0.9" />
      )
    default:
      return <rect x="12" y="10" width="16" height="18" rx="5" fill={body} opacity="0.98" />
  }
}

/** Procedural SVG kit coloured per club - avoids hotlinking external crest/shirt images, which the code app's sandboxed rendering can block. */
export function PlayerShirt({ teamId, position, teamShortName }: { teamId: number; position: Position; teamShortName: string }) {
  const { primary, secondary } = getTeamColors(teamShortName, teamId);
  const isGoalkeeper = position === 'GKP';
  const pattern = getKitPattern(teamShortName);
  // Goalkeepers wear the trim colour as the body and the primary as trim, to visually distinguish them.
  const body = isGoalkeeper ? secondary : primary;
  const trim = isGoalkeeper ? primary : secondary;
  const accent = isGoalkeeper ? secondary : primary;

  return (
    <svg className="h-10 w-10 shrink-0 drop-shadow-[0_3px_8px_rgba(0,0,0,0.45)]" viewBox="0 0 40 40" role="img" aria-label={`${teamShortName} shirt`}>
      <title>{teamShortName}</title>
      <defs>
        <linearGradient id={`shirt-gloss-${teamId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="35%" stopColor="#ffffff" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      {/* Sleeves */}
      <path d="M8 7 L2 14 L8 19 L12 13 Z" fill={body} stroke={trim} strokeWidth="0.9" />
      <path d="M32 7 L38 14 L32 19 L28 13 Z" fill={body} stroke={trim} strokeWidth="0.9" />
      {pattern === 'sleeves' && (
        <>
          <path d="M6.4 12.3 L4.1 15.4" stroke={trim} strokeWidth="1.4" strokeLinecap="round" opacity="0.9" />
          <path d="M33.6 12.3 L35.9 15.4" stroke={trim} strokeWidth="1.4" strokeLinecap="round" opacity="0.9" />
        </>
      )}
      {/* Body */}
      <path d="M12 12 L14 6 L26 6 L28 12 L28 34 L12 34 Z" fill={body} stroke={trim} strokeWidth="0.9" />
      {/* Pattern */}
      {bodyPattern(pattern, body, trim, accent)}
      {/* Collar */}
      <path d="M15.5 6 L20 10.5 L24.5 6" fill="none" stroke={trim} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M16.5 7.1 L20 10.8 L23.5 7.1" fill="none" stroke={body === '#FFFFFF' ? '#1b1b1b' : '#fff'} strokeWidth="0.8" opacity="0.35" />
      {/* Hem */}
      <rect x="12" y="30.6" width="16" height="1.8" rx="0.9" fill={trim} opacity="0.72" />
      {/* Gloss */}
      <path d="M12 12 L14 6 L26 6 L28 12 L28 34 L12 34 Z" fill={`url(#shirt-gloss-${teamId})`} opacity="0.9" />
    </svg>
  );
}
