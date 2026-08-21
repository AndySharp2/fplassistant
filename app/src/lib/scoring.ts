// Expected-points model grounded in the official FPL scoring rules
// (see FPL/docs/fpl-rules-grounding.md for the full rule set this encodes).
//
// Uses this season's aggregated stats (per-90 rates, minutes, starts, form, etc.) plus
// current fixture difficulty and fitness/rotation status - never data from previous
// seasons, which wouldn't reflect a player's role/output at their current club.
import type { Fixture, GameweekPrediction, Player, PlayerProjection, Position, ScoutStartLikelihood, Team } from '../types';
import { DEFENSIVE_CONTRIBUTIONS_PER_90 } from './defensiveContributions';
import { SCOUT_PREDICTED_STARTER_IDS, SCOUT_SNAPSHOT_REFRESHED_AT } from './scoutPredictedLineups';

const GOAL_POINTS: Record<Position, number> = { GKP: 6, DEF: 6, MID: 5, FWD: 4 };
const CLEAN_SHEET_POINTS: Record<Position, number> = { GKP: 4, DEF: 4, MID: 1, FWD: 0 };
const ASSIST_POINTS = 3;

// Goals a team concedes in an average fixture. Clean sheets and the goals-conceded penalty
// are both derived from this, so the two can never disagree with each other.
const LEAGUE_AVG_GOALS_CONCEDED_PER_GAME = 1.35;

// How much one Fixture Difficulty Rating point away from neutral (3) moves the multiplier,
// and the furthest a single fixture is allowed to move it in either direction.
const DIFFICULTY_STEP_PER_FDR_POINT = 0.12;
const MAX_FIXTURE_SWING = 1.35;
const MIN_FIXTURE_SWING = 1 / MAX_FIXTURE_SWING;

// Median defensive contributions per 90 by position, measured across the players the
// FotMob snapshot did match. Used when a player is missing from that snapshot - the
// matching failures are unrelated to ability, so scoring them 0 would silently strip
// up to 2 points a game from roughly half the league.
const LEAGUE_MEDIAN_DEFENSIVE_CONTRIBUTIONS_PER_90: Record<Position, number> = { GKP: 0, DEF: 8.1, MID: 7.7, FWD: 3.8 };

// Roughly ten full games - enough of a sample to treat a player's role as established, and
// the point at which a predicted start is taken at face value.
const FULLY_EVIDENCED_MINUTES = 900;
const MIN_MINUTES_FOR_LEAGUE_AVERAGE = 450;

// 25th-percentile xG/xA per 90 among established starters, used only when a player has no
// sample at all. Pre-season the API still serves last season's figures, so anyone new to
// the league reads as 0.00 xG - without a floor they are modelled as unable to score.
const BASELINE_XG_PER_90: Record<Position, number> = { GKP: 0, DEF: 0.03, MID: 0.08, FWD: 0.305 };
const BASELINE_XA_PER_90: Record<Position, number> = { GKP: 0, DEF: 0.03, MID: 0.07, FWD: 0.03 };

// Mean saves per 90 across established starting keepers, and the 3 saves that earn 1 point.
const LEAGUE_AVG_SAVES_PER_90 = 2.6;
const SAVES_PER_POINT = 3;

/** How the Fantasy Football Scout predicted line-ups view a player for the next fixture. */
export type { ScoutStartLikelihood };

export interface ScoutLineups {
  starterIds: ReadonlySet<number>;
  refreshedAt: Date | null;
}

const SCOUT_FULL_TEAM_XI = 11;

// Predicted line-ups describe one specific round of fixtures. Past this age the team news
// has moved on, and trusting it would keep downgrading players who are fit and starting
// again, so the model reverts to judging everyone on form.
const SCOUT_SNAPSHOT_MAX_AGE_MS = 72 * 60 * 60 * 1000;

