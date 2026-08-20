import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getBootstrap, getProjections } from '../services/fplApi';
import { clearFplClientCache } from '../lib/fplClient';
import type { Player, PlayerProjection, Team } from '../types';

const HORIZON_GAMEWEEKS = 3;
const FULL_SEASON_GAMEWEEKS = 38;

function getRemainingSeasonGameweeks(currentEvent: number): number {
  return Math.max(1, FULL_SEASON_GAMEWEEKS - Math.max(1, currentEvent) + 1);
}

interface AppDataValue {
  players: Player[];
  teams: Team[];
  teamsById: Map<number, Team>;
  playersById: Map<number, Player>;
  currentEvent: number;
  preSeason: boolean;
  loading: boolean;
  error: string | null;
  projections: Map<number, PlayerProjection>;
  projectionsLoading: boolean;
  projectionsError: string | null;
  horizonGameweeks: number;
}

const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentEvent, setCurrentEvent] = useState(0);
  const [preSeason, setPreSeason] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projections, setProjections] = useState<Map<number, PlayerProjection>>(new Map());
  const [projectionsLoading, setProjectionsLoading] = useState(true);
  const [projectionsError, setProjectionsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    clearFplClientCache();

    async function loadData() {
      try {
        const bootstrap = await getBootstrap();
        if (cancelled) return;

        setPlayers(bootstrap.players);
        setTeams(bootstrap.teams);
        setCurrentEvent(bootstrap.currentEvent);
        setPreSeason(bootstrap.preSeason);
        setLoading(false);

        const remainingGameweeks = getRemainingSeasonGameweeks(bootstrap.currentEvent);
        try {
          const bundle = await getProjections(remainingGameweeks);
          if (!cancelled) setProjections(bundle.projectionsByPlayerId);
        } catch (projectionErr) {
          if (!cancelled) {
            setProjectionsError(projectionErr instanceof Error ? projectionErr.message : 'Failed to compute expected points.');
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load FPL data.');
        }
      } finally {
        if (!cancelled) setProjectionsLoading(false);
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const value: AppDataValue = {
    players,
    teams,
    teamsById: new Map(teams.map((t) => [t.id, t])),
    playersById: new Map(players.map((p) => [p.id, p])),
    currentEvent,
    preSeason,
    loading,
    error,
    projections,
    projectionsLoading,
    projectionsError,
    horizonGameweeks: HORIZON_GAMEWEEKS,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within an AppDataProvider');
  return ctx;
}
