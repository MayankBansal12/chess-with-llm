import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";

const PIECE_VALUES: Record<PieceSymbol, number> = {
  b: 3,
  k: 0,
  n: 3,
  p: 1,
  q: 9,
  r: 5,
};

export interface CapturedMaterial {
  black: PieceSymbol[];
  materialAdvantage: number;
  white: PieceSymbol[];
}

export const getCapturedMaterial = (moves: Move[]): CapturedMaterial => {
  const black: PieceSymbol[] = [];
  const white: PieceSymbol[] = [];
  let whiteValue = 0;
  let blackValue = 0;
  for (const move of moves) {
    if (!move.captured) {
      continue;
    }
    if (move.color === "w") {
      black.push(move.captured);
      whiteValue += PIECE_VALUES[move.captured];
    } else {
      white.push(move.captured);
      blackValue += PIECE_VALUES[move.captured];
    }
  }
  return { black, materialAdvantage: whiteValue - blackValue, white };
};

export const getPositionAtPly = (pgn: string, ply: number): Chess => {
  const completeGame = new Chess();
  if (pgn) {
    completeGame.loadPgn(pgn);
  }
  const moves = completeGame.history({ verbose: true });
  const historicalGame = new Chess();
  for (const move of moves.slice(0, ply)) {
    historicalGame.move({
      from: move.from,
      promotion: move.promotion,
      to: move.to,
    });
  }
  return historicalGame;
};

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
      inCheck: false,
      message: `Checkmate! ${winner} Wins`,
      status: "checkmate",
    };
  }

  if (game.isStalemate()) {
    return {
      inCheck: false,
      message: "Stalemate - Draw",
      status: "stalemate",
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
      inCheck: false,
      message: reason,
      status: "draw",
    };
  }

  const inCheck = game.isCheck();
  return {
    inCheck,
    message: inCheck ? "Check!" : "",
    status: "active",
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