const BUNDLED_SCOUT_LINEUPS: ScoutLineups = {
  starterIds: SCOUT_PREDICTED_STARTER_IDS,
  refreshedAt: SCOUT_SNAPSHOT_REFRESHED_AT ? new Date(SCOUT_SNAPSHOT_REFRESHED_AT) : null,
};

function isSnapshotUsable(refreshedAt: Date | null, now: number): boolean {
  if (!refreshedAt || Number.isNaN(refreshedAt.getTime())) return false;
  return now - refreshedAt.getTime() <= SCOUT_SNAPSHOT_MAX_AGE_MS;
}

/** The Scout snapshot lists a predicted XI per club. Only when a club's full XI is present
 *  can we read a player's absence as "predicted to be benched"; if the snapshot is partial,
 *  stale, or missing, absence tells us nothing and we fall back to form. */
export function buildScoutStartLookup(
  players: Player[],
  lineups: ScoutLineups = BUNDLED_SCOUT_LINEUPS,
  now: number = Date.now()
): Map<number, ScoutStartLikelihood> {
  const lookup = new Map<number, ScoutStartLikelihood>();
  if (!isSnapshotUsable(lineups.refreshedAt, now)) {
    for (const player of players) lookup.set(player.id, 'unknown');
    return lookup;
  }

  const predictedPerTeam = new Map<number, number>();
  for (const player of players) {
    if (lineups.starterIds.has(player.id)) {
      predictedPerTeam.set(player.teamId, (predictedPerTeam.get(player.teamId) ?? 0) + 1);
    }
  }

  for (const player of players) {
    if (lineups.starterIds.has(player.id)) {
      lookup.set(player.id, 'start');
    } else {
      lookup.set(player.id, (predictedPerTeam.get(player.teamId) ?? 0) >= SCOUT_FULL_TEAM_XI ? 'bench' : 'unknown');
    }
  }
  return lookup;
}

/** Goal and assist rates to model a player with. Rates are per 90, so a player with a
 *  handful of minutes can show a wild figure off one touch; thin samples are shrunk toward
 *  the positional baseline in proportion to how much football actually backs them up. */
function attackingRatesPer90(player: Player): { xgPer90: number; xaPer90: number } {
  const baseline = { xgPer90: BASELINE_XG_PER_90[player.position], xaPer90: BASELINE_XA_PER_90[player.position] };
  if (player.expectedGoalsPer90 <= 0 && player.expectedAssistsPer90 <= 0) return baseline;
  if (player.minutes >= MIN_MINUTES_FOR_LEAGUE_AVERAGE) {
    return { xgPer90: player.expectedGoalsPer90, xaPer90: player.expectedAssistsPer90 };
  }

  const weight = clamp(player.minutes / MIN_MINUTES_FOR_LEAGUE_AVERAGE, 0, 1);
  return {
    xgPer90: player.expectedGoalsPer90 * weight + baseline.xgPer90 * (1 - weight),
    xaPer90: player.expectedAssistsPer90 * weight + baseline.xaPer90 * (1 - weight),
  };
}

/** Probability the player actually appears / completes 60+ minutes in the next fixture.
 *  Before the season kicks off, `minutes`/`starts` still reflect LAST season (often at a
 *  different club, or a since-lost starting spot) - not a reliable signal for this
 *  season's role, so a backup goalkeeper who started plenty of games last year would
 *  otherwise look like a nailed starter. Fall back to current ownership share instead. */
/** How much the player's track record backs up a predicted start. A line-up sheet saying a
 *  player starts is evidence, but for someone with no Premier League minutes at all it is a
 *  guess - and a promoted club's whole back four reads that way. Without this, a £4.0m
 *  defender who has never played scored two thirds of an established £8.0m one. */
function startReliability(player: Player): number {
  if (player.minutes >= FULLY_EVIDENCED_MINUTES) return 1;
  if (player.minutes > 0) return clamp(0.6 + (player.minutes / FULLY_EVIDENCED_MINUTES) * 0.4, 0.6, 1);
  // Nothing on the clock, so fall back to ownership - the crowd's read on whether this
  // player is genuinely in the team.
  return clamp(0.3 + player.selectedByPercent / 30, 0.3, 0.85);
}

