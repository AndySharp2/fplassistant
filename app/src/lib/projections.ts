import type { Fixture, Player, PlayerProjection, Team } from '../types';
import { SCOUT_PREDICTED_STARTER_IDS } from './scoutPredictedLineups';
import { estimateFixtureBpsScore, projectPlayer } from './scoring';

/** Builds gameweek-by-gameweek projections for every player, for gameweeks [startEvent, startEvent+horizon). */
export function buildAllProjections(
  players: Player[],
  teams: Team[],
  fixtures: Fixture[],
  startEvent: number,
  horizon: number,
  isPreSeason = false
): Map<number, PlayerProjection> {
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const horizonGameweeks = Array.from({ length: horizon }, (_, i) => startEvent + i);

  const fixturesByEvent = new Map<number, Fixture[]>();
  for (const fixture of fixtures) {
    if (fixture.event === null || fixture.finished) continue;
    if (!horizonGameweeks.includes(fixture.event)) continue;
    const list = fixturesByEvent.get(fixture.event) ?? [];
    list.push(fixture);
    fixturesByEvent.set(fixture.event, list);
  }

  const bonusByFixtureId = new Map<number, Map<number, number>>();
  for (const gw of horizonGameweeks) {
    const gwFixtures = fixturesByEvent.get(gw) ?? [];
    for (const fixture of gwFixtures) {
      const fixturePlayers = players.filter((player) => player.teamId === fixture.teamH || player.teamId === fixture.teamA);
      const scoredPlayers = fixturePlayers
        .map((player) => {
          const isHome = player.teamId === fixture.teamH;
          const opponentId = isHome ? fixture.teamA : fixture.teamH;
          const playerTeam = teamsById.get(player.teamId);
          const opponentTeam = teamsById.get(opponentId);
          if (!playerTeam || !opponentTeam) return null;
          return {
            playerId: player.id,
            score: estimateFixtureBpsScore({
              player,
              playerTeam,
              opponentTeam,
              fixture,
              isHome,
              isPreSeason,
              scoutPredictsStart: SCOUT_PREDICTED_STARTER_IDS.has(player.id),
            }),
          };
        })
        .filter((entry): entry is { playerId: number; score: number } => !!entry)
        .sort((a, b) => b.score - a.score);

      const bonusByPlayerId = new Map<number, number>();
      const rankGroups: Array<{ score: number; players: number[] }> = [];
      for (const entry of scoredPlayers) {
        const lastGroup = rankGroups[rankGroups.length - 1];
        if (lastGroup && Math.abs(lastGroup.score - entry.score) < 1e-9) {
          lastGroup.players.push(entry.playerId);
        } else {
          rankGroups.push({ score: entry.score, players: [entry.playerId] });
        }
      }

      const bonusSlots = [3, 2, 1];
      for (let groupIndex = 0; groupIndex < Math.min(3, rankGroups.length); groupIndex++) {
        const bonus = bonusSlots[groupIndex] ?? 0;
        for (const playerId of rankGroups[groupIndex].players) {
          bonusByPlayerId.set(playerId, bonus);
        }
      }

      bonusByFixtureId.set(fixture.id, bonusByPlayerId);
    }
  }

  const projections = new Map<number, PlayerProjection>();
  for (const player of players) {
    projections.set(player.id, projectPlayer({ player, teams: teamsById, fixturesByEvent, horizonGameweeks, isPreSeason, bonusByFixtureId }));
  }
  return projections;
}
