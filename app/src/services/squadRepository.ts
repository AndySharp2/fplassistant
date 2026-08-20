// Dataverse-backed persistence for the manager's squad.
// Tables: cra06_squad (parent), cra06_squadplayer (child, one row per of the 15 players).
// See FPL/docs/dataverse-schema.md for the schema (documented there under the
// generic fpl_ prefix; the actual publisher prefix in this environment is cra06_).
import { MicrosoftDataverseService } from '../generated';
import type { Squad, SquadPlayer } from '../types';

const SQUAD_ENTITY = 'cra06_squads';
const SQUAD_PLAYER_ENTITY = 'cra06_squadplayers';

interface DataverseSquadRow {
  cra06_squadid: string;
  cra06_name: string;
  cra06_banktenths: number;
  cra06_freetransfers: number;
  cra06_chipsavailablejson: string;
}

interface DataverseSquadPlayerRow {
  cra06_squadplayerid: string;
  cra06_name: string;
  cra06_playerid: number;
  cra06_purchasepricetenths: number;
  cra06_instartingxi: boolean;
  cra06_iscaptain: boolean;
  cra06_isvicecaptain: boolean;
}

/** Loads the manager's squad, creating an empty one on first run. Returns the squad row id too, since saves need it. */
export async function loadSquad(): Promise<{ squadId: string; squad: Squad }> {
  const list = await MicrosoftDataverseService.ListRecords(SQUAD_ENTITY, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1);
  const rows = (list.data as unknown as { value: DataverseSquadRow[] } | undefined)?.value ?? [];

  if (rows.length === 0) {
    const created = await MicrosoftDataverseService.CreateRecord('return=representation', 'application/json', SQUAD_ENTITY, {
      cra06_name: 'My Squad',
      cra06_banktenths: 0,
      cra06_freetransfers: 1,
      cra06_chipsavailablejson: JSON.stringify(['wildcard', 'freehit', 'benchboost', 'triplecaptain']),
    });
    const row = created.data as unknown as DataverseSquadRow;
    return {
      squadId: row.cra06_squadid,
      squad: {
        players: [],
        bank: 0,
        freeTransfers: 1,
        chipsAvailable: ['wildcard', 'freehit', 'benchboost', 'triplecaptain'],
        activeChip: null,
      },
    };
  }

  const row = rows[0];
  const players = await listSquadPlayers(row.cra06_squadid);
  return {
    squadId: row.cra06_squadid,
    squad: {
      bank: row.cra06_banktenths,
      freeTransfers: row.cra06_freetransfers,
      chipsAvailable: JSON.parse(row.cra06_chipsavailablejson || '[]'),
      activeChip: null,
      players,
    },
  };
}

async function listSquadPlayers(squadId: string): Promise<SquadPlayer[]> {
  const filter = `_cra06_squadid_lookup_value eq ${squadId}`;
  const list = await MicrosoftDataverseService.ListRecords(SQUAD_PLAYER_ENTITY, undefined, undefined, undefined, undefined, filter);
  const rows = (list.data as unknown as { value: DataverseSquadPlayerRow[] } | undefined)?.value ?? [];
  return rows.map((r) => ({
    playerId: r.cra06_playerid,
    purchasePrice: r.cra06_purchasepricetenths,
    inStartingXI: r.cra06_instartingxi,
    isCaptain: r.cra06_iscaptain,
    isViceCaptain: r.cra06_isvicecaptain,
  }));
}

/** Persists squad-level fields and replaces all child squad-player rows. */
export async function saveSquad(squadId: string, squad: Squad): Promise<void> {
  await MicrosoftDataverseService.UpdateRecord('return=representation', 'application/json', SQUAD_ENTITY, squadId, {
    cra06_banktenths: squad.bank,
    cra06_freetransfers: squad.freeTransfers,
    cra06_chipsavailablejson: JSON.stringify(squad.chipsAvailable),
  });

  const filter = `_cra06_squadid_lookup_value eq ${squadId}`;
  const existing = await MicrosoftDataverseService.ListRecords(SQUAD_PLAYER_ENTITY, undefined, undefined, undefined, undefined, filter);
  const existingRows = (existing.data as unknown as { value: DataverseSquadPlayerRow[] } | undefined)?.value ?? [];
  await Promise.all(existingRows.map((r) => MicrosoftDataverseService.DeleteRecord(SQUAD_PLAYER_ENTITY, r.cra06_squadplayerid)));

  await Promise.all(
    squad.players.map((p) =>
      MicrosoftDataverseService.CreateRecord('return=representation', 'application/json', SQUAD_PLAYER_ENTITY, {
        cra06_name: `Player ${p.playerId}`,
        cra06_playerid: p.playerId,
        cra06_purchasepricetenths: p.purchasePrice,
        cra06_instartingxi: p.inStartingXI,
        cra06_iscaptain: !!p.isCaptain,
        cra06_isvicecaptain: !!p.isViceCaptain,
        'cra06_squadid_lookup@odata.bind': `/${SQUAD_ENTITY}(${squadId})`,
      })
    )
  );
}