function appearanceProbability(
  player: Player,
  isPreSeason: boolean,
  scoutStart: ScoutStartLikelihood = 'unknown'
): { plays: number; playsFull: number } {
  if (['i', 's', 'u'].includes(player.status)) return { plays: 0, playsFull: 0 };
  const chance = player.chanceOfPlayingNextRound;
  const plays = chance === null ? (player.status === 'd' ? 0.75 : 1) : chance / 100;

  if (scoutStart === 'start') {
    const reliability = startReliability(player);
    return { plays: Math.min(plays, 0.95) * reliability, playsFull: Math.min(plays, 0.9) * reliability };
  }

  // Predicted to start on the bench. They can still come on, and the prediction itself can
  // be wrong, so they are downweighted rather than zeroed - zeroing made every non-starter
  // unpickable, including the cheap bench players a legal squad needs.
  if (scoutStart === 'bench') {
    return { plays: Math.min(plays, 0.4), playsFull: Math.min(plays, 0.1) };
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

/** Combines the two fixture-difficulty signals the API exposes - the published FDR and the
 *  team strength ratings - into one multiplier centred on 1.0. They measure the same thing,
 *  so they are averaged rather than multiplied; multiplying them stacked the same signal
 *  twice and allowed a single fixture to swing output by nearly 2x.
 *  `favourability` is positive when the fixture helps the player, negative when it hurts. */
function combinedDifficultyMultiplier(favourability: number, strengthRatio: number | null): number {
  const fdrFactor = clamp(1 + favourability * DIFFICULTY_STEP_PER_FDR_POINT, MIN_FIXTURE_SWING, MAX_FIXTURE_SWING);
  if (strengthRatio === null || !Number.isFinite(strengthRatio)) return fdrFactor;
  const strengthFactor = clamp(strengthRatio, MIN_FIXTURE_SWING, MAX_FIXTURE_SWING);
  return clamp(Math.sqrt(fdrFactor * strengthFactor), MIN_FIXTURE_SWING, MAX_FIXTURE_SWING);
}

/** Mean overall rating in each of the home and away columns. */
export interface StrengthBaseline {
  homeMean: number;
  awayMean: number;
}

/** FPL rates every team's away strength at or above its home strength, so the two columns sit
 *  on different levels and can only be compared after each is centred on its own mean.
 *  Returns null unless every team is rated, since a partial table would skew the means. */
export function deriveStrengthBaseline(teams: Iterable<Team>): StrengthBaseline | null {
  let homeSum = 0;
  let awaySum = 0;
  let count = 0;
  for (const team of teams) {
    if (!(team.strengthOverallHome > 0) || !(team.strengthOverallAway > 0)) return null;
    homeSum += team.strengthOverallHome;
    awaySum += team.strengthOverallAway;
    count += 1;
  }
  if (count === 0) return null;
  return { homeMean: homeSum / count, awayMean: awaySum / count };
}

/** A team's overall rating for this venue, expressed relative to the league average there. */
function overallStrengthIndex(team: Team, isHome: boolean, baseline: StrengthBaseline): number {
  return isHome ? team.strengthOverallHome / baseline.homeMean : team.strengthOverallAway / baseline.awayMean;
}

interface FixtureMultipliers {
  /** Scales the player's goal and assist output for this fixture. */
  attack: number;
  /** Scales the goals the player's team concedes in this fixture. */
  concede: number;
}

/** Resolves one fixture into a single attacking and a single defensive difficulty multiplier. */
function fixtureMultipliers(
  team: Team,
  opponent: Team,
  teamIsHome: boolean,
  teamDifficulty?: number,
  strengthBaseline?: StrengthBaseline | null
): FixtureMultipliers {
  const ourAttack = teamIsHome ? team.strengthAttackHome : team.strengthAttackAway;
  const theirDefence = teamIsHome ? opponent.strengthDefenceAway : opponent.strengthDefenceHome;
  const theirAttack = teamIsHome ? opponent.strengthAttackAway : opponent.strengthAttackHome;
  const ourDefence = teamIsHome ? team.strengthDefenceHome : team.strengthDefenceAway;

  // The split attack/defence ratings read 0 until the FPL model calibrates a few gameweeks in.
  let attackRatio = ourAttack && theirDefence ? ourAttack / theirDefence : null;
  let concedeRatio = theirAttack && ourDefence ? theirAttack / ourDefence : null;

  // While a split is still unpublished the overall ratings stand in for it, so a fixture between
  // mismatched sides is not written off as neutral. Each side is replaced independently, so the
  // real splits take over the moment they appear. Overall rating conflates attack and defence,
  // making this a coarser signal than the ratings it substitutes for.
  if ((attackRatio === null || concedeRatio === null) && strengthBaseline) {
    const ourIndex = overallStrengthIndex(team, teamIsHome, strengthBaseline);
    const theirIndex = overallStrengthIndex(opponent, !teamIsHome, strengthBaseline);
    if (ourIndex > 0 && theirIndex > 0) {
      attackRatio ??= ourIndex / theirIndex;
      concedeRatio ??= theirIndex / ourIndex;
    }
  }

  const favourability = teamDifficulty === undefined ? 0 : 3 - teamDifficulty;

  return {
    attack: combinedDifficultyMultiplier(favourability, attackRatio),
    concede: combinedDifficultyMultiplier(-favourability, concedeRatio),
  };
}

/** Goals the player's team is expected to concede, and the clean-sheet chance that implies. */
function concedeOutlook(player: Player, concedeMultiplier: number): { expectedGoalsAgainst: number; cleanSheetProbability: number } {
  const baseline = player.expectedGoalsConcededPer90 || LEAGUE_AVG_GOALS_CONCEDED_PER_GAME;
  const expectedGoalsAgainst = baseline * concedeMultiplier;
  return {
    expectedGoalsAgainst,
    cleanSheetProbability: clamp(Math.exp(-expectedGoalsAgainst), 0.03, 0.75),
  };
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

  // E[floor(goals / 2)] for goals ~ Poisson. The probability must be advanced to the
  // current goal count before it is weighted, otherwise every term uses P(k-1) and the
  // penalty comes out 50-280% too harsh.
  let probability = Math.exp(-expectedGoalsConceded);
  let totalPenalty = 0;

  for (let goalsConceded = 1; goalsConceded <= 15; goalsConceded++) {
    probability *= expectedGoalsConceded / goalsConceded;
    totalPenalty += Math.floor(goalsConceded / 2) * probability;
  }

  return totalPenalty;
}

function chanceOfConcedingTwoPlus(expectedGoalsConceded: number): number {
  return poissonProbabilityAtLeast(expectedGoalsConceded, 2);
}

function expectedDefensiveContributionPoints(player: Player, playsFull: number): number {
  if (player.position === 'GKP') return 0;
  const measured = DEFENSIVE_CONTRIBUTIONS_PER_90[player.id];
  // The median stands in for a name-matching failure, not for a player who has never
  // played - assuming a league-average rate for someone with no minutes handed free points
  // to entire promoted defences.
  const contributionsPer90 =
    measured ?? (player.minutes >= MIN_MINUTES_FOR_LEAGUE_AVERAGE ? LEAGUE_MEDIAN_DEFENSIVE_CONTRIBUTIONS_PER_90[player.position] : 0);
  if (!contributionsPer90) return 0;

  const threshold = player.position === 'DEF' ? 10 : 12;
  const expectedContributions = contributionsPer90 * playsFull;
  return 2 * poissonProbabilityAtLeast(expectedContributions, threshold);
}

/** Expected save points for a keeper in one fixture. A flat per-game figure penalised weak
 *  teams twice over: they lose the clean sheet and the goals-conceded points without being
 *  credited the extra shots their keeper actually faces. `concedeMultiplier` scales the
 *  workload with the fixture, so a hard game trades clean-sheet odds for saves. */
function expectedSavePoints(player: Player, playsFull: number, concedeMultiplier: number): number {
  if (player.position !== 'GKP' || playsFull <= 0) return 0;

  const measured = player.savesPer90;
  const weight = clamp(player.minutes / MIN_MINUTES_FOR_LEAGUE_AVERAGE, 0, 1);
  const savesPer90 = measured > 0 ? measured * weight + LEAGUE_AVG_SAVES_PER_90 * (1 - weight) : LEAGUE_AVG_SAVES_PER_90;

  return (savesPer90 * playsFull * concedeMultiplier) / SAVES_PER_POINT;
}

function defenderFixtureBpsScore({
  player,
  playerTeam,
  opponentTeam,
  fixture,
  isHome,
  isPreSeason,
  scoutStart,
  strengthBaseline,
}: PredictFixtureInput): number {
  const { plays, playsFull } = appearanceProbability(player, isPreSeason, scoutStart);
  if (plays === 0) return 0;

  const fixtureDifficulty = isHome ? fixture.teamHDifficulty : fixture.teamADifficulty;
  const { attack, concede } = fixtureMultipliers(playerTeam, opponentTeam, isHome, fixtureDifficulty, strengthBaseline);
  const { expectedGoalsAgainst, cleanSheetProbability: csProb } = concedeOutlook(player, concede);
  const { xgPer90, xaPer90 } = attackingRatesPer90(player);
  const expectedGoals = xgPer90 * playsFull * attack;
  const expectedAssists = xaPer90 * playsFull * attack;
  const expectedConceded = expectedGoalsAgainst * playsFull;
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
  scoutStart,
  strengthBaseline,
}: PredictFixtureInput): number {
  if (player.position === 'DEF') {
    return defenderFixtureBpsScore({ player, playerTeam, opponentTeam, fixture, isHome, isPreSeason, scoutStart, strengthBaseline });
  }

  const { plays, playsFull } = appearanceProbability(player, isPreSeason, scoutStart);
  if (plays === 0) return 0;

  const fixtureDifficulty = isHome ? fixture.teamHDifficulty : fixture.teamADifficulty;
  const { attack, concede } = fixtureMultipliers(playerTeam, opponentTeam, isHome, fixtureDifficulty, strengthBaseline);
  const { expectedGoalsAgainst, cleanSheetProbability: csProb } = concedeOutlook(player, concede);

  const { xgPer90, xaPer90 } = attackingRatesPer90(player);
  const expectedGoals = xgPer90 * playsFull * attack;
  const expectedAssists = xaPer90 * playsFull * attack;
  const cleanSheetSignal = player.position === 'FWD' ? 0 : csProb * playsFull;
  const expectedConceded = player.position === 'GKP' ? expectedGoalsAgainst * playsFull : 0;
  const defensiveContributionSignal = expectedDefensiveContributionPoints(player, playsFull);
  const savesSignal = expectedSavePoints(player, playsFull, concede);

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
  scoutStart,
  bonusPoints = 0,
  strengthBaseline,
}: PredictFixtureInput): number {
  const { plays, playsFull } = appearanceProbability(player, isPreSeason, scoutStart);
  if (plays === 0) return 0;

  const fixtureDifficulty = isHome ? fixture.teamHDifficulty : fixture.teamADifficulty;
  const { attack, concede } = fixtureMultipliers(playerTeam, opponentTeam, isHome, fixtureDifficulty, strengthBaseline);
  const { expectedGoalsAgainst, cleanSheetProbability: csProb } = concedeOutlook(player, concede);
  const appearancePoints = plays + playsFull;
  const { xgPer90, xaPer90 } = attackingRatesPer90(player);
  const expectedGoals = xgPer90 * playsFull * attack;
  const expectedAssists = xaPer90 * playsFull * attack;
  const goalPoints = expectedGoals * GOAL_POINTS.DEF;
  const assistPoints = expectedAssists * ASSIST_POINTS;
  const cleanSheetPoints = csProb * playsFull * CLEAN_SHEET_POINTS.DEF;
  const expectedConceded = expectedGoalsAgainst * playsFull;
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
  scoutStart?: ScoutStartLikelihood;
  bonusPoints?: number;
  strengthBaseline?: StrengthBaseline | null;
}

