import type { Chess, Square } from "chess.js";
import { useCallback, useState } from "react";
import { Chessboard } from "react-chessboard";
import { BOARD_COLORS, BOARD_CONFIG } from "../constants/board-colors";

interface ChessBoardProps {
  position: string;
  game: Chess;
  onPieceSelect: (square: Square | null) => void;
  onDrop: (sourceSquare: Square, targetSquare: Square) => boolean;
  selectedSquare: Square | null;
  lastMove: { from: Square; to: Square } | null;
  boardWidth: number;
}

export default function ChessBoard({
  position,
  game,
  onPieceSelect,
  onDrop,
  selectedSquare,
  lastMove,
  boardWidth,
}: ChessBoardProps) {
  const [legalMoveStyles, setLegalMoveStyles] = useState<
    Record<string, React.CSSProperties>
  >({});

  const handleMouseOverSquare = useCallback(
    ({ square }: { square: string }) => {
      const piece = game.get(square as Square);
      if (piece && piece.color === game.turn()) {
        const moves = game.moves({ square: square as Square, verbose: true });
        const moveStyles: Record<string, React.CSSProperties> = {};

        for (const move of moves) {
          const targetPiece = game.get(move.to);
          if (targetPiece) {
            moveStyles[move.to] = {
              backgroundColor: BOARD_COLORS.validCapture,
              boxShadow: `inset 0 0 0 3px ${BOARD_COLORS.validCapture.replace("0.4", "0.6")}`,
            };
          } else {
            moveStyles[move.to] = {
              backgroundImage: `radial-gradient(circle, ${BOARD_COLORS.validMoveDot} 25%, transparent 25%)`,
              backgroundSize: "50% 50%",
              backgroundPosition: "center",
              backgroundColor: BOARD_COLORS.validMoveDot,
            };
          }
        }

        setLegalMoveStyles(moveStyles);
      } else {
        setLegalMoveStyles({});
      }
    },
    [game]
  );

  const handleMouseOutSquare = useCallback(() => {
    setLegalMoveStyles({});
  }, []);

  const squareStyles = {
    ...(selectedSquare
      ? {
          [selectedSquare]: {
            backgroundColor: BOARD_COLORS.selectedSquare,
            boxShadow: `inset 0 0 0 3px ${BOARD_COLORS.selectedSquare.replace("0.3", "0.6")}`,
          },
        }
      : {}),
    ...(lastMove
      ? {
          [lastMove.from]: {
            backgroundColor: BOARD_COLORS.lastMove,
          },
          [lastMove.to]: {
            backgroundColor: BOARD_COLORS.lastMove,
          },
        }
      : {}),
    ...legalMoveStyles,
  };

  return (
    <div style={{ maxWidth: boardWidth }}>
      <Chessboard
        options={{
          position,
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            return onDrop(sourceSquare as Square, targetSquare as Square);
          },
          onSquareClick: ({ square }) => {
            if (selectedSquare === square) {
              onPieceSelect(null);
            } else {
              onPieceSelect(square as Square);
            }
          },
          onMouseOverSquare: handleMouseOverSquare,
          onMouseOutSquare: handleMouseOutSquare,
          boardOrientation: BOARD_CONFIG.orientation,
          boardStyle: {
            borderRadius: "8px",
            boxShadow:
              "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
          },
          darkSquareStyle: { backgroundColor: BOARD_COLORS.darkSquare },
          lightSquareStyle: { backgroundColor: BOARD_COLORS.lightSquare },
          squareStyles,
          allowDragging: true,
          showNotation: true,
        }}
      />
    </div>
  );
}
