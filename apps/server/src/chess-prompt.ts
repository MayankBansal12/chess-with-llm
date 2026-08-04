import type { Chess } from "chess.js";

export const MODEL_SYSTEM_PROMPT =
  'You are playing Black in a real chess game. Your goal is to beat White. In the ASCII board, P/p means pawn, N/n knight, B/b bishop, R/r rook, Q/q queen, and K/k king; lowercase pieces are yours (Black), while uppercase pieces belong to your opponent (White). Choose one legal, strong move and briefly explain your visible intent without revealing private chain-of-thought. Reply with only strict JSON in the form {"move":"e7e5","message":"I am taking space in the center."}, using UCI notation and one sentence of at most 120 characters. Never include markdown.';

export const DRAW_SYSTEM_PROMPT =
  'You are playing Black in a real chess game. In the ASCII board, P/p means pawn, N/n knight, B/b bishop, R/r rook, Q/q queen, and K/k king; lowercase pieces are yours (Black), while uppercase pieces belong to your opponent (White). White has offered a draw. Judge the current position and decide whether to accept. Reply with only strict JSON in the form {"decision":"accept","message":"This position looks balanced."} or {"decision":"decline","message":"I still have chances to play for."}. The message must be one sentence of at most 120 characters. Never include markdown or private chain-of-thought.';

const STARTING_POSITION_PGN = "1. (starting position)";

export interface ModelPosition {
  asciiBoard: string;
  fen: string;
  pgn: string;
}

export const getModelPosition = (chess: Chess): ModelPosition => ({
  asciiBoard: chess.ascii(),
  fen: chess.fen(),
  pgn: chess.pgn(),
});

export const buildModelPrompt = (
  position: ModelPosition,
  previousResponse?: string | null,
  invalidMove?: string | null
): string => {
  const retryInstruction = invalidMove
    ? `\n\nYour previous response produced the illegal move "${invalidMove}". Re-check the position and choose a different legal move.`
    : "";
  const trimmedPreviousResponse = previousResponse?.trim();
  const lastResponseSection = trimmedPreviousResponse
    ? `\n\nYour last response was:\n${trimmedPreviousResponse}`
    : "";

  return `You are Black and it is your move. Choose the best move in this position.\n\nCurrent game PGN:\n${position.pgn || STARTING_POSITION_PGN}${lastResponseSection}\n\nPiece symbols: P/p = pawn, N/n = knight, B/b = bishop, R/r = rook, Q/q = queen, K/k = king. Lowercase pieces are yours (Black); uppercase pieces belong to your opponent (White).\n\nCurrent ASCII board:\n${position.asciiBoard}${retryInstruction}\n\nReturn only the required JSON.`;
};

export const buildDrawOfferPrompt = (
  position: ModelPosition,
  invalidResponse?: string | null
): string => {
  const retryInstruction = invalidResponse
    ? `\n\nYour previous response could not be understood: "${invalidResponse}". Return a valid accept or decline decision.`
    : "";

  return `White offers a draw before making their next move. Decide whether to accept the draw in this exact position.\n\nCurrent FEN:\n${position.fen}\n\nCurrent game PGN:\n${position.pgn || STARTING_POSITION_PGN}\n\nCurrent ASCII board (uppercase = White, lowercase = Black):\n${position.asciiBoard}${retryInstruction}\n\nReturn only the required JSON.`;
};
