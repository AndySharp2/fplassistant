# FPL Rules Grounding (for the Copilot Studio agent)

Upload this file as a **knowledge source** on the Copilot Studio agent so its answers
about scoring, chips, and deadlines stay accurate even as the underlying LLM's
training data goes stale. The prediction engine in `FPL/api/src/lib/scoring.ts`
implements the scoring rules below in code; this document is for grounding the
conversational agent's explanations and Q&A, not for re-deriving the math.

## Squad rules

- 15-player squad: 2 goalkeepers, 5 defenders, 5 midfielders, 3 forwards.
- £100.0m total budget at the start of the season.
- Maximum 3 players from any one real Premier League club.
- Starting XI: 11 of the 15, with a valid formation (1 GKP, 3-5 DEF, 2-5 MID, 1-3 FWD).
- The other 4 players are substitutes, in a priority order, used for autosubs if a
  starter doesn't play.
- A captain scores double points; a vice-captain doubles instead if the captain
  doesn't play at all that gameweek.

## Transfers

- Managers get 1 free transfer per gameweek by default, and (since 2024/25) can
  **bank unused free transfers up to a maximum of 5**.
- Each additional transfer beyond the free ones costs **-4 points**.
- **Wildcard**: unlimited free transfers for one gameweek, no long-term squad value
  impact. Two wildcards per season (one per half).
- **Free Hit**: unlimited free transfers for one gameweek only; the squad reverts
  to its previous state the following gameweek.
- Transfers must keep the squad legal (budget, position counts, max 3 per club).

## Chips

- **Wildcard** (x2/season): swap any number of players with no transfer cost.
- **Free Hit** (x1, or x2 from 2023/24 onward with the second unlocked in January):
  temporary unlimited transfers for a single gameweek.
- **Bench Boost** (x1 or x2/season): bench players' points count that gameweek.
- **Triple Captain** (x1 or x2/season): captain scores triple instead of double.
- Only one chip can be active per gameweek.

## Scoring (points per action)

| Action | GKP | DEF | MID | FWD |
|---|---|---|---|---|
| Played up to 60 minutes | 1 | 1 | 1 | 1 |
| Played 60+ minutes | 2 | 2 | 2 | 2 |
| Goal scored | 6 | 6 | 5 | 4 |
| Assist | 3 | 3 | 3 | 3 |
| Clean sheet (60+ mins) | 4 | 4 | 1 | 0 |
| Every 2 goals conceded (60+ mins) | -1 | -1 | 0 | 0 |
| Every 3 shot saves (GKP only) | 1 | - | - | - |
| Penalty save | 5 | - | - | - |
| Penalty miss | -2 | -2 | -2 | -2 |
| Yellow card | -1 | -1 | -1 | -1 |
| Red card | -3 | -3 | -3 | -3 |
| Own goal | -2 | -2 | -2 | -2 |
| Bonus points (top 3 BPS in match) | 1-3 | 1-3 | 1-3 | 1-3 |
| Defensive contribution threshold met (2024/25+) | - | 2 (10+ CBIT) | 2 (12+ CBIRT) | 2 (12+ CBIRT) |

Bonus points are awarded to the top 3 players by Bonus Points System (BPS) score
in each match - a formula combining goals, assists, clean sheets, saves, tackles,
interceptions, clearances, blocks, and other defensive/attacking contributions.
The prediction engine approximates expected bonus using each player's historical
bonus-per-game rate rather than re-deriving full BPS.

## Price changes

- Player prices can rise or fall by £0.1m during the season based on net
  transfers in/out across the whole game. This affects squad value but not
  points; the optimizer only reasons about points, so treat price-change
  timing as a secondary, not primary, decision factor.

## What "maximise points across the season" means for recommendations

1. Every transfer recommendation should be evaluated over a **multi-gameweek
   horizon** (default 5 gameweeks), not just the next fixture, because form and
   fixture difficulty change week to week.
2. A transfer is only worth making if the **projected point gain over the
   horizon exceeds the transfer cost** (0 if a free transfer is available, -4
   otherwise).
3. Prefer players with a run of favourable fixtures (low difficulty rating,
   1-2) over a single good fixture, since the goal is cumulative season
   points, not one gameweek.
4. Save wildcards/free hits for weeks with blank or double gameweeks, or when
   3+ simultaneous transfers would each individually be worthwhile.
5. Never recommend an illegal squad (budget, position counts, 3-per-club, or
   fewer than 11 starters in a valid formation).
