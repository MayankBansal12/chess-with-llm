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

export interface GameSnapshot {
  fen: string;
  id: string;
  lastMove: { from: Square; san: string; to: Square } | null;
  model: ChessModel;
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
