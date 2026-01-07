import type { Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { BOARD_COLORS, BOARD_CONFIG } from "../constants/board-colors";

interface ChessBoardProps {
  position: string;
  onPieceSelect: (square: Square | null) => void;
  onDrop: (sourceSquare: Square, targetSquare: Square) => boolean;
  selectedSquare: Square | null;
  lastMove: { from: Square; to: Square } | null;
  boardWidth: number;
}

export default function ChessBoard({
  position,
  onPieceSelect,
  onDrop,
  selectedSquare,
  lastMove,
  boardWidth,
}: ChessBoardProps) {
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
          boardOrientation: BOARD_CONFIG.orientation,
          boardStyle: {
            borderRadius: "4px",
            boxShadow:
              "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
          },
          darkSquareStyle: { backgroundColor: BOARD_COLORS.darkSquare },
          lightSquareStyle: { backgroundColor: BOARD_COLORS.lightSquare },
          squareStyles: {
            ...(selectedSquare
              ? {
                  [selectedSquare]: {
                    backgroundColor: BOARD_COLORS.selectedSquare,
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
          },
          allowDragging: true,
          showNotation: true,
        }}
      />
    </div>
  );
}
