// biome-ignore-all lint/style/useFilenamingConvention: React Router uses $param filenames for dynamic routes.
import type { Chess, Move, PieceSymbol, Square } from "chess.js";
import {
  Check,
  ChevronLeft,
  Clipboard,
  Clock3,
  ListOrdered,
  MessageCircle,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import ChessBoard from "@/features/chess/components/chess-board";
import {
  type GameChatMessage,
  HistoryControls,
  ModelChat,
  MoveHistory,
  PlayerBar,
  TournamentMetricsStrip,
} from "@/features/chess/components/game-display";
import ModelTranscript from "@/features/chess/components/model-transcript";
import type { SoundCue } from "@/features/chess/hooks/use-game-sounds";
import { useGameSounds } from "@/features/chess/hooks/use-game-sounds";
import type { MoveTiming } from "@/features/chess/types";
import {
  getCapturedMaterial,
  getPositionAtPly,
} from "@/features/chess/utils/chess-helpers";
import TournamentResultDialog from "@/features/tournament/components/tournament-result-dialog";
import type { TournamentGameSnapshot } from "@/features/tournament/types";
import {
  getTournamentGame,
  resumeTournamentGame,
  runTournamentGame,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/tournament.games.$gameId";

const POLL_INTERVAL_MS = 1800;
const REPLAY_MOVE_INTERVAL_MS = 900;

const shouldShowDiagnostics = (search: string): boolean =>
  import.meta.env.DEV || new URLSearchParams(search).get("debug") === "true";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Tournament Game · Chess with LLM" },
    {
      content: "Watch and replay a public Open Weight Tournament game.",
      name: "description",
    },
  ];
}

const formatDuration = (durationMs: number): string => {
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
};

const getGameStatusCopy = (game: TournamentGameSnapshot): string => {
  if (game.status === "scheduled") {
    return "Game is scheduled";
  }
  if (game.status === "active") {
    return "Game in progress";
  }
  if (game.status === "paused") {
    return "Game paused after a model request interruption";
  }
  if (game.result === "draw") {
    return "Game ended in Draw";
  }
  const winner =
    game.winnerModelId === game.whiteModel.id
      ? game.whiteModel
      : game.blackModel;
  return `${winner.name} won the game`;
};

const getPieceSound = (piece: PieceSymbol): SoundCue => {
  if (piece === "n") {
    return "knight";
  }
  if (piece === "b") {
    return "bishop";
  }
  if (piece === "q") {
    return "queen";
  }
  if (piece === "k") {
    return "king";
  }
  if (piece === "r") {
    return "rook";
  }
  return "move";
};

const getPositionSound = (position: Chess): SoundCue | null => {
  if (position.isCheck()) {
    return "check";
  }
  const latestMove = position.history({ verbose: true }).at(-1);
  if (latestMove?.captured) {
    return "capture";
  }
  return latestMove ? getPieceSound(latestMove.piece) : null;
};

const rejectBoardDrop = (): false => false;
const ignoreSquareSelection = (_square: Square | null): void => undefined;
const ignorePremoveCancel = (): void => undefined;

interface TournamentGamePanelProps {
  activePly: number;
  game: TournamentGameSnapshot;
  isMuted: boolean;
  isReplayPlaying: boolean;
  moveHistory: Move[];
  onSelectPly: (ply: number | null) => void;
  onToggleReplay: () => void;
  onToggleSound: () => void;
  timings: MoveTiming[];
}

