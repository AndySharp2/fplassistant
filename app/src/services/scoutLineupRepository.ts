// Reads the Fantasy Football Scout predicted line-ups that the refresh job publishes to
// Dataverse, so the app picks up team news without a rebuild. Falls back to the copy
// bundled at build time if the read fails.
import { MicrosoftDataverseService } from '../generated';
import { SCOUT_PREDICTED_STARTER_IDS, SCOUT_SNAPSHOT_REFRESHED_AT } from '../lib/scoutPredictedLineups';

const SCOUT_LINEUP_ENTITY = 'cra06_scoutlineups';
const CACHE_TTL_MS = 15 * 60 * 1000;

export interface ScoutLineupSnapshot {
  starterIds: ReadonlySet<number>;
  refreshedAt: Date | null;
  source: 'dataverse' | 'bundled';
}

interface DataverseScoutLineupRow {
  cra06_starteridsjson: string;
  cra06_refreshedon: string;
  cra06_teamcount: number;
  cra06_startercount: number;
}

const bundledSnapshot: ScoutLineupSnapshot = {
  starterIds: SCOUT_PREDICTED_STARTER_IDS,
  refreshedAt: SCOUT_SNAPSHOT_REFRESHED_AT ? new Date(SCOUT_SNAPSHOT_REFRESHED_AT) : null,
  source: 'bundled',
};

let cached: { expiresAt: number; value: ScoutLineupSnapshot } | null = null;

export function clearScoutLineupCache(): void {
  cached = null;
}

export async function getScoutLineups(): Promise<ScoutLineupSnapshot> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let snapshot = bundledSnapshot;
  try {
    const list = await MicrosoftDataverseService.ListRecords(SCOUT_LINEUP_ENTITY, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1);
    const row = (list.data as unknown as { value: DataverseScoutLineupRow[] } | undefined)?.value?.[0];
    const ids: number[] = row ? JSON.parse(row.cra06_starteridsjson || '[]') : [];

    // A partial scrape is worse than no scrape - the model treats an absent player as
    // benched, so an incomplete list would wrongly downgrade real starters.
    if (row && ids.length > 0 && row.cra06_teamcount === 20) {
      snapshot = {
        starterIds: new Set(ids),
        refreshedAt: row.cra06_refreshedon ? new Date(row.cra06_refreshedon) : null,
        source: 'dataverse',
      };
    }
  } catch {
    // Leaves the bundled snapshot in place; staleness handling downstream decides whether
    // it is still trustworthy.
  }

  cached = { expiresAt: Date.now() + CACHE_TTL_MS, value: snapshot };
  return snapshot;
}
