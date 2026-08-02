import { Chess, type Move, type Square } from "chess.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getGame, playMove } from "@/lib/api";
import type { GameSnapshot, MoveInput } from "../types";

interface PromotionDialog {
  from: Square;
  to: Square;
}

const chessFromPgn = (pgn: string): Chess => {
  const chess = new Chess();
  if (pgn) {
    chess.loadPgn(pgn);
  }
  return chess;
};

const getMoveRecord = (move: Move) => ({
  color: move.color,
  from: move.from,
  piece: move.piece,
  san: move.san,
  to: move.to,
});

const queueMove = (movePromise: Promise<boolean>): void => {
  movePromise.catch(() => false);
};

export function useChessGame(gameId: string) {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [promotionDialog, setPromotionDialog] =
    useState<PromotionDialog | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    const loadGame = async (): Promise<void> => {
      try {
        const game = await getGame(gameId);
        if (!abortController.signal.aborted) {
          setSnapshot(game);
        }
      } catch (loadError) {
        if (!abortController.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load this match"
          );
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    };
    loadGame();
    return () => abortController.abort();
  }, [gameId]);

  const position = useMemo(
    () => chessFromPgn(snapshot?.pgn ?? ""),
    [snapshot?.pgn]
  );
  const moveHistory = useMemo(
    () => position.history({ verbose: true }).map(getMoveRecord),
    [position]
  );
  const validMoves = useMemo(() => {
    if (!selectedSquare || isThinking || snapshot?.outcome !== "active") {
      return [];
    }
    return position
      .moves({ square: selectedSquare, verbose: true })
      .map((move) => move.to);
  }, [isThinking, position, selectedSquare, snapshot?.outcome]);

  const submitMove = useCallback(
    async (moveInput: MoveInput): Promise<boolean> => {
      if (snapshot?.outcome !== "active" || isThinking) {
        return false;
      }
      const optimisticBoard = chessFromPgn(snapshot.pgn);
      let move: Move;
      try {
        move = optimisticBoard.move(moveInput);
      } catch {
        setError("That piece cannot move there");
        return false;
      }

      const previousSnapshot = snapshot;
      setError(null);
      setSelectedSquare(null);
      setIsThinking(true);
      setSnapshot({
        ...snapshot,
        fen: optimisticBoard.fen(),
        lastMove: { from: move.from, san: move.san, to: move.to },
        pgn: optimisticBoard.pgn(),
        turn: optimisticBoard.turn(),
      });
      try {
        setSnapshot(await playMove(gameId, moveInput));
        return true;
      } catch (moveError) {
        setSnapshot(previousSnapshot);
        setError(
          moveError instanceof Error
            ? moveError.message
            : "Your opponent could not move. Try again."
        );
        return false;
      } finally {
        setIsThinking(false);
      }
    },
    [gameId, isThinking, snapshot]
  );

  const handleMove = useCallback(
    (sourceSquare: Square, targetSquare: Square): boolean => {
      if (!snapshot || isThinking || snapshot.turn !== "w") {
        return false;
      }
      const piece = position.get(sourceSquare);
      const isPromotion =
        piece?.type === "p" && piece.color === "w" && targetSquare[1] === "8";
      if (isPromotion) {
        setPromotionDialog({ from: sourceSquare, to: targetSquare });
        return false;
      }
      queueMove(submitMove({ from: sourceSquare, to: targetSquare }));
      return true;
    },
    [isThinking, position, snapshot, submitMove]
  );

  const handlePieceSelect = useCallback(
    (square: Square | null) => {
      if (
        !square ||
        isThinking ||
        snapshot?.outcome !== "active" ||
        snapshot.turn !== "w" ||
        position.get(square)?.color !== "w"
      ) {
        setSelectedSquare(null);
        return;
      }
      setSelectedSquare(square);
    },
    [isThinking, position, snapshot]
  );

  const handlePromotionSelect = useCallback(
    (promotion: "b" | "n" | "q" | "r") => {
      if (!promotionDialog) {
        return;
      }
      const { from, to } = promotionDialog;
      setPromotionDialog(null);
      queueMove(submitMove({ from, promotion, to }));
    },
    [promotionDialog, submitMove]
  );

  return {
    error,
    handleMove,
    handlePieceSelect,
    handlePromotionCancel: () => setPromotionDialog(null),
    handlePromotionSelect,
    isInCheck: position.isCheck(),
    isLoading,
    isThinking,
    moveHistory,
    position,
    promotionDialog,
    selectedSquare,
    snapshot,
    validMoves,
  };
}