function TournamentGamePanel({
  activePly,
  game,
  isMuted,
  isReplayPlaying,
  moveHistory,
  onSelectPly,
  onToggleReplay,
  onToggleSound,
  timings,
}: TournamentGamePanelProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "moves">("moves");
  const [copied, setCopied] = useState(false);
  const showMoves = useCallback(() => setActiveTab("moves"), []);
  const showChat = useCallback(() => setActiveTab("chat"), []);
  const copyLink = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard permissions are optional for spectators.
    }
  }, []);
  const messages = useMemo<GameChatMessage[]>(
    () =>
      game.moves.map((move) => ({
        author:
          move.modelId === game.whiteModel.id
            ? game.whiteModel
            : game.blackModel,
        id: `${game.id}-${move.ply}`,
        moveLabel: move.san,
        text: move.message,
      })),
    [game]
  );
  let thinkingModel: TournamentGameSnapshot["whiteModel"] | null = null;
  if (game.thinkingModelId === game.whiteModel.id) {
    thinkingModel = game.whiteModel;
  } else if (game.thinkingModelId === game.blackModel.id) {
    thinkingModel = game.blackModel;
  }

  return (
    <Card className="h-[min(740px,calc(100dvh-6.5rem))] min-h-[540px] gap-0 py-0 lg:sticky lg:top-4 lg:mt-14 lg:h-[min(720px,calc(100dvh-13.5rem))] lg:min-h-0">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex rounded-lg bg-muted p-1">
          <button
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-xs",
              activeTab === "moves" && "bg-card text-foreground shadow-sm"
            )}
            onClick={showMoves}
            type="button"
          >
            <ListOrdered className="size-3.5" /> Moves
          </button>
          <button
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-xs",
              activeTab === "chat" && "bg-card text-foreground shadow-sm"
            )}
            onClick={showChat}
            type="button"
          >
            <MessageCircle className="size-3.5" /> Chat
          </button>
        </div>
        <div className="flex items-center">
          <Button
            aria-label={
              copied ? "Public game link copied" : "Copy public game link"
            }
            onClick={copyLink}
            size="icon"
            variant="ghost"
          >
            {copied ? <Check /> : <Clipboard />}
          </Button>
          <Button
            aria-label={isMuted ? "Turn sounds on" : "Mute sounds"}
            onClick={onToggleSound}
            size="icon"
            variant="ghost"
          >
            {isMuted ? <VolumeX /> : <Volume2 />}
          </Button>
          {game.status === "completed" && moveHistory.length > 0 ? (
            <Button
              aria-label={isReplayPlaying ? "Pause replay" : "Play replay"}
              onClick={onToggleReplay}
              size="icon"
              variant="ghost"
            >
              {isReplayPlaying ? <Pause /> : <Play />}
            </Button>
          ) : null}
        </div>
      </div>

      <TournamentMetricsStrip
        blackModel={game.blackModel}
        metrics={game.metrics}
        moves={game.moves}
        whiteModel={game.whiteModel}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        {activeTab === "moves" ? (
          <MoveHistory
            activePly={activePly}
            emptyDescription="Waiting for the models to make the first move."
            moves={moveHistory}
            onSelectPly={onSelectPly}
            timings={timings}
          />
        ) : (
          <ModelChat
            emptyDescription="Both models' move explanations will appear here."
            emptyTitle="Waiting for the first move"
            isThinking={thinkingModel !== null}
            messages={messages}
            thinkingModel={thinkingModel}
          />
        )}
      </div>

      {activeTab === "moves" ? (
        <HistoryControls
          activePly={activePly}
          moveCount={moveHistory.length}
          onSelectPly={onSelectPly}
        />
      ) : null}
    </Card>
  );
}

