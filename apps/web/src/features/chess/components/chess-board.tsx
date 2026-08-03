import type { Chess, Square } from "chess.js";
import { useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { BOARD_COLORS, BOARD_CONFIG } from "../constants/board-colors";

interface ChessBoardProps {
  disabled?: boolean;
  game: Chess;
  isInCheck: boolean;
  lastMove: { from: Square; to: Square } | null;
  onDrop: (sourceSquare: Square, targetSquare: Square) => boolean;
  onPieceSelect: (square: Square | null) => void;
  position: string;
  selectedSquare: Square | null;
  validMoves: Square[];
}

const BOARD_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const BOARD_RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

export default function ChessBoard({
  disabled = false,
  game,
  isInCheck,
  lastMove,
  onDrop,
  onPieceSelect,
  position,
  selectedSquare,
  validMoves,
}: ChessBoardProps) {
  const getKingSquare = useCallback((): Square | null => {
    for (const rank of BOARD_RANKS) {
      for (const file of BOARD_FILES) {
        const square = `${file}${rank}` as Square;
        const piece = game.get(square);
        if (piece?.type === "k" && piece.color === game.turn()) {
          return square;
        }
      }
    }
    return null;
  }, [game]);

  const kingSquare = getKingSquare();
  const squareStyles: Record<string, React.CSSProperties> = {};

  if (lastMove) {
    squareStyles[lastMove.from] = {
      backgroundColor: BOARD_COLORS.lastMove,
    };
    squareStyles[lastMove.to] = {
      backgroundColor: BOARD_COLORS.lastMove,
    };
  }
  if (selectedSquare) {
    squareStyles[selectedSquare] = {
      boxShadow: `inset 0 0 0 4px ${BOARD_COLORS.selectedSquare}`,
    };
  }
  for (const square of validMoves) {
    const isCapture = Boolean(game.get(square));
    squareStyles[square] = isCapture
      ? { boxShadow: `inset 0 0 0 5px ${BOARD_COLORS.validCapture}` }
      : { backgroundColor: BOARD_COLORS.validMoveDot };
  }
  if (kingSquare && isInCheck) {
    squareStyles[kingSquare] = {
      boxShadow: `inset 0 0 0 5px ${BOARD_COLORS.checkHighlight}`,
    };
  }

  return (
    <div className="w-full border-8 border-chess-frame bg-chess-frame shadow-xl">
      <Chessboard
        options={{
          allowDragging: !disabled,
          animationDurationInMs: 160,
          boardOrientation: BOARD_CONFIG.orientation,
          boardStyle: {
            borderRadius: "0",
            boxShadow: "none",
          },
          darkSquareStyle: { backgroundColor: BOARD_COLORS.darkSquare },
          lightSquareStyle: { backgroundColor: BOARD_COLORS.lightSquare },
          onPieceDrop: ({ sourceSquare, targetSquare }) =>
            disabled
              ? false
              : onDrop(sourceSquare as Square, targetSquare as Square),
          onSquareClick: ({ square }) => {
            if (disabled) {
              return;
            }
            const clickedSquare = square as Square;
            if (selectedSquare && validMoves.includes(clickedSquare)) {
              onDrop(selectedSquare, clickedSquare);
            } else if (selectedSquare === clickedSquare) {
              onPieceSelect(null);
            } else {
              onPieceSelect(clickedSquare);
            }
          },
          position,
          showNotation: true,
          squareStyles,
        }}
      />
    </div>
  );
}
