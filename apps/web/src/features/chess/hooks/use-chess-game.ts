import { Chess, type Move, type Square } from "chess.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
const GAME_POLL_INTERVAL_MS = 3000;
const THINKING_MESSAGE_COUNT = 10;

const getRandomThinkingMessageIndex = (): number =>
  Math.floor(Math.random() * THINKING_MESSAGE_COUNT);

const getNextThinkingMessageIndex = (currentIndex: number): number => {
  const randomOffset =
    Math.floor(Math.random() * (THINKING_MESSAGE_COUNT - 1)) + 1;
  return (currentIndex + randomOffset) % THINKING_MESSAGE_COUNT;
};

const queueMove = (movePromise: Promise<boolean>): void => {
  movePromise.catch(() => false);
};

const isGameContinuation = (basePgn: string, candidatePgn: string): boolean => {
  const baseMoves = chessFromPgn(basePgn).history();
  const candidateMoves = chessFromPgn(candidatePgn).history();
  return baseMoves.every((move, index) => candidateMoves[index] === move);
};

interface MoveRecovery {
  game: GameSnapshot;
  wasAccepted: boolean;
}

interface MoveFailureResolution {
  game: GameSnapshot | null;
  message: string;
  wasAccepted: boolean;
}

const recoverGameAfterMoveFailure = async (
  gameId: string,
  submittedPgn: string,
  includeDiagnostics: boolean
): Promise<MoveRecovery | null> => {
  try {
    const game = await getGame(gameId, includeDiagnostics);
    return {
      game,
      wasAccepted: isGameContinuation(submittedPgn, game.pgn),
    };
  } catch {
    return null;
  }
};

const resolveMoveFailure = async (
  moveError: unknown,
  gameId: string,
  submittedPgn: string,
  includeDiagnostics: boolean
): Promise<MoveFailureResolution> => {
  const fallbackMessage =
    moveError instanceof Error
      ? moveError.message
      : "Your opponent could not move. Try again.";
  if (moveError instanceof ApiRequestError && moveError.game) {
    const wasAccepted = isGameContinuation(submittedPgn, moveError.game.pgn);
    return {
      game: moveError.game,
      message: wasAccepted
        ? ""
        : (moveError.game.modelError ?? fallbackMessage),
      wasAccepted,
    };
  }
  const recovery = await recoverGameAfterMoveFailure(
    gameId,
    submittedPgn,
    includeDiagnostics
  );
  if (!recovery) {
    return { game: null, message: fallbackMessage, wasAccepted: false };
  }
  return {
    game: recovery.game,
    message: recovery.wasAccepted
      ? ""
      : (recovery.game.modelError ?? fallbackMessage),
    wasAccepted: recovery.wasAccepted,
  };
};

