# Power Automate Flows & Copilot Studio Agent

## Power Automate flows

### 1. `FPL - Refresh Player Cache` (scheduled)

- **Trigger**: Recurrence, every 1-3 hours (player form/prices update
  frequently; keep it modest to respect the public FPL API).
- **Steps**:
  1. "FPL Public API" connector action -> `GetBootstrapStatic` (see
     `custom-connector.md`).
  2. Parse JSON.
  3. Apply to each player -> Dataverse "Update a row" (upsert on
     `fpl_playerId`) into `fpl_player_cache` (see `dataverse-schema.md`).
- **Why**: gives the Copilot Studio agent fast, queryable player data via
  Dataverse actions without calling the connector on every chat turn.

### 2. `FPL - Generate Recommendation` (on-demand, called by the agent)

- **Trigger**: Power Automate "When Copilot Studio calls a flow" (or a plain
  manual trigger if invoked from the code app instead).
- **Inputs**: `squadId` (or raw squad JSON), `horizonGameweeks`.
- **Steps**:
  1. Dataverse "List rows" -> `fpl_squad_player` where `fpl_squad` = squadId.
  2. "FPL Public API" connector actions -> `GetBootstrapStatic` and
     `GetFixtures` for current player/fixture data.
  3. Data Operations (Select/Compose) to replicate the scoring formula in
     `app/src/lib/scoring.ts` and rank transfers - or, simpler, treat the
     code app as the source of truth for recommendations and have this flow
     just log runs the app already computed (skip re-implementing the math
     in flow expressions).
  4. Dataverse "Add a new row" -> `fpl_recommendation_log` with the result.
  5. Respond to Copilot Studio / caller with the top suggestions as plain
     text and the structured JSON.
- **Why**: lets the Copilot Studio agent trigger a recommendation and log it
  for later reference. Since Power Automate has no general-purpose scripting
  action without Azure, prefer directing users to the app's "Transfer Tips"
  tab for the authoritative ranking, and use this flow mainly for logging +
  simple Q&A grounded in live data.

### 3. `FPL - Weekly Deadline Reminder` (optional)

- **Trigger**: Recurrence, e.g. Friday 18:00 (before the Saturday deadline).
- **Steps**: "FPL Public API" connector -> `GetBootstrapStatic` -> find the
  next event's `deadline_time` -> Teams/Outlook/Notification action
  reminding you to review transfers before the deadline.

## Copilot Studio agent

### Knowledge sources

- Upload `FPL/docs/fpl-rules-grounding.md` as a knowledge source so the agent
  answers rules questions (chips, scoring, transfer costs) accurately.- Add the "FPL Public API" custom connector (see `custom-connector.md`) as a
  tool so the agent can fetch live player/fixture data directly.- Optionally add the `fpl_player_cache` and `fpl_squad*` Dataverse tables as
  knowledge sources so the agent can ground answers in your actual data.

### Actions (Topics / Tools)

1. **Get my squad** - Dataverse "List rows" action against `fpl_squad` /
   `fpl_squad_player` for the current user.
2. **Get transfer recommendations** - calls the `FPL - Generate
   Recommendation` Power Automate flow above; pass through
   `horizonGameweeks` if the user specifies one (e.g. "over the next 3
   gameweeks").
3. **Get upcoming fixtures / fixture difficulty** - the "FPL Public API"
   connector's `GetFixtures` action, filtered to the requested team(s).
4. **Explain a recommendation** - no action needed; answer directly using the
   rules grounding doc plus the structured `reason` field already returned by
   the app's optimizer (`app/src/lib/optimizer.ts`).

### System instructions (starting point)

```
You are a Fantasy Premier League (FPL) transfer assistant. You help the user
maximise their total FPL points across the whole season, not just the next
gameweek. Always consider a multi-gameweek horizon (default 5 gameweeks)
when discussing transfers, and factor in fixture difficulty, player form,
and the -4 point cost of transfers beyond the user's free transfers.
Ground all rules explanations (scoring, chips, transfer limits) in the
attached FPL rules document - do not guess or use outdated rules. When asked
for transfer advice, call the "Get transfer recommendations" action rather
than inventing suggestions yourself. If the user's squad data isn't
available, ask them to open the FPL Transfer Assistant app and save their
squad first.
```

### Wiring the agent to the app

- Publish the Copilot Studio agent, then embed it in the code app via the
  Direct Line / Web Chat control, or surface it as a "Ask the assistant"
  button that deep-links to the published agent.
- The code app already computes recommendations itself client-side (see
  `app/src/services/fplApi.ts` and `app/src/lib/optimizer.ts`) for the
  primary UI; use the Copilot Studio agent purely for conversational Q&A
  ("why did you drop X?", "what's my best captain pick this week?").
