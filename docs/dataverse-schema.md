# Dataverse Schema

Create these tables in your Dataverse environment (Power Apps maker portal ->
Tables -> New table). They replace the browser `localStorage` used in the
code app's local-dev mode, so a manager's squad and recommendation history
follow them across devices and are queryable by the Copilot Studio agent.

## fpl_squad

One row per manager (per environment user). Holds the current 15-player squad.

| Column | Type | Notes |
|---|---|---|
| fpl_squadid | Unique Identifier | Primary key (auto) |
| fpl_name | Text | Primary name column, e.g. "{owner}'s squad" |
| fpl_owner | Lookup (User) | Set to the signed-in user (`Owner` system column works too) |
| fpl_bankTenths | Whole Number | Money in the bank, in £0.1m units |
| fpl_freeTransfers | Whole Number | 0-5 |
| fpl_chipsAvailableJson | Text (multiline) | JSON array, e.g. `["wildcard","benchboost"]` |
| fpl_lastUpdated | Date and Time | Set on save |

## fpl_squad_player

Child rows for each of the 15 players in a squad (one-to-many from `fpl_squad`).

| Column | Type | Notes |
|---|---|---|
| fpl_squadplayerid | Unique Identifier | Primary key (auto) |
| fpl_squad | Lookup (fpl_squad) | Parent squad |
| fpl_playerId | Whole Number | FPL `element` id from bootstrap-static |
| fpl_purchasePriceTenths | Whole Number | Price paid, £0.1m units |
| fpl_inStartingXI | Yes/No | |
| fpl_isCaptain | Yes/No | |
| fpl_isViceCaptain | Yes/No | |

## fpl_recommendation_log

Append-only history of recommendation runs, so the agent can answer "what did
you suggest last week?" and you can track whether you followed the advice.

| Column | Type | Notes |
|---|---|---|
| fpl_recommendationid | Unique Identifier | Primary key (auto) |
| fpl_squad | Lookup (fpl_squad) | Which squad this run was for |
| fpl_gameweek | Whole Number | Gameweek the recommendation was generated for |
| fpl_horizonGameweeks | Whole Number | e.g. 5 |
| fpl_resultJson | Text (multiline) | Full `RecommendationResult` JSON from the API |
| fpl_actioned | Yes/No | Whether the manager made the suggested transfer |
| fpl_createdOn | Date and Time | Auto (`Created On` system column works) |

## fpl_player_cache (optional)

Optional local cache of `bootstrap-static` player data, refreshed by a
scheduled Power Automate flow (see `power-automate-flows.md`). Useful if you
want the Copilot Studio agent to query player stats directly via Dataverse
actions/views instead of calling the FPL Public API connector each time.

| Column | Type | Notes |
|---|---|---|
| fpl_playerId | Whole Number | Primary/alternate key |
| fpl_webName | Text | |
| fpl_teamId | Whole Number | |
| fpl_position | Choice (GKP/DEF/MID/FWD) | |
| fpl_nowCostTenths | Whole Number | |
| fpl_form | Decimal | |
| fpl_totalPoints | Whole Number | |
| fpl_status | Text | 'a'/'d'/'i'/'s'/'u' |
| fpl_refreshedOn | Date and Time | |

## Wiring into the code app

Once these tables exist:

1. Run `pac code add-data-source` and choose the Dataverse connector, then
   pick these tables. This generates a typed client under
   `app/src/Models/` / `app/src/Services/` (exact path depends on CLI
   version) that wraps the Dataverse Web API.
2. Replace `app/src/hooks/useSquad.ts`'s `localStorage` calls with calls to
   the generated Dataverse service (create/update `fpl_squad` and its child
   `fpl_squad_player` rows).
3. The Copilot Studio agent can use the same Dataverse tables as a
   **knowledge source / action** so it can answer "what's in my squad right
   now?" without calling the FPL Public API connector.
