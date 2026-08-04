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
  onPremoveCancel: () => void;
  position: string;
  premoves: Array<{ from: Square; to: Square }>;
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
  onPremoveCancel,
  position,
  premoves,
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
  for (const premove of premoves) {
    squareStyles[premove.from] = {
      boxShadow: `inset 0 0 0 4px ${BOARD_COLORS.premove}`,
    };
    squareStyles[premove.to] = {
      boxShadow: `inset 0 0 0 4px ${BOARD_COLORS.premove}`,
    };
  }
  for (const square of validMoves) {
    const isCapture = Boolean(game.get(square));
    squareStyles[square] = isCapture
      ? {
          backgroundImage: `radial-gradient(circle at center, transparent 0 58%, ${BOARD_COLORS.validCapture} 59% 76%, transparent 77%)`,
        }
      : {
          backgroundImage: `radial-gradient(circle at center, ${BOARD_COLORS.validMoveDot} 0 13%, transparent 14%)`,
        };
  }
  if (kingSquare && isInCheck) {
    squareStyles[kingSquare] = {
      boxShadow: `inset 0 0 0 5px ${BOARD_COLORS.checkHighlight}`,
    };
  }

  return (
    <div className="w-full overflow-hidden rounded-lg bg-chess-frame shadow-lg ring-1 ring-black/15">
      <Chessboard
        options={{
          allowDragging: !disabled,
          animationDurationInMs: 160,
          boardOrientation: BOARD_CONFIG.orientation,
          boardStyle: {
            borderRadius: "0.5rem",
            boxShadow: "none",
          },
          canDragPiece: ({ piece }) =>
            !disabled && piece.pieceType.startsWith("w"),
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
          onSquareRightClick: onPremoveCancel,
          position,
          showNotation: true,
          squareStyles,
        }}
      />
    </div>
  );
}