export function useChessGame(gameId: string, includeDiagnostics = false) {
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
  const [thinkingMessageIndex, setThinkingMessageIndex] = useState(0);
  const latestRevision = useRef(-1);
  const reconcileGame = useCallback((game: GameSnapshot): void => {
    if (game.revision < latestRevision.current) {
      return;
    }
    latestRevision.current = game.revision;
    setSnapshot(game);
    if (game.modelError) {
      setError(game.modelError);
      setPremoves([]);
    }
  }, []);

  useEffect(() => {
    latestRevision.current = -1;
    setSnapshot(null);
    setError(null);
    setIsLoading(true);
    const abortController = new AbortController();
    const loadGame = async (): Promise<void> => {
      try {
        const game = await getGame(gameId, includeDiagnostics);
        if (!abortController.signal.aborted) {
          reconcileGame(game);
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
  }, [gameId, includeDiagnostics, reconcileGame]);

  useEffect(() => {
    if (!snapshot?.isModelThinking) {
      return;
    }
    let isCancelled = false;
    let pollingTimeout: number | undefined;

    const pollGame = async (): Promise<void> => {
      try {
        const game = await getGame(gameId, includeDiagnostics);
        if (!isCancelled) {
          setThinkingMessageIndex(getNextThinkingMessageIndex);
          reconcileGame(game);
        }
      } catch (pollError) {
        if (pollError instanceof ApiRequestError && pollError.status === 404) {
          setSnapshot((currentGame) =>
            currentGame
              ? { ...currentGame, isModelThinking: false }
              : currentGame
          );
          setError(pollError.message);
        }
      } finally {
        if (!isCancelled) {
          pollingTimeout = window.setTimeout(pollGame, GAME_POLL_INTERVAL_MS);
        }
      }
    };

    pollingTimeout = window.setTimeout(pollGame, GAME_POLL_INTERVAL_MS);
    return () => {
      isCancelled = true;
      if (pollingTimeout !== undefined) {
        window.clearTimeout(pollingTimeout);
      }
    };
  }, [gameId, includeDiagnostics, reconcileGame, snapshot?.isModelThinking]);

  useEffect(() => {
    let isCancelled = false;
    const refreshGame = async (): Promise<void> => {
      try {
        const game = await getGame(gameId, includeDiagnostics);
        if (!isCancelled) {
          reconcileGame(game);
        }
      } catch {
        // Polling and user actions surface authoritative errors when needed.
      }
    };
    const refreshVisibleGame = (): void => {
      if (document.visibilityState === "visible") {
        queueMove(refreshGame().then(() => true));
      }
    };
    const refreshFocusedGame = (): void => {
      queueMove(refreshGame().then(() => true));
    };

    window.addEventListener("focus", refreshFocusedGame);
    window.addEventListener("online", refreshFocusedGame);
    document.addEventListener("visibilitychange", refreshVisibleGame);
    return () => {
      isCancelled = true;
      window.removeEventListener("focus", refreshFocusedGame);
      window.removeEventListener("online", refreshFocusedGame);
      document.removeEventListener("visibilitychange", refreshVisibleGame);
    };
  }, [gameId, includeDiagnostics, reconcileGame]);

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
      setThinkingMessageIndex(getRandomThinkingMessageIndex());
      setIsThinking(true);
      setSnapshot({
        ...snapshot,
        fen: optimisticBoard.fen(),
        lastMove: { from: move.from, san: move.san, to: move.to },
        pgn: optimisticBoard.pgn(),
        turn: optimisticBoard.turn(),
      });
      try {
        reconcileGame(await playMove(gameId, moveInput, includeDiagnostics));
        return true;
      } catch (moveError) {
        const resolution = await resolveMoveFailure(
          moveError,
          gameId,
          optimisticBoard.pgn(),
          includeDiagnostics
        );
        if (resolution.game) {
          reconcileGame(resolution.game);
        } else {
          setSnapshot(previousSnapshot);
        }
        setError(resolution.message || null);
        return resolution.wasAccepted;
      } finally {
        setIsThinking(false);
      }
    },
    [
      gameId,
      includeDiagnostics,
      isOfferingDraw,
      isThinking,
      reconcileGame,
      snapshot,
    ]
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
      const updatedGame = await offerDraw(gameId, includeDiagnostics);
      reconcileGame(updatedGame);
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
        reconcileGame(drawError.game);
      }
      setError(
        drawError instanceof Error
          ? drawError.message
          : "The draw offer could not be delivered"
      );
    } finally {
      setIsOfferingDraw(false);
    }
  }, [
    clearPremoves,
    gameId,
    includeDiagnostics,
    isOfferingDraw,
    isThinking,
    reconcileGame,
    snapshot,
  ]);

  const handleResign = useCallback(async (): Promise<boolean> => {
    if (snapshot?.outcome !== "active" || isResigning) {
      return false;
    }
    setError(null);
    clearPremoves();
    setIsResigning(true);
    try {
      reconcileGame(await resignGame(gameId, includeDiagnostics));
      return true;
    } catch (resignError) {
      if (resignError instanceof ApiRequestError && resignError.game) {
        reconcileGame(resignError.game);
      }
      setError(
        resignError instanceof Error
          ? resignError.message
          : "The game could not be resigned"
      );
      return false;
    } finally {
      setIsResigning(false);
    }
  }, [
    clearPremoves,
    gameId,
    includeDiagnostics,
    isResigning,
    reconcileGame,
    snapshot,
  ]);

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
    thinkingMessageIndex,
    validMoves,
  };
}
