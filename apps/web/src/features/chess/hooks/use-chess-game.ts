import { Chess, type Square } from "chess.js";
import { useCallback, useMemo, useState } from "react";

export type GameStatus = "active" | "checkmate" | "stalemate" | "draw";

export interface MoveRecord {
  san: string;
  from: Square;
  to: Square;
  piece: string;
  color: string;
}

export function useChessGame() {
  const [position, setPosition] = useState<Chess>(new Chess());
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [validMoves, setValidMoves] = useState<Square[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(
    null
  );
  const [moveHistory, setMoveHistory] = useState<MoveRecord[]>([]);
  const [gameStatus, setGameStatus] = useState<GameStatus>("active");
  const [statusMessage, setStatusMessage] = useState("");
  const [isInCheck, setIsInCheck] = useState(false);

  const currentTurn = useMemo(() => position.turn(), [position]);

  const updateGameStatus = useCallback((game: Chess) => {
    if (game.isCheckmate()) {
      setGameStatus("checkmate");
      const winner = game.turn() === "w" ? "Black" : "White";
      setStatusMessage(`Checkmate! ${winner} Wins`);
      setIsInCheck(false);
      return;
    }

    if (game.isStalemate()) {
      setGameStatus("stalemate");
      setStatusMessage("Stalemate - Draw");
      setIsInCheck(false);
      return;
    }

    if (game.isDraw()) {
      setGameStatus("draw");
      let reason = "Draw";
      if (game.isThreefoldRepetition()) {
        reason = "Draw by Threefold Repetition";
      } else if (game.isInsufficientMaterial()) {
        reason = "Draw by Insufficient Material";
      } else {
        reason = "Draw by Fifty-Move Rule";
      }
      setStatusMessage(reason);
      setIsInCheck(false);
      return;
    }

    const inCheck = game.isCheck();
    setIsInCheck(inCheck);
    setGameStatus("active");
    setStatusMessage(inCheck ? "Check!" : "");
  }, []);

  const handlePieceSelect = useCallback(
    (square: Square | null) => {
      if (gameStatus !== "active") {
        return;
      }

      if (!square) {
        setSelectedSquare(null);
        setValidMoves([]);
        return;
      }

      const piece = position.get(square);
      if (!piece || piece.color !== position.turn()) {
        setSelectedSquare(null);
        setValidMoves([]);
        return;
      }

      const moves = position.moves({ square, verbose: true });
      const validSquares = moves.map((move) => move.to);

      setSelectedSquare(square);
      setValidMoves(validSquares);
    },
    [position, gameStatus]
  );

  const handleMove = useCallback(
    (sourceSquare: Square, targetSquare: Square) => {
      if (gameStatus !== "active") {
        return false;
      }

      try {
        const move = position.move({ from: sourceSquare, to: targetSquare });
        if (!move) {
          return false;
        }

        const moveRecord: MoveRecord = {
          san: move.san,
          from: move.from,
          to: move.to,
          piece: move.piece,
          color: move.color,
        };

        setLastMove({ from: move.from, to: move.to });
        setMoveHistory((prev) => [...prev, moveRecord]);
        setSelectedSquare(null);
        setValidMoves([]);
        updateGameStatus(position);

        return true;
      } catch {
        return false;
      }
    },
    [position, gameStatus, updateGameStatus]
  );

  const resetGame = useCallback(() => {
    const newGame = new Chess();
    setPosition(newGame);
    setSelectedSquare(null);
    setValidMoves([]);
    setLastMove(null);
    setMoveHistory([]);
    setGameStatus("active");
    setStatusMessage("");
    setIsInCheck(false);
  }, []);

  return {
    position,
    selectedSquare,
    validMoves,
    lastMove,
    moveHistory,
    gameStatus,
    statusMessage,
    currentTurn,
    isInCheck,
    handlePieceSelect,
    handleMove,
    resetGame,
  };
}