/** Predicts a single player's expected points for one upcoming fixture. */
export function predictFixturePoints({ player, playerTeam, opponentTeam, fixture, isHome, isPreSeason, scoutStart, bonusPoints = 0, strengthBaseline }: PredictFixtureInput): number {
  if (player.position === 'DEF') {
    return defenderFixturePoints({ player, playerTeam, opponentTeam, fixture, isHome, isPreSeason, scoutStart, bonusPoints, strengthBaseline });
  }

  const { plays, playsFull } = appearanceProbability(player, isPreSeason, scoutStart);
  if (plays === 0) return 0;

  const fixtureDifficulty = isHome ? fixture.teamHDifficulty : fixture.teamADifficulty;
  const { attack, concede } = fixtureMultipliers(playerTeam, opponentTeam, isHome, fixtureDifficulty, strengthBaseline);
  const { expectedGoalsAgainst, cleanSheetProbability: csProb } = concedeOutlook(player, concede);

  const appearancePoints = plays * 1 + playsFull * 1; // 1 for any appearance, +1 more if 60'+
  const { xgPer90, xaPer90 } = attackingRatesPer90(player);
  const expectedGoals = xgPer90 * playsFull * attack;
  const expectedAssists = xaPer90 * playsFull * attack;
  const goalPoints = expectedGoals * GOAL_POINTS[player.position];
  const assistPoints = expectedAssists * ASSIST_POINTS;

  // Clean sheets and goals-conceded deductions only score for GKP/DEF/MID.
  const cleanSheetPoints = player.position === 'FWD' ? 0 : csProb * playsFull * CLEAN_SHEET_POINTS[player.position];
  const expectedConceded = player.position === 'GKP' ? expectedGoalsAgainst * playsFull : 0;
  // Same -1 per 2 conceded rule as defenders, so it must use the same expectation.
  const concededPoints = -expectedConcededPenaltyPoints(expectedConceded);

  const defensiveContributionPoints = expectedDefensiveContributionPoints(player, playsFull);

  const savesPoints = expectedSavePoints(player, playsFull, concede);
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
  scoutStart?: ScoutStartLikelihood;
}

