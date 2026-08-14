// biome-ignore-all lint/style/useFilenamingConvention: React Router uses $param filenames for dynamic routes.
import type { Move, Square } from "chess.js";
import {
  Check,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  ListOrdered,
  MessageCircle,
  Radio,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import ChessBoard from "@/features/chess/components/chess-board";
import ModelLogo from "@/features/chess/components/model-logo";
import { getPositionAtPly } from "@/features/chess/utils/chess-helpers";
import type {
  TournamentGameSnapshot,
  TournamentMove,
} from "@/features/tournament/types";
import { getTournamentGame } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/tournament.games.$gameId";

const POLL_INTERVAL_MS = 1800;

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
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
};

const formatCost = (cost: number): string =>
  cost > 0 && cost < 0.001 ? "<$0.001" : `$${cost.toFixed(3)}`;

const getGameResult = (game: TournamentGameSnapshot): string => {
  if (game.status === "scheduled") {
    return "Scheduled";
  }
  if (game.status === "active") {
    return "Live";
  }
  if (game.result === "draw") {
    return "Draw";
  }
  return game.winnerModelId === game.whiteModel.id
    ? `${game.whiteModel.name} wins`
    : `${game.blackModel.name} wins`;
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
    <div className="flex min-h-16 items-center gap-3 px-1 py-2">
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

function MoveHistory({
  activePly,
  moves,
  onSelectPly,
}: {
  activePly: number;
  moves: TournamentMove[];
  onSelectPly: (ply: number | null) => void;
}) {
  const pairs = useMemo(() => {
    const result: Array<{
      black: TournamentMove | null;
      number: number;
      white: TournamentMove;
    }> = [];
    for (let index = 0; index < moves.length; index += 2) {
      const white = moves[index];
      result.push({
        black: moves[index + 1] ?? null,
        number: index / 2 + 1,
        white,
      });
    }
    return result;
  }, [moves]);

  if (pairs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <ListOrdered className="size-5 text-muted-foreground" />
        <p className="mt-3 font-medium text-sm">No moves yet</p>
        <p className="mt-1 text-pretty text-muted-foreground text-xs">
          Moves appear here as the models play.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      {pairs.map((pair) => {
        const whitePly = pair.white.ply;
        const blackPly = pair.black?.ply;
        return (
          <div
            className="grid grid-cols-[2.25rem_1fr_1fr] gap-1"
            key={pair.number}
          >
            <span className="px-2 py-2 text-right text-muted-foreground text-xs tabular-nums">
              {pair.number}.
            </span>
            <MoveHistoryButton
              isActive={activePly === whitePly}
              move={pair.white}
              onSelectPly={onSelectPly}
            />
            {pair.black && blackPly ? (
              <MoveHistoryButton
                isActive={activePly === blackPly}
                move={pair.black}
                onSelectPly={onSelectPly}
              />
            ) : (
              <span className="px-2 py-2 text-muted-foreground">…</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MoveHistoryButton({
  isActive,
  move,
  onSelectPly,
}: {
  isActive: boolean;
  move: TournamentMove;
  onSelectPly: (ply: number | null) => void;
}) {
  const selectMove = useCallback((): void => {
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

function ModelChat({ game }: { game: TournamentGameSnapshot }) {
  return (
    <div aria-live="polite" className="min-h-0 flex-1 overflow-y-auto p-3">
      {game.moves.length === 0 ? (
        <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
          <MessageCircle className="size-5 text-muted-foreground" />
          <p className="mt-3 font-medium text-sm">
            The models are quiet—for now
          </p>
          <p className="mt-1 max-w-56 text-pretty text-muted-foreground text-xs">
            Both models&apos; public move explanations appear here.
          </p>
        </div>
      ) : null}
      <div className="space-y-3">
        {game.moves.map((move) => {
          const model =
            move.modelId === game.whiteModel.id
              ? game.whiteModel
              : game.blackModel;
          const isWhite = move.color === "w";
          return (
            <div
              className={cn(
                "flex items-start gap-2.5",
                !isWhite && "flex-row-reverse"
              )}
              key={move.ply}
            >
              <ModelLogo
                className="size-7"
                logoUrl={model.logoUrl}
                name={model.name}
              />
              <div
                className={cn(
                  "min-w-0 max-w-[82%] rounded-lg bg-muted px-3 py-2",
                  isWhite ? "rounded-tl-sm" : "rounded-tr-sm"
                )}
              >
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <span className="truncate font-semibold">{model.name}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {move.san}
                  </span>
                </div>
                <p className="text-pretty text-sm">{move.message}</p>
              </div>
            </div>
          );
        })}
        {game.thinkingModelId ? (
          <p
            className="text-center text-muted-foreground text-xs"
            role="status"
          >
            {game.thinkingModelId === game.whiteModel.id
              ? game.whiteModel.name
              : game.blackModel.name}{" "}
            is thinking…
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function TournamentGamePage() {
  const { gameId } = useParams();
  const [game, setGame] = useState<TournamentGameSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "moves">("moves");
  const [selectedPly, setSelectedPly] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const refreshGame = useCallback(async (): Promise<void> => {
    if (!gameId) {
      setError("Tournament game not found");
      return;
    }
    try {
      const snapshot = await getTournamentGame(gameId);
      setGame(snapshot);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load this game"
      );
    }
  }, [gameId]);

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
    if (selectedPly !== null && selectedPly > moveCount) {
      setSelectedPly(moveCount);
    }
  }, [moveCount, selectedPly]);

  const copyLink = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard permissions are optional for spectators.
    }
  }, []);
  const showMoves = useCallback((): void => setActiveTab("moves"), []);
  const showChat = useCallback((): void => setActiveTab("chat"), []);
  const showStartingPosition = useCallback((): void => setSelectedPly(0), []);
  const showPreviousMove = useCallback(
    (): void => setSelectedPly(Math.max(0, activePly - 1)),
    [activePly]
  );
  const showNextMove = useCallback((): void => {
    const nextPly = Math.min(moveCount, activePly + 1);
    setSelectedPly(nextPly === moveCount ? null : nextPly);
  }, [activePly, moveCount]);
  const showLatestPosition = useCallback((): void => setSelectedPly(null), []);

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
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            className="text-muted-foreground text-xs outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            to="/tournament"
          >
            ← Open Weight Tournament
          </Link>
          <h1 className="mt-2 text-balance font-bold text-xl sm:text-2xl">
            {game.whiteModel.name} vs {game.blackModel.name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-md border px-3 font-medium text-xs uppercase tracking-wider",
              game.status === "active" && "border-primary/40 text-primary"
            )}
          >
            {game.status === "active" ? (
              <Radio className="size-3.5 motion-safe:animate-pulse" />
            ) : null}
            {getGameResult(game)}
          </span>
          <Button
            aria-label="Copy public game link"
            onClick={copyLink}
            size="icon"
            variant="outline"
          >
            {copied ? (
              <Check className="size-4" />
            ) : (
              <Clipboard className="size-4" />
            )}
          </Button>
        </div>
      </header>

      {error ? (
        <p className="mb-4 text-pretty text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section
          aria-label="Chess game"
          className="mx-auto w-full max-w-[720px]"
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
          <p className="mt-2 text-center text-muted-foreground text-xs">
            Spectator mode · This public game is read-only
          </p>
        </section>

        <Card className="min-h-[34rem] overflow-hidden p-0 lg:sticky lg:top-4 lg:h-[calc(100dvh-7rem)]">
          <CardHeader className="border-b px-4 py-3">
            <div className="grid grid-cols-2 rounded-lg bg-muted p-1">
              <button
                className={cn(
                  "rounded-md px-3 py-2 font-medium text-xs",
                  activeTab === "moves" && "bg-background shadow-sm"
                )}
                onClick={showMoves}
                type="button"
              >
                Moves
              </button>
              <button
                className={cn(
                  "rounded-md px-3 py-2 font-medium text-xs",
                  activeTab === "chat" && "bg-background shadow-sm"
                )}
                onClick={showChat}
                type="button"
              >
                Model chat
              </button>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            {activeTab === "moves" ? (
              <MoveHistory
                activePly={activePly}
                moves={game.moves}
                onSelectPly={setSelectedPly}
              />
            ) : (
              <ModelChat game={game} />
            )}
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
                <dt className="text-muted-foreground">Tokens</dt>
                <dd className="mt-1 font-semibold">
                  {game.metrics.totalTokens.toLocaleString()}
                </dd>
              </div>
              <div className="border-x px-2 py-3">
                <dt className="text-muted-foreground">Response time</dt>
                <dd className="mt-1 font-semibold">
                  {formatDuration(game.metrics.totalDurationMs)}
                </dd>
              </div>
              <div className="px-2 py-3">
                <dt className="text-muted-foreground">Cost</dt>
                <dd className="mt-1 font-semibold">
                  {formatCost(game.metrics.totalCostUsd)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
