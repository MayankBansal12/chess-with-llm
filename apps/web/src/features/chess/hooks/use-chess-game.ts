import { Chess, type Move, type Square } from "chess.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ApiRequestError,
  getGame,
  offerDraw,
  playMove,
  resignGame,
} from "@/lib/api";
import type { GameSnapshot, MoveInput } from "../types";
import {
  buildPremovePosition,
  getPremoveTargets,
} from "../utils/premove-queue";

interface PromotionDialog {
  from: Square;
  isPremove: boolean;
  to: Square;
}

const chessFromPgn = (pgn: string): Chess => {
  const chess = new Chess();
  if (pgn) {
    chess.loadPgn(pgn);
  }
  return chess;
};

const MAX_QUEUED_PREMOVES = 8;

const queueMove = (movePromise: Promise<boolean>): void => {
  movePromise.catch(() => false);
};

export function useChessGame(gameId: string) {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isThinking, setIsThinking] = useState(false);
  const [isOfferingDraw, setIsOfferingDraw] = useState(false);
  const [isResigning, setIsResigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [premoves, setPremoves] = useState<MoveInput[]>([]);
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
    () => position.history({ verbose: true }),
    [position]
  );
  const premovePosition = useMemo(
    () => buildPremovePosition(position, premoves),
    [position, premoves]
  );
  const isPremoveWindow =
    snapshot?.outcome === "active" &&
    snapshot.turn === "b" &&
    (isThinking || snapshot.isModelThinking);
  const validMoves = useMemo(() => {
    if (!selectedSquare || isOfferingDraw || snapshot?.outcome !== "active") {
      return [];
    }
    const movePosition = isPremoveWindow ? premovePosition : position;
    try {
      return isPremoveWindow
        ? getPremoveTargets(movePosition, selectedSquare)
        : movePosition
            .moves({ square: selectedSquare, verbose: true })
            .map((move) => move.to);
    } catch {
      return [];
    }
  }, [
    isOfferingDraw,
    isPremoveWindow,
    position,
    premovePosition,
    selectedSquare,
    snapshot?.outcome,
  ]);

  const clearPremoves = useCallback((): void => {
    setPremoves([]);
  }, []);

  const handlePremoveCancel = useCallback((): void => {
    clearPremoves();
    setSelectedSquare(null);
  }, [clearPremoves]);

  const enqueuePremove = useCallback(
    (nextPremove: MoveInput): boolean => {
      if (premoves.length >= MAX_QUEUED_PREMOVES) {
        setError(`You can queue up to ${MAX_QUEUED_PREMOVES} premoves`);
        return false;
      }
      setError(null);
      setPremoves((currentPremoves) => [...currentPremoves, nextPremove]);
      setSelectedSquare(null);
      return true;
    },
    [premoves.length]
  );

  const submitMove = useCallback(
    async (moveInput: MoveInput): Promise<boolean> => {
      if (
        snapshot?.outcome !== "active" ||
        snapshot.isModelThinking ||
        isThinking ||
        isOfferingDraw
      ) {
        return false;
      }
      const optimisticBoard = chessFromPgn(snapshot.pgn);
      let move: Move;
      try {
        move = optimisticBoard.move(moveInput);
      } catch {
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
        setSnapshot(
          moveError instanceof ApiRequestError && moveError.game
            ? moveError.game
            : previousSnapshot
        );
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
    [gameId, isOfferingDraw, isThinking, snapshot]
  );

  useEffect(() => {
    const [nextPremove] = premoves;
    if (!nextPremove || isThinking || isOfferingDraw || !snapshot) {
      return;
    }
    if (snapshot.outcome !== "active") {
      clearPremoves();
      return;
    }
    if (snapshot.turn !== "w") {
      return;
    }
    const validationBoard = chessFromPgn(snapshot.pgn);
    try {
      validationBoard.move(nextPremove);
    } catch {
      clearPremoves();
      setError("Your premove queue was cleared because the position changed");
      return;
    }
    setPremoves((currentPremoves) => currentPremoves.slice(1));
    const executePremove = async (): Promise<boolean> => {
      const didMove = await submitMove(nextPremove);
      if (!didMove) {
        clearPremoves();
      }
      return didMove;
    };
    queueMove(executePremove());
  }, [
    clearPremoves,
    isOfferingDraw,
    isThinking,
    premoves,
    snapshot,
    submitMove,
  ]);

  const handleMove = useCallback(
    (sourceSquare: Square, targetSquare: Square): boolean => {
      if (!snapshot || isOfferingDraw || snapshot.outcome !== "active") {
        return false;
      }
      const movePosition = isPremoveWindow ? premovePosition : position;
      const piece = movePosition.get(sourceSquare);
      if (isPremoveWindow) {
        const isValidPremove = getPremoveTargets(
          premovePosition,
          sourceSquare
        ).includes(targetSquare);
        if (!isValidPremove) {
          return false;
        }
      }
      const isPromotion =
        piece?.type === "p" && piece.color === "w" && targetSquare[1] === "8";
      if (isPromotion) {
        setPromotionDialog({
          from: sourceSquare,
          isPremove: isPremoveWindow,
          to: targetSquare,
        });
        return false;
      }
      if (isPremoveWindow) {
        return enqueuePremove({ from: sourceSquare, to: targetSquare });
      }
      if (snapshot.turn !== "w") {
        return false;
      }
      queueMove(submitMove({ from: sourceSquare, to: targetSquare }));
      return true;
    },
    [
      isOfferingDraw,
      isPremoveWindow,
      enqueuePremove,
      position,
      premovePosition,
      snapshot,
      submitMove,
    ]
  );

  const handlePieceSelect = useCallback(
    (square: Square | null) => {
      if (
        !square ||
        isOfferingDraw ||
        snapshot?.outcome !== "active" ||
        (!isPremoveWindow && snapshot.turn !== "w") ||
        (isPremoveWindow ? premovePosition : position).get(square)?.color !==
          "w"
      ) {
        setSelectedSquare(null);
        return;
      }
      setSelectedSquare(square);
    },
    [isOfferingDraw, isPremoveWindow, position, premovePosition, snapshot]
  );

  const handlePromotionSelect = useCallback(
    (promotion: "b" | "n" | "q" | "r") => {
      if (!promotionDialog) {
        return;
      }
      const { from, isPremove, to } = promotionDialog;
      setPromotionDialog(null);
      if (isPremove) {
        enqueuePremove({ from, promotion, to });
        return;
      }
      queueMove(submitMove({ from, promotion, to }));
    },
    [enqueuePremove, promotionDialog, submitMove]
  );

  const handleOfferDraw = useCallback(async (): Promise<void> => {
    if (
      snapshot?.outcome !== "active" ||
      snapshot.turn !== "w" ||
      snapshot.isModelThinking ||
      isThinking ||
      isOfferingDraw
    ) {
      return;
    }
    setError(null);
    setSelectedSquare(null);
    clearPremoves();
    setIsOfferingDraw(true);
    try {
      const updatedGame = await offerDraw(gameId);
      setSnapshot(updatedGame);
      let drawReply: GameSnapshot["modelTurns"][number] | undefined;
      for (const turn of updatedGame.modelTurns) {
        if (turn.kind === "draw_offer") {
          drawReply = turn;
        }
      }
      if (drawReply?.decision === "accept") {
        toast.success(`${updatedGame.model.name} accepted your draw offer`, {
          description: drawReply.message ?? "The game ends in a draw.",
        });
      } else {
        toast.info(`${updatedGame.model.name} rejected your draw offer`, {
          description:
            drawReply?.message ?? "The game continues from this position.",
        });
      }
    } catch (drawError) {
      if (drawError instanceof ApiRequestError && drawError.game) {
        setSnapshot(drawError.game);
      }
      setError(
        drawError instanceof Error
          ? drawError.message
          : "The draw offer could not be delivered"
      );
    } finally {
      setIsOfferingDraw(false);
    }
  }, [clearPremoves, gameId, isOfferingDraw, isThinking, snapshot]);

  const handleResign = useCallback(async (): Promise<void> => {
    if (snapshot?.outcome !== "active" || isResigning) {
      return;
    }
    setError(null);
    clearPremoves();
    setIsResigning(true);
    try {
      setSnapshot(await resignGame(gameId));
    } catch (resignError) {
      if (resignError instanceof ApiRequestError && resignError.game) {
        setSnapshot(resignError.game);
      }
      setError(
        resignError instanceof Error
          ? resignError.message
          : "The game could not be resigned"
      );
    } finally {
      setIsResigning(false);
    }
  }, [clearPremoves, gameId, isResigning, snapshot]);

  return {
    error,
    handleMove,
    handleOfferDraw,
    handlePieceSelect,
    handlePremoveCancel,
    handlePromotionCancel: () => setPromotionDialog(null),
    handlePromotionSelect,
    handleResign,
    isInCheck: position.isCheck(),
    isLoading,
    isOfferingDraw,
    isResigning,
    isThinking,
    moveHistory,
    position,
    premovePosition,
    premoves,
    promotionDialog,
    selectedSquare,
    snapshot,
    validMoves,
  };
}
