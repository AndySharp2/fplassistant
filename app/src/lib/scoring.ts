// Expected-points model grounded in the official FPL scoring rules
// (see FPL/docs/fpl-rules-grounding.md for the full rule set this encodes).
//
// Uses this season's aggregated stats (per-90 rates, minutes, starts, form, etc.) plus
// current fixture difficulty and fitness/rotation status - never data from previous
// seasons, which wouldn't reflect a player's role/output at their current club.
import type { Fixture, GameweekPrediction, Player, PlayerProjection, Position, Team } from '../types';
import { DEFENSIVE_CONTRIBUTIONS_PER_90 } from './defensiveContributions';
import { SCOUT_PREDICTED_STARTER_IDS } from './scoutPredictedLineups';

const GOAL_POINTS: Record<Position, number> = { GKP: 6, DEF: 6, MID: 5, FWD: 4 };
const CLEAN_SHEET_POINTS: Record<Position, number> = { GKP: 4, DEF: 4, MID: 1, FWD: 0 };
const ASSIST_POINTS = 3;

// Baseline clean-sheet probability implied by a team's defensive strength,
// used when a player has too little minutes this season for a reliable per-90 rate.
const LEAGUE_AVG_CLEAN_SHEET_RATE = 0.28;

/** Probability the player actually appears / completes 60+ minutes in the next fixture.
 *  Before the season kicks off, `minutes`/`starts` still reflect LAST season (often at a
 *  different club, or a since-lost starting spot) - not a reliable signal for this
 *  season's role, so a backup goalkeeper who started plenty of games last year would
 *  otherwise look like a nailed starter. Fall back to current ownership share instead. */
function appearanceProbability(
  player: Player,
  isPreSeason: boolean,
  scoutPredictsStart: boolean | undefined
): { plays: number; playsFull: number } {
  if (['i', 's', 'u'].includes(player.status)) return { plays: 0, playsFull: 0 };
  const chance = player.chanceOfPlayingNextRound;
  const plays = chance === null ? (player.status === 'd' ? 0.75 : 1) : chance / 100;

  if (scoutPredictsStart !== undefined) {
    if (!scoutPredictsStart) return { plays: 0, playsFull: 0 };
    return { plays: Math.min(plays, 0.95), playsFull: Math.min(plays, 0.9) };
  }

  if (isPreSeason) {
    const ownershipFactor = clamp(player.selectedByPercent / 15, 0.15, 1); // ~15%+ owned ~ nailed
    return { plays, playsFull: Math.min(plays * ownershipFactor, plays) };
  }

  const avgMinutesPerStart = player.starts > 0 ? player.minutes / player.starts : player.minutes > 0 ? player.minutes : 60;
  const startShare = player.minutes > 0 ? Math.min(player.starts / Math.max(player.minutes / 90, 1), 1) : 0.5;
  const playsFull = plays * (avgMinutesPerStart >= 60 ? Math.max(startShare, 0.5) : 0.3);
  return { plays, playsFull: Math.min(playsFull, plays) };
}

/** Attack multiplier for the team on the ball, relative to the opponent's defence, centred on 1.0. */
function attackMultiplier(attackingTeam: Team, defendingTeam: Team, attackerIsHome: boolean): number {
  const attack = attackerIsHome ? attackingTeam.strengthAttackHome : attackingTeam.strengthAttackAway;
  const defence = attackerIsHome ? defendingTeam.strengthDefenceAway : defendingTeam.strengthDefenceHome;
  // Team strength ratings are 0 (unpublished) pre-season / before gameweek 1 - treat as a neutral fixture.
  if (!attack || !defence) return 1;
  return clamp(attack / defence, 0.6, 1.6);
}

function fallbackCleanSheetProbability(teamDifficulty?: number, opponentDifficulty?: number): number {
  if (teamDifficulty === undefined || opponentDifficulty === undefined) return 0.5;
  const difficultyGap = opponentDifficulty - teamDifficulty;
  return clamp(0.5 + difficultyGap * 0.1, 0.1, 0.9);
}

