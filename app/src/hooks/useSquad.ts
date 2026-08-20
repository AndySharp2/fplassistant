// Squad state: cached instantly in localStorage for snappy edits, persisted to
// Dataverse (cra06_squad / cra06_squadplayer) via an explicit save action so
// every keystroke doesn't trigger a round trip. See services/squadRepository.ts.
import { useCallback, useEffect, useState } from 'react';
import { loadSquad as loadSquadFromDataverse, saveSquad as saveSquadToDataverse } from '../services/squadRepository';
import type { Squad } from '../types';

const STORAGE_KEY = 'fpl-code-app.squad';

const EMPTY_SQUAD: Squad = {
  players: [],
  bank: 0,
  freeTransfers: 1,
  chipsAvailable: ['wildcard', 'freehit', 'benchboost', 'triplecaptain'],
  activeChip: null,
};

function loadCachedSquad(): Squad {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Squad) : EMPTY_SQUAD;
  } catch {
    return EMPTY_SQUAD;
  }
}

export function useSquad() {
  const [squad, setSquad] = useState<Squad>(loadCachedSquad);
  const [squadId, setSquadId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    loadSquadFromDataverse()
      .then(({ squadId: id, squad: loaded }) => {
        setSquadId(id);
        if (loaded.players.length > 0) setSquad(loaded);
      })
      .catch(() => {
        // Dataverse not reachable (e.g. plain `npm run dev` without `pac code run`) - keep the local cache.
      });
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(squad));
  }, [squad]);

  const saveToCloud = useCallback(async () => {
    if (!squadId) return;
    setSaveState('saving');
    try {
      await saveSquadToDataverse(squadId, squad);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [squadId, squad]);


  const updateSquad = useCallback((updater: (prev: Squad) => Squad) => {
    setSquad((prev) => updater(prev));
  }, []);

  return { squad, setSquad, updateSquad, saveToCloud, saveState, hasCloudSquad: squadId !== null };
}
