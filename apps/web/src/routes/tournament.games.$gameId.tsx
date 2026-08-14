// biome-ignore-all lint/style/useFilenamingConvention: React Router uses $param filenames for dynamic routes.
import type { Chess, Move, PieceSymbol, Square } from "chess.js";
import {
  Check,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import ChessBoard from "@/features/chess/components/chess-board";
import ModelLogo from "@/features/chess/components/model-logo";
import ModelTranscript from "@/features/chess/components/model-transcript";
import type { SoundCue } from "@/features/chess/hooks/use-game-sounds";
import { useGameSounds } from "@/features/chess/hooks/use-game-sounds";
import { getPositionAtPly } from "@/features/chess/utils/chess-helpers";
import TournamentResultDialog from "@/features/tournament/components/tournament-result-dialog";
import type {
  TournamentGameSnapshot,
  TournamentMove,
} from "@/features/tournament/types";
import { getTournamentGame } from "@/lib/api";
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

const formatCost = (cost: number): string =>
  cost > 0 && cost < 0.001 ? "<$0.001" : `$${cost.toFixed(3)}`;

const getGameStatusCopy = (game: TournamentGameSnapshot): string => {
  if (game.status === "scheduled") {
    return "Game is scheduled";
  }
  if (game.status === "active") {
    return "Game in progress";
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

function ModelBar({
  color,
  game,
}: {
  color: "b" | "w";
  game: TournamentGameSnapshot;
}) {
  const model = color === "w" ? game.whiteModel : game.blackModel;
  const isThinking = game.thinkingModelId === model.id;
  return (
    <div className="flex min-h-14 items-center gap-3 px-1 py-2">
      <ModelLogo
        className="size-10 rounded-lg"
        logoUrl={model.logoUrl}
        name={model.name}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold text-sm">{model.name}</p>
          {isThinking ? (
            <span className="size-2 rounded-full bg-primary motion-safe:animate-pulse" />
          ) : null}
        </div>
        <p className="mt-0.5 text-muted-foreground text-xs">
          {color === "w" ? "White" : "Black"}
          {isThinking ? " · Thinking…" : ""}
        </p>
      </div>
    </div>
  );
}

function ModelChat({ game }: { game: TournamentGameSnapshot }) {
  const scrollToEnd = useCallback((node: HTMLDivElement | null): void => {
    node?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  return (
    <Card className="order-2 min-h-[28rem] gap-0 overflow-hidden py-0 xl:sticky xl:top-4 xl:order-1 xl:h-[calc(100dvh-6rem)]">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <MessageCircle className="size-4 text-primary" /> Model chat
        </CardTitle>
        <p className="text-pretty text-muted-foreground text-xs">
          Every public move explanation, in one feed.
        </p>
      </CardHeader>
      <CardContent
        aria-live="polite"
        className="min-h-0 flex-1 overflow-y-auto p-3"
      >
        {game.moves.length === 0 ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
            <MessageCircle className="size-5 text-muted-foreground" />
            <p className="mt-3 font-medium text-sm">
              Waiting for the first move
            </p>
            <p className="mt-1 max-w-56 text-pretty text-muted-foreground text-xs">
              Both models&apos; explanations will appear here.
            </p>
          </div>
        ) : null}
        <div className="space-y-3">
          {game.moves.map((move) => {
            const model =
              move.modelId === game.whiteModel.id
                ? game.whiteModel
                : game.blackModel;
            return (
              <div className="flex items-start gap-2.5" key={move.ply}>
                <ModelLogo
                  className="size-7"
                  logoUrl={model.logoUrl}
                  name={model.name}
                />
                <div className="min-w-0 flex-1 rounded-lg rounded-tl-sm bg-muted px-3 py-2">
                  <div className="mb-1 flex items-center gap-2 text-xs">
                    <span className="truncate font-semibold">{model.name}</span>
                    <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
                      {Math.ceil(move.ply / 2)}. {move.san}
                    </span>
                  </div>
                  <p className="text-pretty text-sm">{move.message}</p>
                </div>
              </div>
            );
          })}
          {game.thinkingModelId ? (
            <p className="text-muted-foreground text-xs" role="status">
              {game.thinkingModelId === game.whiteModel.id
                ? game.whiteModel.name
                : game.blackModel.name}{" "}
              is thinking…
            </p>
          ) : null}
          <div
            key={`${game.moves.length}-${game.thinkingModelId ?? "idle"}`}
            ref={scrollToEnd}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function MoveHistory({
  activePly,
  moves,
  onSelectPly,
}: {
  activePly: number;
  moves: TournamentMove[];
  onSelectPly: (ply: number) => void;
}) {
  const pairs = useMemo(() => {
    const result: Array<{
      black: TournamentMove | null;
      number: number;
      white: TournamentMove;
    }> = [];
    for (let index = 0; index < moves.length; index += 2) {
      const white = moves[index];
      if (white) {
        result.push({
          black: moves[index + 1] ?? null,
          number: index / 2 + 1,
          white,
        });
      }
    }
    return result;
  }, [moves]);

  if (pairs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <ListOrdered className="size-5 text-muted-foreground" />
        <p className="mt-3 font-medium text-sm">No moves yet</p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      {pairs.map((pair) => (
        <div
          className="grid grid-cols-[2.25rem_1fr_1fr] gap-1"
          key={pair.number}
        >
          <span className="px-2 py-2 text-right text-muted-foreground text-xs tabular-nums">
            {pair.number}.
          </span>
          <MoveButton
            isActive={activePly === pair.white.ply}
            move={pair.white}
            onSelectPly={onSelectPly}
          />
          {pair.black ? (
            <MoveButton
              isActive={activePly === pair.black.ply}
              move={pair.black}
              onSelectPly={onSelectPly}
            />
          ) : (
            <span className="px-2 py-2 text-muted-foreground">…</span>
          )}
        </div>
      ))}
    </div>
  );
}

function MoveButton({
  isActive,
  move,
  onSelectPly,
}: {
  isActive: boolean;
  move: TournamentMove;
  onSelectPly: (ply: number) => void;
}) {
  const selectMove = useCallback(() => {
    onSelectPly(move.ply);
  }, [move.ply, onSelectPly]);
  return (
    <button
      className={cn(
        "rounded-md px-2 py-2 text-left font-medium text-sm tabular-nums hover:bg-muted",
        isActive && "bg-primary/15 text-primary"
      )}
      onClick={selectMove}
      type="button"
    >
      {move.san}
    </button>
  );
}

const rejectBoardDrop = (): false => false;
const ignoreSquareSelection = (_square: Square | null): void => undefined;
const ignorePremoveCancel = (): void => undefined;

export default function TournamentGamePage() {
  const { gameId } = useParams();
  const location = useLocation();
  const showDiagnostics = shouldShowDiagnostics(location.search);
  const [game, setGame] = useState<TournamentGameSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPly, setSelectedPly] = useState<number | null>(null);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const [copied, setCopied] = useState(false);
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
      setSelectedPly(moveCount);
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
        }
        return nextPly;
      });
    }, REPLAY_MOVE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [game, isReplayPlaying, moveCount, play]);

  const copyLink = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard permissions are optional for spectators.
    }
  }, []);
  const selectPly = useCallback((ply: number): void => {
    setIsReplayPlaying(false);
    setSelectedPly(ply);
  }, []);
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
  const showStartingPosition = useCallback(
    (): void => selectPly(0),
    [selectPly]
  );
  const showPreviousMove = useCallback(
    (): void => selectPly(Math.max(0, activePly - 1)),
    [activePly, selectPly]
  );
  const showNextMove = useCallback(
    (): void => selectPly(Math.min(moveCount, activePly + 1)),
    [activePly, moveCount, selectPly]
  );
  const showLatestPosition = useCallback(
    (): void => selectPly(moveCount),
    [moveCount, selectPly]
  );
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
          <div className="flex items-center justify-center gap-3 text-muted-foreground text-xs tabular-nums md:w-full md:justify-end">
            <span>Match {game.sequence}</span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1.5">
              <Clock3 aria-hidden="true" className="size-3.5" />
              {formatDuration(game.durationMs)}
            </span>
          </div>
        </div>
      </header>

      {error ? (
        <p className="mb-4 text-pretty text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(260px,340px)_minmax(0,680px)_minmax(300px,360px)]">
        <ModelChat game={game} />

        <section
          aria-label="Chess game"
          className="order-1 mx-auto w-full max-w-[680px] xl:order-2"
        >
          <ModelBar color="b" game={game} />
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
          <ModelBar color="w" game={game} />
          {isReplayPlaying ? (
            <p className="mt-2 text-center text-muted-foreground text-xs">
              Replaying move {activePly} of {moveCount}
            </p>
          ) : null}
        </section>

        <Card className="order-3 min-h-[30rem] gap-0 overflow-hidden py-0 xl:sticky xl:top-4 xl:h-[calc(100dvh-6rem)]">
          <CardHeader className="border-b px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ListOrdered className="size-4 text-primary" /> Moves
              </CardTitle>
              <div className="flex items-center gap-1.5">
                <Button
                  aria-label={isMuted ? "Turn sounds on" : "Mute sounds"}
                  onClick={toggleMuted}
                  size="icon-sm"
                  variant="ghost"
                >
                  {isMuted ? <VolumeX /> : <Volume2 />}
                </Button>
                <Button
                  aria-label="Copy public game link"
                  onClick={copyLink}
                  size="icon-sm"
                  variant="ghost"
                >
                  {copied ? <Check /> : <Clipboard />}
                </Button>
                {game.status === "completed" && moveCount > 0 ? (
                  <Button onClick={toggleReplay} size="sm" variant="outline">
                    {isReplayPlaying ? <Pause /> : <Play />}
                    {isReplayPlaying ? "Pause" : "Play replay"}
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <MoveHistory
              activePly={activePly}
              moves={game.moves}
              onSelectPly={selectPly}
            />
            <div className="grid grid-cols-4 border-t p-2">
              <Button
                aria-label="Starting position"
                disabled={activePly === 0}
                onClick={showStartingPosition}
                size="icon"
                variant="ghost"
              >
                <ChevronFirst />
              </Button>
              <Button
                aria-label="Previous move"
                disabled={activePly === 0}
                onClick={showPreviousMove}
                size="icon"
                variant="ghost"
              >
                <ChevronLeft />
              </Button>
              <Button
                aria-label="Next move"
                disabled={activePly === moveCount}
                onClick={showNextMove}
                size="icon"
                variant="ghost"
              >
                <ChevronRight />
              </Button>
              <Button
                aria-label="Latest position"
                disabled={activePly === moveCount}
                onClick={showLatestPosition}
                size="icon"
                variant="ghost"
              >
                <ChevronLast />
              </Button>
            </div>
            <dl className="grid grid-cols-3 border-t bg-muted/20 text-center text-xs tabular-nums">
              <div className="px-2 py-3">
                <dt className="text-muted-foreground">Total time</dt>
                <dd className="mt-1 font-semibold">
                  {formatDuration(game.durationMs)}
                </dd>
              </div>
              <div className="border-l px-2 py-3">
                <dt className="text-muted-foreground">Total tokens</dt>
                <dd className="mt-1 font-semibold">
                  {game.metrics.totalTokens.toLocaleString()}
                </dd>
              </div>
              <div className="border-l px-2 py-3">
                <dt className="text-muted-foreground">Total cost</dt>
                <dd className="mt-1 font-semibold">
                  {formatCost(game.metrics.totalCostUsd)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
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
