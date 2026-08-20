// Domain types for FPL data and the client-side recommendation engine.
export type Position = 'GKP' | 'DEF' | 'MID' | 'FWD';

export interface Team {
  id: number;
  code: number;
  name: string;
  shortName: string;
  strengthOverallHome: number;
  strengthOverallAway: number;
  strengthAttackHome: number;
  strengthAttackAway: number;
  strengthDefenceHome: number;
  strengthDefenceAway: number;
}

export interface Player {
  id: number;
  code: number;
  webName: string;
  fullName: string;
  teamId: number;
  position: Position;
  nowCostTenths: number; // e.g. 84 = £8.4m
  totalPoints: number;
  pointsPerGame: number;
  form: number;
  selectedByPercent: number;
  minutes: number;
  starts: number;
  chanceOfPlayingNextRound: number | null; // 0-100, null = unknown/fit
  status: string; // 'a' available, 'd' doubtful, 'i' injured, 's' suspended, 'u' unavailable
  expectedGoalsPer90: number;
  expectedAssistsPer90: number;
  expectedGoalsConcededPer90: number;
  cleanSheetsPer90: number;
  bonusPerGame: number;
  yellowCardsPer90: number;
  redCardsPer90: number;
}

export interface Fixture {
  id: number;
  event: number | null;
  teamH: number;
  teamA: number;
  teamHDifficulty: number;
  teamADifficulty: number;
  kickoffTime: string | null;
  finished: boolean;
}

export interface SquadPlayer {
  playerId: number;
  purchasePrice: number;
  inStartingXI: boolean;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
}

export type Chip = 'wildcard' | 'freehit' | 'benchboost' | 'triplecaptain';

export interface Squad {
  players: SquadPlayer[];
  bank: number;
  freeTransfers: number;
  chipsAvailable: Chip[];
  activeChip: Chip | null; // the chip being played this gameweek, if any
}

export interface GameweekPrediction {
  gameweek: number;
  expectedPoints: number;
  opponentTeamId: number;
  isHome: boolean;
  fixtureDifficulty: number;
}

export interface PlayerProjection {
  playerId: number;
  webName: string;
  position: Position;
  teamId: number;
  priceNowTenths: number;
  perGameweek: GameweekPrediction[];
  horizonTotal: number;
}

export interface TransferSuggestion {
  out: { playerId: number; webName: string };
  in: { playerId: number; webName: string; priceTenths: number };
  horizonPointsGain: number;
  transferCost: number;
  netGain: number;
  recommendedGameweek: number;
  reason: string;
}

export interface RecommendationResult {
  horizonGameweeks: number;
  freeTransfersAvailable: number;
  suggestions: TransferSuggestion[];
  doNothingBaseline: number;
  resultingSquad: Squad;
  notes: string[];
}
