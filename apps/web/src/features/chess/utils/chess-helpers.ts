import type { Chess, Square } from "chess.js";

export function formatMoveNumber(moveIndex: number): string {
  return `${Math.floor(moveIndex / 2) + 1}.`;
}

export function getGameStatus(game: Chess): {
  status: "active" | "checkmate" | "stalemate" | "draw";
  message: string;
  inCheck: boolean;
} {
  if (game.isCheckmate()) {
    const winner = game.turn() === "w" ? "Black" : "White";
    return {
      status: "checkmate",
      message: `Checkmate! ${winner} Wins`,
      inCheck: false,
    };
  }

  if (game.isStalemate()) {
    return {
      status: "stalemate",
      message: "Stalemate - Draw",
      inCheck: false,
    };
  }

  if (game.isDraw()) {
    let reason = "Draw";
    if (game.isThreefoldRepetition()) {
      reason = "Draw by Threefold Repetition";
    } else if (game.isInsufficientMaterial()) {
      reason = "Draw by Insufficient Material";
    } else {
      reason = "Draw by Fifty-Move Rule";
    }

    return {
      status: "draw",
      message: reason,
      inCheck: false,
    };
  }

  const inCheck = game.isCheck();
  return {
    status: "active",
    message: inCheck ? "Check!" : "",
    inCheck,
  };
}

export function getValidMoves(game: Chess, square: Square): Square[] {
  try {
    const moves = game.moves({ square, verbose: true });
    return moves.map((move) => move.to);
  } catch {
    return [];
  }
}

export function getTurnLabel(game: Chess): string {
  return game.turn() === "w" ? "White" : "Black";
}