function TournamentGameControl({
  gameId,
  onStarted,
  status,
}: {
  gameId: string | undefined;
  onStarted: (game: TournamentGameSnapshot) => void;
  status: TournamentGameSnapshot["status"];
}) {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLocal =
    import.meta.env.DEV ||
    ["0.0.0.0", "127.0.0.1", "::1", "[::1]", "localhost"].includes(
      window.location.hostname
    );
  const startOrResumeGame = useCallback(async (): Promise<void> => {
    if (!gameId) {
      setError("Tournament game not found");
      return;
    }
    setIsStarting(true);
    setError(null);
    try {
      onStarted(
        status === "paused"
          ? await resumeTournamentGame(gameId)
          : await runTournamentGame(gameId)
      );
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Unable to start this game"
      );
    } finally {
      setIsStarting(false);
    }
  }, [gameId, onStarted, status]);

  if ((status !== "scheduled" && status !== "paused") || !isLocal) {
    return null;
  }

  let actionLabel = status === "paused" ? "Continue game" : "Run game";
  if (isStarting) {
    actionLabel = status === "paused" ? "Resuming…" : "Starting…";
  }

  return (
    <div className="relative">
      <Button disabled={isStarting} onClick={startOrResumeGame} size="sm">
        <Play />
        {actionLabel}
      </Button>
      {error ? (
        <p
          className="absolute top-full right-0 z-10 mt-2 w-64 text-pretty rounded-md border bg-background px-3 py-2 text-destructive text-xs shadow-md"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function TournamentGamePage() {
  const { gameId } = useParams();
  const location = useLocation();
  const showDiagnostics = shouldShowDiagnostics(location.search);
  const [game, setGame] = useState<TournamentGameSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPly, setSelectedPly] = useState<number | null>(null);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const previousMoveCount = useRef<number | null>(null);
  const previousStatus = useRef<TournamentGameSnapshot["status"] | null>(null);
  const { isMuted, play, toggleMuted } = useGameSounds();

  const refreshGame = useCallback(async (): Promise<void> => {
    if (!gameId) {
      setError("Tournament game not found");
      return;
    }
    try {
      const snapshot = await getTournamentGame(gameId, showDiagnostics);
      setGame(snapshot);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load this game"
      );
    }
  }, [gameId, showDiagnostics]);

  useEffect(() => {
    let isCancelled = false;
    const refresh = async (): Promise<void> => {
      if (!isCancelled) {
        await refreshGame();
      }
    };
    refresh().catch(() => undefined);
    const interval = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => {
      isCancelled = true;
      window.clearInterval(interval);
    };
  }, [refreshGame]);

  const moveCount = game?.moves.length ?? 0;
  const activePly = selectedPly ?? moveCount;
  const displayPosition = useMemo(
    () => getPositionAtPly(game?.pgn ?? "", activePly),
    [activePly, game?.pgn]
  );
  const displayMoves = displayPosition.history({ verbose: true });
  const displayLastMove: Move | undefined = displayMoves.at(-1);
  const moveHistory = useMemo(
    () =>
      getPositionAtPly(game?.pgn ?? "", moveCount).history({ verbose: true }),
    [game?.pgn, moveCount]
  );
  const moveTimings = useMemo<MoveTiming[]>(
    () =>
      (game?.moves ?? []).map((move) => ({
        durationMs: move.durationMs,
        ply: move.ply,
        side: "model",
      })),
    [game?.moves]
  );
  const captured = useMemo(
    () => getCapturedMaterial(displayPosition.history({ verbose: true })),
    [displayPosition]
  );

  useEffect(() => {
    if (!game) {
      return;
    }
    const isFirstSnapshot = previousStatus.current === null;
    const didGameEnd =
      previousStatus.current === "active" && game.status === "completed";
    if (isFirstSnapshot && game.status === "completed") {
      setIsResultOpen(true);
    } else if (didGameEnd) {
      play("draw");
      setIsReplayPlaying(false);
      setSelectedPly(null);
      setIsResultOpen(true);
    } else if (
      previousMoveCount.current !== null &&
      game.moves.length > previousMoveCount.current &&
      game.status === "active"
    ) {
      const cue = getPositionSound(
        getPositionAtPly(game.pgn, game.moves.length)
      );
      if (cue) {
        play(cue);
      }
    }
    previousMoveCount.current = game.moves.length;
    previousStatus.current = game.status;
  }, [game, play]);

  useEffect(() => {
    if (selectedPly !== null && selectedPly > moveCount) {
      setSelectedPly(null);
    }
  }, [moveCount, selectedPly]);

  useEffect(() => {
    if (!(game && isReplayPlaying)) {
      return;
    }
    const interval = window.setInterval(() => {
      setSelectedPly((currentPly) => {
        const nextPly = Math.min(moveCount, (currentPly ?? 0) + 1);
        const cue = getPositionSound(getPositionAtPly(game.pgn, nextPly));
        if (cue) {
          play(cue);
        }
        if (nextPly >= moveCount) {
          setIsReplayPlaying(false);
          return null;
        }
        return nextPly;
      });
    }, REPLAY_MOVE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [game, isReplayPlaying, moveCount, play]);

  const selectPly = useCallback(
    (ply: number | null): void => {
      setIsReplayPlaying(false);
      setSelectedPly(ply === null || ply >= moveCount ? null : ply);
    },
    [moveCount]
  );
  const returnToLive = useCallback((): void => {
    selectPly(null);
  }, [selectPly]);
  const startReplay = useCallback((): void => {
    setIsResultOpen(false);
    setSelectedPly(0);
    setIsReplayPlaying(true);
  }, []);
  const toggleReplay = useCallback((): void => {
    if (activePly >= moveCount) {
      setSelectedPly(0);
      setIsReplayPlaying(true);
      return;
    }
    setIsReplayPlaying((isPlaying) => !isPlaying);
  }, [activePly, moveCount]);
  if (!(game || error)) {
    return (
      <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Skeleton className="aspect-square w-full" />
        <Skeleton className="min-h-96" />
      </main>
    );
  }

  if (!game) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-20 text-center">
        <h1 className="text-balance font-bold text-2xl">Game unavailable</h1>
        <p className="mt-3 text-pretty text-destructive text-sm" role="alert">
          {error}
        </p>
        <Button className="mt-6" render={<Link to="/tournament" />}>
          Return to tournament
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1468px] px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 border-b pb-5">
        <div className="grid min-w-0 items-center justify-items-center gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex justify-center md:w-full md:justify-start">
            <Button
              render={<Link to="/tournament" />}
              size="lg"
              variant="outline"
            >
              <ChevronLeft />
              Back to tournament
            </Button>
          </div>
          <div className="min-w-0 text-center">
            <h1 className="truncate text-balance font-bold text-xl sm:text-2xl">
              {game.whiteModel.name} vs {game.blackModel.name}
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              {getGameStatusCopy(game)}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 md:w-full md:justify-end">
            <div className="flex items-center gap-3 text-muted-foreground text-xs tabular-nums">
              <span>Match {game.sequence}</span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1.5">
                <Clock3 aria-hidden="true" className="size-3.5" />
                {formatDuration(game.durationMs)}
              </span>
            </div>
            <TournamentGameControl
              gameId={gameId}
              onStarted={setGame}
              status={game.status}
            />
          </div>
        </div>
      </header>

      {error ? (
        <p className="mb-4 text-pretty text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {game.status === "paused" && game.error ? (
        <p className="mb-4 text-pretty text-amber-700 text-sm dark:text-amber-300">
          The last model request was interrupted. The saved position is safe to
          continue. {game.error}
        </p>
      ) : null}

      <div className="mx-auto grid max-w-[1220px] items-start gap-5 lg:grid-cols-[minmax(0,min(720px,calc(100dvh-13.5rem),calc(100vw-26rem)))_minmax(340px,400px)] lg:justify-center lg:gap-6">
        <section aria-label="Chess board" className="min-w-0">
          <PlayerBar
            captured={captured.white}
            color="b"
            isActive={
              game.status === "active" && displayPosition.turn() === "b"
            }
            isThinking={game.thinkingModelId === game.blackModel.id}
            materialAdvantage={Math.max(0, -captured.materialAdvantage)}
            modelLogoUrl={game.blackModel.logoUrl}
            name={game.blackModel.name}
          />
          <div className="relative">
            <ChessBoard
              disabled
              game={displayPosition}
              isInCheck={displayPosition.isCheck()}
              lastMove={
                displayLastMove
                  ? { from: displayLastMove.from, to: displayLastMove.to }
                  : null
              }
              onDrop={rejectBoardDrop}
              onPieceSelect={ignoreSquareSelection}
              onPremoveCancel={ignorePremoveCancel}
              position={displayPosition.fen()}
              premoves={[]}
              selectedSquare={null}
              validMoves={[]}
            />
            {selectedPly === null ? null : (
              <Button
                className="absolute right-3 bottom-3 z-10 shadow-lg"
                onClick={returnToLive}
                size="sm"
              >
                Return to live
              </Button>
            )}
          </div>
          <PlayerBar
            captured={captured.black}
            color="w"
            isActive={
              game.status === "active" && displayPosition.turn() === "w"
            }
            isThinking={game.thinkingModelId === game.whiteModel.id}
            materialAdvantage={Math.max(0, captured.materialAdvantage)}
            modelLogoUrl={game.whiteModel.logoUrl}
            name={game.whiteModel.name}
          />
          {isReplayPlaying ? (
            <p className="mt-2 text-center text-muted-foreground text-xs">
              Replaying move {activePly} of {moveCount}
            </p>
          ) : null}
        </section>

        <TournamentGamePanel
          activePly={activePly}
          game={game}
          isMuted={isMuted}
          isReplayPlaying={isReplayPlaying}
          moveHistory={moveHistory}
          onSelectPly={selectPly}
          onToggleReplay={toggleReplay}
          onToggleSound={toggleMuted}
          timings={moveTimings}
        />
      </div>

      {showDiagnostics ? (
        <details className="mx-auto mt-6 max-w-[1220px]">
          <summary className="cursor-pointer text-muted-foreground text-xs hover:text-foreground">
            Developer details · prompts, retries, and provider diagnostics
          </summary>
          <ModelTranscript
            isThinking={game.thinkingModelId !== null}
            turns={game.modelTurns}
          />
        </details>
      ) : null}

      {game.status === "completed" ? (
        <TournamentResultDialog
          game={game}
          isOpen={isResultOpen}
          onOpenChange={setIsResultOpen}
          onStartReplay={startReplay}
        />
      ) : null}
    </main>
  );
}