/** Clean-sheet probability for `team`, based on relative defence vs opponent attack. */
function cleanSheetProbability(
  team: Team,
  opponent: Team,
  teamIsHome: boolean,
  teamDifficulty?: number,
  opponentDifficulty?: number
): number {
  const defence = teamIsHome ? team.strengthDefenceHome : team.strengthDefenceAway;
  const oppAttack = teamIsHome ? opponent.strengthAttackAway : opponent.strengthAttackHome;
  const difficultyChance = fallbackCleanSheetProbability(teamDifficulty, opponentDifficulty);
  if (!defence || !oppAttack) {
    return difficultyChance;
  }
  const ratio = clamp(defence / oppAttack, 0.5, 1.8);
  const strengthChance = clamp(LEAGUE_AVG_CLEAN_SHEET_RATE * ratio, 0.03, 0.75);
  const strengthLimitedByDifficulty = Math.min(strengthChance, difficultyChance);
  return clamp(difficultyChance * 0.8 + strengthLimitedByDifficulty * 0.2, 0.03, 0.75);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function poissonProbabilityAtLeast(mean: number, minimum: number): number {
  let term = Math.exp(-mean);
  let cumulative = term;
  for (let count = 1; count < minimum; count++) {
    term *= mean / count;
    cumulative += term;
  }
  return clamp(1 - cumulative, 0, 1);
}

function expectedConcededPenaltyPoints(expectedGoalsConceded: number): number {
  if (expectedGoalsConceded <= 0) return 0;

  let probability = Math.exp(-expectedGoalsConceded);
  let totalPenalty = 0;
  let cumulativeProbability = probability;

  for (let goalsConceded = 1; goalsConceded <= 12; goalsConceded++) {
    if (goalsConceded >= 2) {
      totalPenalty += Math.floor(goalsConceded / 2) * probability;
    }
    probability *= expectedGoalsConceded / goalsConceded;
    cumulativeProbability += probability;
  }

  if (cumulativeProbability < 0.999999999999999) {
    totalPenalty += Math.floor(13 / 2) * (1 - cumulativeProbability);
  }

  return totalPenalty;
}

function chanceOfConcedingTwoPlus(expectedGoalsConceded: number): number {
  return poissonProbabilityAtLeast(expectedGoalsConceded, 2);
}

function expectedDefensiveContributionPoints(player: Player, playsFull: number): number {
  if (player.position === 'GKP') return 0;
  const contributionsPer90 = DEFENSIVE_CONTRIBUTIONS_PER_90[player.id];
  if (contributionsPer90 === undefined) return 0;

  const threshold = player.position === 'DEF' ? 10 : 12;
  const expectedContributions = contributionsPer90 * playsFull;
  return 2 * poissonProbabilityAtLeast(expectedContributions, threshold);
}

function defenderFixtureBpsScore({
  player,
  playerTeam,
  opponentTeam,
  fixture,
  isHome,
  isPreSeason,
  scoutPredictsStart,
}: PredictFixtureInput): number {
  const { plays, playsFull } = appearanceProbability(player, isPreSeason, scoutPredictsStart);
  if (plays === 0) return 0;

  const atkMult = attackMultiplier(playerTeam, opponentTeam, isHome);
  const fixtureDifficulty = isHome ? fixture.teamHDifficulty : fixture.teamADifficulty;
  const opponentDifficulty = isHome ? fixture.teamADifficulty : fixture.teamHDifficulty;
  const csProb = cleanSheetProbability(playerTeam, opponentTeam, isHome, fixtureDifficulty, opponentDifficulty);
  const difficultyScalar = clamp(1 + (3 - fixtureDifficulty) * 0.08, 0.8, 1.2);
  const expectedGoals = player.expectedGoalsPer90 * playsFull * atkMult * difficultyScalar;
  const expectedAssists = player.expectedAssistsPer90 * playsFull * atkMult * difficultyScalar;
  const expectedConceded = player.expectedGoalsConcededPer90 * playsFull * (2 - atkMult);
  const concedeTwoPlusChance = chanceOfConcedingTwoPlus(expectedConceded);
  const cleanSheetSignal = csProb * playsFull;
  const defensiveContributionSignal = expectedDefensiveContributionPoints(player, playsFull);
  const goalWeight = 12;
  const assistWeight = 9;
  const cleanSheetWeight = 10;
  const defensiveContributionWeight = 2;
  const concedeTwoPlusWeight = 3;
  const yellowCardWeight = 1.1;
  const redCardWeight = 3.0;

  return (
    playsFull * 2 +
    plays * 1 +
    expectedGoals * goalWeight +
    expectedAssists * assistWeight +
    cleanSheetSignal * cleanSheetWeight +
    defensiveContributionSignal * defensiveContributionWeight -
    concedeTwoPlusChance * concedeTwoPlusWeight -
    player.yellowCardsPer90 * playsFull * yellowCardWeight -
    player.redCardsPer90 * playsFull * redCardWeight
  );
}

export function estimateFixtureBpsScore({
  player,
  playerTeam,
  opponentTeam,
  fixture,
  isHome,
  isPreSeason,
  scoutPredictsStart,
}: PredictFixtureInput): number {
  if (player.position === 'DEF') {
    return defenderFixtureBpsScore({ player, playerTeam, opponentTeam, fixture, isHome, isPreSeason, scoutPredictsStart });
  }

  const { plays, playsFull } = appearanceProbability(player, isPreSeason, scoutPredictsStart);
  if (plays === 0) return 0;

  const atkMult = attackMultiplier(playerTeam, opponentTeam, isHome);
  const fixtureDifficulty = isHome ? fixture.teamHDifficulty : fixture.teamADifficulty;
  const opponentDifficulty = isHome ? fixture.teamADifficulty : fixture.teamHDifficulty;
  const csProb = cleanSheetProbability(playerTeam, opponentTeam, isHome, fixtureDifficulty, opponentDifficulty);
  const difficultyScalar = clamp(1 + (3 - fixtureDifficulty) * 0.08, 0.8, 1.2);

  const expectedGoals = player.expectedGoalsPer90 * playsFull * atkMult * difficultyScalar;
  const expectedAssists = player.expectedAssistsPer90 * playsFull * atkMult * difficultyScalar;
  const cleanSheetSignal = player.position === 'FWD' ? 0 : csProb * playsFull;
  const expectedConceded = player.position === 'GKP' ? player.expectedGoalsConcededPer90 * playsFull * (2 - atkMult) : 0;
  const defensiveContributionSignal = expectedDefensiveContributionPoints(player, playsFull);
  const savesSignal = player.position === 'GKP' ? playsFull * 0.4 : 0;

  const goalWeight: Record<Position, number> = { GKP: 12, DEF: 12, MID: 18, FWD: 24 };
  const assistWeight = 9;
  const cleanSheetWeight: Record<Position, number> = { GKP: 10, DEF: 10, MID: 2, FWD: 0 };
  const concededWeight = 2;
  const defensiveContributionWeight = 1.5;
  const saveWeight = 1.1;

  const score =
    playsFull * 2 +
    plays * 1 +
    expectedGoals * goalWeight[player.position] +
    expectedAssists * assistWeight +
    cleanSheetSignal * cleanSheetWeight[player.position] +
    defensiveContributionSignal * defensiveContributionWeight +
    savesSignal * saveWeight -
    expectedConceded * concededWeight -
    player.yellowCardsPer90 * playsFull * 1.1 -
    player.redCardsPer90 * playsFull * 3.0;

  return score;
}

function defenderFixturePoints({
  player,
  playerTeam,
  opponentTeam,
  fixture,
  isHome,
  isPreSeason,
  scoutPredictsStart,
  bonusPoints = 0,
}: PredictFixtureInput): number {
  const { plays, playsFull } = appearanceProbability(player, isPreSeason, scoutPredictsStart);
  if (plays === 0) return 0;

  const atkMult = attackMultiplier(playerTeam, opponentTeam, isHome);
  const fixtureDifficulty = isHome ? fixture.teamHDifficulty : fixture.teamADifficulty;
  const opponentDifficulty = isHome ? fixture.teamADifficulty : fixture.teamHDifficulty;
  const csProb = cleanSheetProbability(playerTeam, opponentTeam, isHome, fixtureDifficulty, opponentDifficulty);
  const difficultyScalar = clamp(1 + (3 - fixtureDifficulty) * 0.08, 0.8, 1.2);
  const appearancePoints = plays + playsFull;
  const expectedGoals = player.expectedGoalsPer90 * playsFull * atkMult * difficultyScalar;
  const expectedAssists = player.expectedAssistsPer90 * playsFull * atkMult * difficultyScalar;
  const goalPoints = expectedGoals * GOAL_POINTS.DEF;
  const assistPoints = expectedAssists * ASSIST_POINTS;
  const cleanSheetPoints = csProb * playsFull * CLEAN_SHEET_POINTS.DEF;
  const expectedConceded = player.expectedGoalsConcededPer90 * playsFull * (2 - atkMult);
  const concededPenaltyPoints = expectedConcededPenaltyPoints(expectedConceded);
  const defensiveContributionPoints = expectedDefensiveContributionPoints(player, playsFull);
  const yellowCardPoints = -(player.yellowCardsPer90 * playsFull);
  const redCardPoints = -(player.redCardsPer90 * playsFull * 2);

  return (
    appearancePoints +
    goalPoints +
    assistPoints +
    cleanSheetPoints +
    defensiveContributionPoints -
    concededPenaltyPoints +
    yellowCardPoints +
    redCardPoints +
    bonusPoints
  );
}

export interface PredictFixtureInput {
  player: Player;
  playerTeam: Team;
  opponentTeam: Team;
  fixture: Fixture;
  isHome: boolean;
  isPreSeason: boolean;
  scoutPredictsStart?: boolean;
  bonusPoints?: number;
}

/** Predicts a single player's expected points for one upcoming fixture. */
export function predictFixturePoints({ player, playerTeam, opponentTeam, fixture, isHome, isPreSeason, scoutPredictsStart, bonusPoints = 0 }: PredictFixtureInput): number {
  if (player.position === 'DEF') {
    return defenderFixturePoints({ player, playerTeam, opponentTeam, fixture, isHome, isPreSeason, scoutPredictsStart, bonusPoints });
  }

  const { plays, playsFull } = appearanceProbability(player, isPreSeason, scoutPredictsStart);
  if (plays === 0) return 0;

  const atkMult = attackMultiplier(playerTeam, opponentTeam, isHome);
  const fixtureDifficulty = isHome ? fixture.teamHDifficulty : fixture.teamADifficulty;
  const opponentDifficulty = isHome ? fixture.teamADifficulty : fixture.teamHDifficulty;
  const csProb = cleanSheetProbability(playerTeam, opponentTeam, isHome, fixtureDifficulty, opponentDifficulty);
  const difficultyScalar = clamp(1 + (3 - fixtureDifficulty) * 0.08, 0.8, 1.2);

  const appearancePoints = plays * 1 + playsFull * 1; // 1 for any appearance, +1 more if 60'+
  const expectedGoals = player.expectedGoalsPer90 * playsFull * atkMult * difficultyScalar;
  const expectedAssists = player.expectedAssistsPer90 * playsFull * atkMult * difficultyScalar;
  const goalPoints = expectedGoals * GOAL_POINTS[player.position];
  const assistPoints = expectedAssists * ASSIST_POINTS;

  // Clean sheets and goals-conceded deductions only score for GKP/DEF/MID.
  const cleanSheetPoints = player.position === 'FWD' ? 0 : csProb * playsFull * CLEAN_SHEET_POINTS[player.position];
  const expectedConceded = player.position === 'GKP' ? player.expectedGoalsConcededPer90 * playsFull * (2 - atkMult) // weaker fixture (high atkMult against us) -> more conceded
      : 0;
  const concededPoints = -(expectedConceded / 2);

  const defensiveContributionPoints = expectedDefensiveContributionPoints(player, playsFull);

  const savesPoints = player.position === 'GKP' ? playsFull * 0.4 : 0; // ~1pt per 3 saves, rough per-game average
  const yellowCardPoints = -(player.yellowCardsPer90 * playsFull);
  const redCardPoints = -(player.redCardsPer90 * playsFull * 2);

  return (
    appearancePoints +
    goalPoints +
    assistPoints +
    cleanSheetPoints +
    concededPoints +
    defensiveContributionPoints +
    savesPoints +
    yellowCardPoints +
    redCardPoints +
    bonusPoints
  );
}

export interface ProjectPlayerInput {
  player: Player;
  teams: Map<number, Team>;
  fixturesByEvent: Map<number, Fixture[]>;
  horizonGameweeks: number[];
  isPreSeason: boolean;
  bonusByFixtureId?: Map<number, Map<number, number>>;
}

/** Builds a multi-gameweek projection for one player across the requested horizon. */
export function projectPlayer({ player, teams, fixturesByEvent, horizonGameweeks, isPreSeason, bonusByFixtureId }: ProjectPlayerInput): PlayerProjection {
  const perGameweek: GameweekPrediction[] = [];
  const playerTeam = teams.get(player.teamId);
  const scoutPredictsStartNextFixture = horizonGameweeks.length > 0 ? SCOUT_PREDICTED_STARTER_IDS.has(player.id) : undefined;

  for (const gw of horizonGameweeks) {
    const fixtures = (fixturesByEvent.get(gw) ?? []).filter(
      (f) => f.teamH === player.teamId || f.teamA === player.teamId
    );
    if (!playerTeam || fixtures.length === 0) {
      // Blank gameweek for this player's team - no fixture, no points.
      perGameweek.push({ gameweek: gw, expectedPoints: 0, opponentTeamId: 0, isHome: false, fixtureDifficulty: 0 });
      continue;
    }
    // Sum across double gameweeks (a team can have two fixtures in one event).
    let gwPoints = 0;
    let lastOpponent = 0;
    let lastHome = false;
    let lastDifficulty = 0;
    const scoutPredictsStart = gw === horizonGameweeks[0] ? scoutPredictsStartNextFixture : undefined;
    for (const fixture of fixtures) {
      const isHome = fixture.teamH === player.teamId;
      const opponentId = isHome ? fixture.teamA : fixture.teamH;
      const opponentTeam = teams.get(opponentId);
      if (!opponentTeam) continue;
      const projectedBonus = bonusByFixtureId?.get(fixture.id)?.get(player.id) ?? 0;
      // Bonus is highly noisy, so only count a third of the projected value in xPts.
      const bonusPoints = projectedBonus / 3;
      gwPoints += predictFixturePoints({ player, playerTeam, opponentTeam, fixture, isHome, isPreSeason, scoutPredictsStart, bonusPoints });
      lastOpponent = opponentId;
      lastHome = isHome;
      lastDifficulty = isHome ? fixture.teamHDifficulty : fixture.teamADifficulty;
    }
    perGameweek.push({
      gameweek: gw,
      expectedPoints: Math.round(gwPoints * 100) / 100,
      opponentTeamId: lastOpponent,
      isHome: lastHome,
      fixtureDifficulty: lastDifficulty,
    });
  }

  if (player.position === 'GKP' && (perGameweek[0]?.expectedPoints ?? 0) === 0) {
    for (const gw of perGameweek) {
      gw.expectedPoints = 0;
    }

    return {
      playerId: player.id,
      webName: player.webName,
      position: player.position,
      teamId: player.teamId,
      priceNowTenths: player.nowCostTenths,
      perGameweek,
      horizonTotal: 0,
    };
  }

  const horizonWindow = perGameweek.slice(0, 3);
  const horizonTotal = horizonWindow.reduce((sum, gw) => sum + gw.expectedPoints, 0);

  return {
    playerId: player.id,
    webName: player.webName,
    position: player.position,
    teamId: player.teamId,
    priceNowTenths: player.nowCostTenths,
    perGameweek,
    horizonTotal: Math.round(horizonTotal * 100) / 100,
  };
}


