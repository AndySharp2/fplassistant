import { makeStyles, tokens } from '@fluentui/react-components';
import { getTeamColors } from '../lib/teamColors';
import type { Position } from '../types';

const useStyles = makeStyles({
  shirt: {
    width: '32px',
    height: '32px',
    flexShrink: 0,
    filter: `drop-shadow(0 1px 2px ${tokens.colorNeutralShadowAmbient})`,
  },
});

/** Procedural SVG kit coloured per club - avoids hotlinking external crest/shirt images, which the code app's sandboxed rendering can block. */
export function PlayerShirt({ teamId, position, teamShortName }: { teamId: number; position: Position; teamShortName: string }) {
  const styles = useStyles();
  const { primary, secondary } = getTeamColors(teamShortName, teamId);
  const isGoalkeeper = position === 'GKP';
  // Goalkeepers wear the trim colour as the body and the primary as trim, to visually distinguish them.
  const body = isGoalkeeper ? secondary : primary;
  const trim = isGoalkeeper ? primary : secondary;

  return (
    <svg className={styles.shirt} viewBox="0 0 40 40" role="img" aria-label={`${teamShortName} shirt`}>
      <title>{teamShortName}</title>
      {/* Sleeves */}
      <path d="M8 6 L2 14 L8 18 L12 12 Z" fill={body} stroke={trim} strokeWidth="1" />
      <path d="M32 6 L38 14 L32 18 L28 12 Z" fill={body} stroke={trim} strokeWidth="1" />
      {/* Body */}
      <path d="M12 12 L14 6 L26 6 L28 12 L28 34 L12 34 Z" fill={body} stroke={trim} strokeWidth="1" />
      {/* Collar */}
      <path d="M16 6 L20 10 L24 6" fill="none" stroke={trim} strokeWidth="1.5" />
      {/* Chest trim stripe */}
      <rect x="12" y="20" width="16" height="3" fill={trim} opacity="0.85" />
    </svg>
  );
}