/** Builds a multi-gameweek projection for one player across the requested horizon. */
export function projectPlayer({ player, teams, fixturesByEvent, horizonGameweeks, isPreSeason, bonusByFixtureId, scoutStart }: ProjectPlayerInput): PlayerProjection {
  const perGameweek: GameweekPrediction[] = [];
  const playerTeam = teams.get(player.teamId);
  const strengthBaseline = deriveStrengthBaseline(teams.values());

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
    // Predicted line-ups only describe the next fixture, so later gameweeks fall back to form.
    const gameweekScoutStart = gw === horizonGameweeks[0] ? scoutStart : undefined;
    for (const fixture of fixtures) {
      const isHome = fixture.teamH === player.teamId;
      const opponentId = isHome ? fixture.teamA : fixture.teamH;
      const opponentTeam = teams.get(opponentId);
      if (!opponentTeam) continue;
      const projectedBonus = bonusByFixtureId?.get(fixture.id)?.get(player.id) ?? 0;
      // Bonus is highly noisy, so only count a third of the projected value in xPts.
      const bonusPoints = projectedBonus / 3;
      gwPoints += predictFixturePoints({ player, playerTeam, opponentTeam, fixture, isHome, isPreSeason, scoutStart: gameweekScoutStart, bonusPoints, strengthBaseline });
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
      scoutStatus: scoutStart ?? 'unknown',
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
    scoutStatus: scoutStart ?? 'unknown',
  };
}


