import type { Square } from "chess.js";

export interface ChessModel {
  description: string;
  id: string;
  logoUrl: string;
  name: string;
}

export type GameOutcome =
  | "active"
  | "checkmate"
  | "draw"
  | "stalemate"
  | "model_forfeit"
  | "player_resigned";

export type TerminationReason =
  | "active"
  | "checkmate"
  | "draw_agreement"
  | "draw_by_rule"
  | "model_forfeit"
  | "player_resignation"
  | "stalemate";

export interface GameMetrics {
  totalCostUsd: number;
  totalDurationMs: number;
  totalTokens: number;
}

export interface MoveTiming {
  durationMs: number;
  ply: number;
  side: "model" | "player";
}

export interface ModelAttemptTrace {
  attempt: number;
  candidate: string | null;
  contentTypes: string[];
  diagnosis: ModelAttemptDiagnosis;
  durationMs: number;
  errorMessage: string | null;
  isLegal: boolean;
  outputTokenLimit: number;
  rawStopReason: string | null;
  reasoningCharacters: number;
  request: string;
  response: string;
  stopReason: string | null;
  usage: ModelAttemptUsage;
}

export type ModelAttemptDiagnosis =
  | "accepted"
  | "aborted"
  | "empty_response"
  | "illegal_move"
  | "no_move_parsed"
  | "output_limit"
  | "provider_error"
  | "thinking_only";

export interface ModelAttemptUsage {
  cost: {
    cacheRead: number;
    cacheWrite: number;
    input: number;
    output: number;
    total: number;
  };
  input: number;
  output: number;
  reasoning: number | null;
  totalTokens: number;
}

export interface ModelTurnTrace {
  acceptedMove: string | null;
  asciiBoard: string;
  attempts: ModelAttemptTrace[];
  decision: "accept" | "decline" | null;
  fen: string;
  id: string;
  kind: "draw_offer" | "move";
  message: string | null;
  pgn: string;
  status: "accepted" | "forfeit" | "request_error";
  systemPrompt: string;
}

export interface GameSnapshot {
  expiresAt: number;
  fen: string;
  id: string;
  isModelThinking: boolean;
  lastMove: { from: Square; san: string; to: Square } | null;
  metrics: GameMetrics;
  model: ChessModel;
  modelError: string | null;
  modelTurns: ModelTurnTrace[];
  moveTimings: MoveTiming[];
  outcome: GameOutcome;
  pgn: string;
  playerName: string;
  revision: number;
  terminationReason: TerminationReason;
  turn: "b" | "w";
  winner: "model" | "player" | null;
}

export interface MoveInput {
  from: Square;
  promotion?: "b" | "n" | "q" | "r";
  to: Square;
}
