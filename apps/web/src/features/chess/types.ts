import type { Square } from "chess.js";

export interface ChessModel {
  description: string;
  id: string;
  name: string;
}

export type GameOutcome =
  | "active"
  | "checkmate"
  | "draw"
  | "stalemate"
  | "model_forfeit";

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
  input: number;
  output: number;
  reasoning: number | null;
  totalTokens: number;
}

export interface ModelTurnTrace {
  asciiBoard: string;
  attempts: ModelAttemptTrace[];
  fen: string;
  id: string;
  pgn: string;
  status: "accepted" | "forfeit" | "request_error";
  systemPrompt: string;
}

export interface GameSnapshot {
  fen: string;
  id: string;
  lastMove: { from: Square; san: string; to: Square } | null;
  model: ChessModel;
  modelTurns: ModelTurnTrace[];
  outcome: GameOutcome;
  pgn: string;
  playerName: string;
  turn: "b" | "w";
  winner: "model" | "player" | null;
}

export interface MoveInput {
  from: Square;
  promotion?: "b" | "n" | "q" | "r";
  to: Square;
}
