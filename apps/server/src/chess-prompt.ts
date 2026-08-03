import type { Chess } from "chess.js";

export const MODEL_SYSTEM_PROMPT =
  'You are playing Black in a real chess game. Your goal is to beat White. Choose one legal, strong move. Reply with only strict JSON in the form {"move":"e7e5"}, using UCI notation. Never include commentary or markdown.';

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
  invalidMove?: string | null
): string => {
  const retryInstruction = invalidMove
    ? `\n\nYour previous response produced the illegal move "${invalidMove}". Re-check the position and choose a different legal move.`
    : "";

  return `You are Black and it is your move. Choose the best move in this position.\n\nCurrent game PGN:\n${position.pgn || STARTING_POSITION_PGN}\n\nCurrent ASCII board (uppercase = White, lowercase = Black):\n${position.asciiBoard}${retryInstruction}\n\nReturn only the required JSON.`;
};
