# Custom Connector: Fantasy Premier League API

Replaces the Azure Function proxy: a Power Platform **custom connector** wraps
the public FPL API so calls happen server-side (no CORS issue) and stay
entirely inside your Power Platform solution - no Azure subscription needed.

## OpenAPI definition

Save this as `fpl-connector.swagger.json` and use it to create the connector
(steps below). It covers the three endpoints the app and agent need: player/team
data, fixtures, and a specific manager's picks for a gameweek.

```json
{
  "swagger": "2.0",
  "info": { "title": "Fantasy Premier League API", "version": "1.0.0" },
  "host": "fantasy.premierleague.com",
  "basePath": "/api",
  "schemes": ["https"],
  "consumes": [],
  "produces": ["application/json"],
  "paths": {
    "/bootstrap-static/": {
      "get": {
        "summary": "Get all players, teams, and gameweek events",
        "operationId": "GetBootstrapStatic",
        "responses": { "200": { "description": "OK" } }
      }
    },
    "/fixtures/": {
      "get": {
        "summary": "Get all fixtures with difficulty ratings",
        "operationId": "GetFixtures",
        "responses": { "200": { "description": "OK" } }
      }
    },
    "/entry/{entryId}/event/{event}/picks/": {
      "get": {
        "summary": "Get a manager's squad picks for a gameweek",
        "operationId": "GetEntryPicks",
        "parameters": [
          { "name": "entryId", "in": "path", "required": true, "type": "integer" },
          { "name": "event", "in": "path", "required": true, "type": "integer" }
        ],
        "responses": { "200": { "description": "OK" } }
      }
    }
  }
}
```

No `securityDefinitions` are needed - the FPL API is public and unauthenticated.

## Create the connector (pac CLI)

```powershell
cd FPL
pac connector create --api-definition-file fpl-connector.swagger.json --connector-name "FPL Public API"
```

This registers the connector in your currently-selected environment (run
`pac org who` first to confirm it's pointed at the right one, e.g. AndysDev).

Alternatively, create it via the maker portal: **make.powerapps.com >
Connectors > New custom connector > Import an OpenAPI file**, and upload the
same JSON.

## Add it to the code app

```powershell
cd FPL/app
pac code add-data-source -a "FPL Public API" -t GetBootstrapStatic,GetFixtures,GetEntryPicks
```

This generates a typed client (under `app/src/Services/` or similar,
depending on CLI version). Update `app/src/lib/fplClient.ts` to call the
generated client's methods instead of `fetch('/fpl-proxy/...')`, keeping the
same return shapes so `scoring.ts`/`optimizer.ts` don't need to change.

## Add it to the Copilot Studio agent

1. In Copilot Studio, open your agent > **Tools** (or **Actions**) > **Add a
   tool** > **Custom connector**.
2. Select "FPL Public API" and pick `GetBootstrapStatic` and `GetFixtures` as
   callable actions.
3. Reference `FPL/docs/fpl-rules-grounding.md` as a knowledge source so the
   agent can reason about the data using the correct scoring rules.

This lets the agent fetch live player/fixture data directly - no Power
Automate flow required for read-only data access. Keep the `FPL -
Generate Recommendation` flow (see `power-automate-flows.md`) only if you
want the agent to trigger the exact same optimizer logic as the app; that flow
should read the squad from Dataverse and can call this same connector for
fresh player/fixture data.
