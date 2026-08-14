import type { Square } from "chess.js";
import type { ChessModel, GameMetrics } from "./chess-games";

export type TournamentGroup = "A" | "B";
export type TournamentStage = "final" | "group" | "semifinal";
export type TournamentGameStatus = "active" | "completed" | "scheduled";
export type TournamentResult = "black" | "draw" | "white";

export interface TournamentStanding {
  draws: number;
  group: TournamentGroup;
  losses: number;
  model: ChessModel;
  nr: number;
  played: number;
  points: number;
  rank: number;
  seed: number;
  wins: number;
}

export interface TournamentMove {
  color: "b" | "w";
  costUsd: number;
  createdAt: number;
  durationMs: number;
  fenAfter: string;
  message: string;
  modelId: string;
  ply: number;
  san: string;
  tokens: number;
  uci: string;
}

export interface TournamentGameSummary {
  blackModel: ChessModel;
  blackNr: number;
  completedAt: number | null;
  durationMs: number;
  error: string | null;
  group: TournamentGroup | null;
  id: string;
  lastMove: { from: Square; san: string; to: Square } | null;
  metrics: GameMetrics;
  moveCount: number;
  result: TournamentResult | null;
  sequence: number;
  stage: TournamentStage;
  startedAt: number | null;
  status: TournamentGameStatus;
  terminationReason: string | null;
  thinkingModelId: string | null;
  whiteModel: ChessModel;
  whiteNr: number;
  winnerModelId: string | null;
}

export interface TournamentGameSnapshot extends TournamentGameSummary {
  fen: string;
  moves: TournamentMove[];
  pgn: string;
  revision: number;
  turn: "b" | "w";
}

export interface TournamentSnapshot {
  activeGameId: string | null;
  completedGames: number;
  games: TournamentGameSummary[];
  groups: Record<TournamentGroup, TournamentStanding[]>;
  id: string;
  name: string;
  scheduledGames: number;
  status: "complete" | "live" | "ready";
}
