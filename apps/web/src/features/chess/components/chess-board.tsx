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
  validMoves: Square[];
  isInCheck: boolean;
  gameStatus: "active" | "checkmate" | "stalemate" | "draw";
}

export default function ChessBoard({
  position,
  game,
  onPieceSelect,
  onDrop,
  selectedSquare,
  lastMove,
  boardWidth,
  validMoves,
  isInCheck,
  gameStatus,
}: ChessBoardProps) {
  const [legalMoveStyles, setLegalMoveStyles] = useState<
    Record<string, React.CSSProperties>
  >({});

  const handleMouseOverSquare = useCallback(
    ({ square }: { square: string }) => {
      if (selectedSquare && validMoves.includes(square as Square)) {
        return;
      }

      const piece = game.get(square as Square);
      if (piece && piece.color === game.turn()) {
        const moves = game.moves({ square: square as Square, verbose: true });
        const moveStyles: Record<string, React.CSSProperties> = {};

        for (const move of moves) {
          const targetPiece = game.get(move.to);
          if (targetPiece) {
            moveStyles[move.to] = {
              backgroundColor: BOARD_COLORS.validCapture,
              boxShadow: `inset 0 0 0 3px ${BOARD_COLORS.validCapture.replace("0.5", "0.7")}`,
            };
          } else {
            moveStyles[move.to] = {
              backgroundImage: `radial-gradient(circle, ${BOARD_COLORS.validMoveDot} 35%, transparent 35%)`,
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            };
          }
        }

        setLegalMoveStyles(moveStyles);
      } else {
        setLegalMoveStyles({});
      }
    },
    [game, selectedSquare, validMoves]
  );

  const handleMouseOutSquare = useCallback(() => {
    if (!selectedSquare) {
      setLegalMoveStyles({});
    }
  }, [selectedSquare]);

  const getKingSquare = useCallback(
    (color: "w" | "b"): Square | null => {
      const kings: Square[] = [];
      for (const row of ["1", "2", "3", "4", "5", "6", "7", "8"]) {
        for (const col of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
          const square = (col + row) as Square;
          const piece = game.get(square);
          if (piece && piece.type === "k" && piece.color === color) {
            kings.push(square);
          }
        }
      }
      return kings[0] || null;
    },
    [game]
  );

  const kingSquare =
    game.turn() === "w" ? getKingSquare("w") : getKingSquare("b");

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
    ...(kingSquare && isInCheck
      ? {
          [kingSquare]: {
            backgroundColor:
              gameStatus === "checkmate"
                ? BOARD_COLORS.checkmateHighlight
                : BOARD_COLORS.checkHighlight,
            boxShadow: `inset 0 0 0 3px ${
              gameStatus === "checkmate"
                ? BOARD_COLORS.checkmateHighlight.replace("0.6", "0.8")
                : BOARD_COLORS.checkHighlight.replace("0.4", "0.6")
            }`,
          },
        }
      : {}),
    ...(selectedSquare && validMoves.length > 0
      ? validMoves.reduce(
          (styles, move) => {
            const targetPiece = game.get(move);
            if (targetPiece) {
              styles[move] = {
                backgroundColor: BOARD_COLORS.validCapture,
                boxShadow: `inset 0 0 0 3px ${BOARD_COLORS.validCapture.replace("0.5", "0.7")}`,
              };
            } else {
              styles[move] = {
                backgroundImage: `radial-gradient(circle, ${BOARD_COLORS.validMoveDot} 35%, transparent 35%)`,
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
              };
            }
            return styles;
          },
          {} as Record<string, React.CSSProperties>
        )
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
            if (selectedSquare && validMoves.includes(square as Square)) {
              onDrop(selectedSquare, square as Square);
            } else if (selectedSquare === square) {
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
