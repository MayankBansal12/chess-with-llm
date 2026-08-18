import type { Move, PieceSymbol } from "chess.js";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  ListOrdered,
  MessageCircle,
} from "lucide-react";
import { useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import type {
  ChessModel,
  GameMetrics,
  ModelTurnTrace,
  MoveTiming,
} from "@/features/chess/types";
import { cn } from "@/lib/utils";
import ModelLogo from "./model-logo";

const PIECE_GLYPHS: Record<"b" | "w", Record<PieceSymbol, string>> = {
  b: { b: "♝", k: "♚", n: "♞", p: "♟", q: "♛", r: "♜" },
  w: { b: "♗", k: "♔", n: "♘", p: "♙", q: "♕", r: "♖" },
};

interface PlayerBarProps {
  captured: PieceSymbol[];
  color: "b" | "w";
  isActive: boolean;
  isThinking?: boolean;
  materialAdvantage: number;
  modelLogoUrl?: string;
  name: string;
  thinkingText?: string;
}

export function PlayerBar({
  captured,
  color,
  isActive,
  isThinking = false,
  materialAdvantage,
  modelLogoUrl,
  name,
  thinkingText,
}: PlayerBarProps) {
  const capturedGroups = (["q", "r", "b", "n", "p"] as const)
    .map((piece) => ({
      count: captured.filter((capturedPiece) => capturedPiece === piece).length,
      piece,
    }))
    .filter(({ count }) => count > 0);
  const hasCapturedMaterial = captured.length > 0 || materialAdvantage > 0;

  return (
    <div className="flex min-h-14 items-center gap-3 px-1 py-2">
      <div className="flex shrink-0 items-center">
        {modelLogoUrl ? (
          <ModelLogo
            className="size-10 rounded-lg"
            logoUrl={modelLogoUrl}
            name={name}
          />
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <CircleUserRound className="size-5" />
          </span>
        )}
      </div>
      <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold text-sm">{name}</span>
          {isActive ? (
            <span
              className={cn(
                "size-2 shrink-0 rounded-full bg-primary",
                isThinking && "motion-safe:animate-pulse"
              )}
            />
          ) : null}
        </span>
        {hasCapturedMaterial ? (
          <span
            className={cn(
              "col-start-2 row-start-1 flex shrink-0 items-center gap-1 self-center text-muted-foreground text-xs",
              isThinking && "row-span-2"
            )}
          >
            {captured.length > 0 ? (
              <span
                aria-label={`${captured.length} captured pieces`}
                className="flex"
                role="img"
              >
                {capturedGroups.map(({ count, piece }) => (
                  <span className="-ml-0.5 text-base first:ml-0" key={piece}>
                    {PIECE_GLYPHS[color === "w" ? "b" : "w"][piece].repeat(
                      count
                    )}
                  </span>
                ))}
              </span>
            ) : null}
            {materialAdvantage > 0 ? (
              <span className="font-medium tabular-nums">
                +{materialAdvantage}
              </span>
            ) : null}
          </span>
        ) : null}
        {isThinking ? (
          <span
            className="motion-safe:fade-in motion-safe:slide-in-from-bottom-1 thinking-shimmer col-start-1 row-start-2 block min-h-5 truncate text-muted-foreground text-xs motion-safe:animate-in motion-safe:duration-300"
            key={thinkingText}
          >
            {thinkingText ?? "Thinking…"}
          </span>
        ) : null}
      </span>
    </div>
  );
}

const formatCost = (cost: number): string =>
  cost > 0 && cost < 0.001 ? "<$0.001" : `$${cost.toFixed(3)}`;

const formatElapsedDuration = (durationMs: number): string => {
  if (durationMs < 60_000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
};

export function MetricsStrip({ metrics }: { metrics: GameMetrics }) {
  return (
    <dl className="grid grid-cols-3 border-b bg-muted/30 text-center text-xs tabular-nums">
      <div className="px-2 py-3">
        <dt className="text-muted-foreground">Tokens</dt>
        <dd className="mt-0.5 font-semibold">
          {metrics.totalTokens.toLocaleString()}
        </dd>
      </div>
      <div className="border-x px-2 py-3">
        <dt className="text-muted-foreground">LLM response time</dt>
        <dd className="mt-0.5 font-semibold">
          {formatElapsedDuration(metrics.totalDurationMs)}
        </dd>
      </div>
      <div className="px-2 py-3">
        <dt className="text-muted-foreground">Cost</dt>
        <dd className="mt-0.5 font-semibold">
          {formatCost(metrics.totalCostUsd)}
        </dd>
      </div>
    </dl>
  );
}

interface TournamentMetricsStripProps {
  blackModel: ChessModel;
  metrics: GameMetrics;
  moves: Array<{
    costUsd: number;
    durationMs: number;
    modelId: string;
    tokens: number;
  }>;
  whiteModel: ChessModel;
}

export function TournamentMetricsStrip({
  blackModel,
  metrics,
  moves,
  whiteModel,
}: TournamentMetricsStripProps) {
  const whiteMetrics = useMemo(
    () =>
      moves
        .filter((move) => move.modelId === whiteModel.id)
        .reduce(
          (acc, move) => ({
            costUsd: acc.costUsd + move.costUsd,
            durationMs: acc.durationMs + move.durationMs,
            tokens: acc.tokens + move.tokens,
          }),
          { costUsd: 0, durationMs: 0, tokens: 0 }
        ),
    [moves, whiteModel.id]
  );

  const blackMetrics = useMemo(
    () =>
      moves
        .filter((move) => move.modelId === blackModel.id)
        .reduce(
          (acc, move) => ({
            costUsd: acc.costUsd + move.costUsd,
            durationMs: acc.durationMs + move.durationMs,
            tokens: acc.tokens + move.tokens,
          }),
          { costUsd: 0, durationMs: 0, tokens: 0 }
        ),
    [moves, blackModel.id]
  );

  return (
    <div className="border-b bg-muted/20">
      <table className="w-full table-fixed text-xs tabular-nums">
        <caption className="sr-only">
          Model usage for this tournament game
        </caption>
        <colgroup>
          <col className="w-[40%]" />
          <col className="w-[21%]" />
          <col className="w-[22%]" />
          <col className="w-[17%]" />
        </colgroup>
        <thead className="border-b text-[10px] text-muted-foreground uppercase tracking-wider">
          <tr>
            <th className="px-3 py-2 text-left font-medium" scope="col">
              Model
            </th>
            <th className="px-2 py-2 text-right font-medium" scope="col">
              Tokens
            </th>
            <th className="px-2 py-2 text-right font-medium" scope="col">
              Model time
            </th>
            <th className="py-2 pr-3 pl-2 text-right font-medium" scope="col">
              Cost
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          <tr>
            <th className="min-w-0 px-3 py-2 text-left" scope="row">
              <span className="flex min-w-0 items-center gap-2">
                <ModelLogo
                  className="size-6 shrink-0 rounded-lg bg-background shadow-xs ring-border/80"
                  imageClassName="p-1"
                  logoUrl={whiteModel.logoUrl}
                  name={whiteModel.name}
                />
                <span className="truncate font-medium text-sm">
                  {whiteModel.name}
                </span>
              </span>
            </th>
            <td className="whitespace-nowrap px-2 py-2 text-right font-medium">
              {whiteMetrics.tokens.toLocaleString()}
            </td>
            <td className="whitespace-nowrap px-2 py-2 text-right font-medium">
              {formatElapsedDuration(whiteMetrics.durationMs)}
            </td>
            <td className="whitespace-nowrap py-2 pr-3 pl-2 text-right font-medium">
              {formatCost(whiteMetrics.costUsd)}
            </td>
          </tr>
          <tr>
            <th className="min-w-0 px-3 py-2 text-left" scope="row">
              <span className="flex min-w-0 items-center gap-2">
                <ModelLogo
                  className="size-6 shrink-0 rounded-lg bg-background shadow-xs ring-border/80"
                  imageClassName="p-1"
                  logoUrl={blackModel.logoUrl}
                  name={blackModel.name}
                />
                <span className="truncate font-medium text-sm">
                  {blackModel.name}
                </span>
              </span>
            </th>
            <td className="whitespace-nowrap px-2 py-2 text-right font-medium">
              {blackMetrics.tokens.toLocaleString()}
            </td>
            <td className="whitespace-nowrap px-2 py-2 text-right font-medium">
              {formatElapsedDuration(blackMetrics.durationMs)}
            </td>
            <td className="whitespace-nowrap py-2 pr-3 pl-2 text-right font-medium">
              {formatCost(blackMetrics.costUsd)}
            </td>
          </tr>
        </tbody>
        <tfoot className="border-t bg-muted/40">
          <tr>
            <th
              className="px-3 py-2 text-left font-semibold text-muted-foreground"
              scope="row"
            >
              Game total
            </th>
            <td className="whitespace-nowrap px-2 py-2 text-right font-semibold">
              {metrics.totalTokens.toLocaleString()}
            </td>
            <td className="whitespace-nowrap px-2 py-2 text-right font-semibold">
              {formatElapsedDuration(metrics.totalDurationMs)}
            </td>
            <td className="whitespace-nowrap py-2 pr-3 pl-2 text-right font-semibold">
              {formatCost(metrics.totalCostUsd)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

interface MoveHistoryProps {
  activePly: number;
  emptyDescription?: string;
  moves: Move[];
  onSelectPly: (ply: number | null) => void;
  timings: MoveTiming[];
}

interface MoveButtonProps {
  isActive: boolean;
  label: string;
  onSelectPly: (ply: number | null) => void;
  ply: number | null;
  timeMs?: number;
}

const formatMoveDuration = (durationMs: number): string => {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  if (durationMs < 60_000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
};

function MoveButton({
  isActive,
  label,
  onSelectPly,
  ply,
  timeMs,
}: MoveButtonProps) {
  const handleClick = useCallback(() => {
    onSelectPly(ply);
  }, [onSelectPly, ply]);
  return (
    <button
      className={cn(
        "flex min-w-0 items-center justify-between gap-2 rounded-md px-2 py-2 text-left font-medium text-sm tabular-nums hover:bg-muted",
        isActive && "bg-primary/15 text-primary"
      )}
      onClick={handleClick}
      type="button"
    >
      <span className="truncate">{label}</span>
      {timeMs === undefined ? null : (
        <span className="shrink-0 font-normal text-[10px] text-muted-foreground">
          {formatMoveDuration(timeMs)}
        </span>
      )}
    </button>
  );
}

export function MoveHistory({
  activePly,
  emptyDescription = "Move a white piece to start the game.",
  moves,
  onSelectPly,
  timings,
}: MoveHistoryProps) {
  const movePairs = useMemo(() => {
    const pairs: Array<{ black: Move | null; number: number; white: Move }> =
      [];
    for (let index = 0; index < moves.length; index += 2) {
      const white = moves[index];
      if (white) {
        pairs.push({
          black: moves[index + 1] ?? null,
          number: index / 2 + 1,
          white,
        });
      }
    }
    return pairs;
  }, [moves]);
  const timingsByPly = useMemo(
    () => new Map(timings.map((timing) => [timing.ply, timing.durationMs])),
    [timings]
  );
  const scrollVersion = String(moves.length);
  const scrollToLatestMove = useCallback(
    (node: HTMLElement | null) => {
      if (!node) {
        return;
      }
      node.dataset.scrollVersion = scrollVersion;
      node.scrollTop = node.scrollHeight;
    },
    [scrollVersion]
  );

  if (movePairs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <ListOrdered className="mb-3 size-5 text-muted-foreground" />
        <p className="font-medium text-sm">No moves yet</p>
        <p className="mt-1 text-pretty text-muted-foreground text-xs">
          {emptyDescription}
        </p>
      </div>
    );
  }

  return (
    <section
      aria-label="Move history"
      className="min-h-0 flex-1 overflow-y-auto p-2"
      ref={scrollToLatestMove}
    >
      {movePairs.map((pair) => {
        const whitePly = (pair.number - 1) * 2 + 1;
        const blackPly = whitePly + 1;
        return (
          <div
            className="grid grid-cols-[2.25rem_1fr_1fr] gap-1"
            key={pair.number}
          >
            <span className="px-2 py-2 text-right text-muted-foreground text-xs tabular-nums">
              {pair.number}.
            </span>
            <MoveButton
              isActive={activePly === whitePly}
              label={pair.white.san}
              onSelectPly={onSelectPly}
              ply={whitePly}
              timeMs={timingsByPly.get(whitePly)}
            />
            {pair.black ? (
              <MoveButton
                isActive={activePly === blackPly}
                label={pair.black.san}
                onSelectPly={onSelectPly}
                ply={blackPly === moves.length ? null : blackPly}
                timeMs={timingsByPly.get(blackPly)}
              />
            ) : (
              <span className="px-2 py-2 text-muted-foreground">…</span>
            )}
          </div>
        );
      })}
    </section>
  );
}

interface HistoryControlsProps {
  activePly: number;
  moveCount: number;
  onSelectPly: (ply: number | null) => void;
}

export function HistoryControls({
  activePly,
  moveCount,
  onSelectPly,
}: HistoryControlsProps) {
  const isLive = activePly === moveCount;
  const goToStart = useCallback(() => {
    onSelectPly(0);
  }, [onSelectPly]);
  const goToPrevious = useCallback(() => {
    onSelectPly(Math.max(0, activePly - 1));
  }, [activePly, onSelectPly]);
  const goToNext = useCallback(() => {
    const nextPly = Math.min(moveCount, activePly + 1);
    onSelectPly(nextPly === moveCount ? null : nextPly);
  }, [activePly, moveCount, onSelectPly]);
  const goToLive = useCallback(() => {
    onSelectPly(null);
  }, [onSelectPly]);
  return (
    <div className="grid grid-cols-4 justify-items-center border-t p-2">
      <Button
        aria-label="Go to starting position"
        disabled={activePly === 0}
        onClick={goToStart}
        size="icon"
        variant="ghost"
      >
        <ChevronFirst />
      </Button>
      <Button
        aria-label="Previous move"
        disabled={activePly === 0}
        onClick={goToPrevious}
        size="icon"
        variant="ghost"
      >
        <ChevronLeft />
      </Button>
      <Button
        aria-label="Next move"
        disabled={isLive}
        onClick={goToNext}
        size="icon"
        variant="ghost"
      >
        <ChevronRight />
      </Button>
      <Button
        aria-label="Return to live position"
        disabled={isLive}
        onClick={goToLive}
        size="icon"
        variant="ghost"
      >
        <ChevronLast />
      </Button>
    </div>
  );
}

export interface GameChatMessage {
  author: ChessModel;
  id: string;
  moveLabel: string | null;
  text: string;
}

interface ModelChatProps {
  emptyDescription?: string;
  emptyTitle?: string;
  isThinking: boolean;
  messages?: GameChatMessage[];
  model?: ChessModel;
  thinkingModel?: ChessModel | null;
  turns?: ModelTurnTrace[];
}

export function ModelChat({
  emptyDescription = "Its short move explanations will appear here.",
  emptyTitle,
  isThinking,
  messages,
  model,
  thinkingModel,
  turns = [],
}: ModelChatProps) {
  const displayMessages =
    messages ??
    turns
      .filter((turn) => turn.status === "accepted" && turn.message)
      .map((turn) => ({
        author: model as ChessModel,
        id: turn.id,
        moveLabel:
          turn.kind === "move"
            ? turn.acceptedMove
            : `Draw ${turn.decision ?? "reply"}`,
        text: turn.message as string,
      }));
  const activeThinkingModel =
    thinkingModel === undefined ? model : thinkingModel;
  const resolvedEmptyTitle =
    emptyTitle ??
    (model ? `${model.name} is quiet—for now` : "Model is quiet—for now");
  const latestMessageId = displayMessages.at(-1)?.id ?? "empty";
  const scrollVersion = `${latestMessageId}-${isThinking}`;
  const scrollToLatestMessage = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) {
        return;
      }
      node.dataset.scrollVersion = scrollVersion;
      node.scrollTop = node.scrollHeight;
    },
    [scrollVersion]
  );

  return (
    <div
      aria-live="polite"
      className="min-h-0 flex-1 overflow-y-auto p-3"
      ref={scrollToLatestMessage}
    >
      {displayMessages.length === 0 && !isThinking ? (
        <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
          <MessageCircle className="mb-3 size-5 text-muted-foreground" />
          <p className="font-medium text-sm">{resolvedEmptyTitle}</p>
          <p className="mt-1 max-w-56 text-pretty text-muted-foreground text-xs">
            {emptyDescription}
          </p>
        </div>
      ) : null}
      <div
        className={cn(
          "space-y-3",
          displayMessages.length === 0 &&
            isThinking &&
            "flex min-h-full items-center justify-center"
        )}
      >
        {displayMessages.map((message) => (
          <div className="flex items-start gap-2.5" key={message.id}>
            <ModelLogo
              className="size-7"
              logoUrl={message.author.logoUrl}
              name={message.author.name}
            />
            <div className="min-w-0 rounded-lg rounded-tl-sm bg-muted px-3 py-2">
              <div className="mb-1 flex items-center gap-2 text-xs">
                <span className="font-semibold">{message.author.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {message.moveLabel}
                </span>
              </div>
              <p className="text-pretty text-sm">{message.text}</p>
            </div>
          </div>
        ))}
        {isThinking && activeThinkingModel ? (
          <div
            className="flex items-center gap-2.5 text-muted-foreground text-xs"
            role="status"
          >
            <ModelLogo
              className="size-7"
              logoUrl={activeThinkingModel.logoUrl}
              name={activeThinkingModel.name}
            />
            <div className="max-w-64 rounded-lg rounded-tl-sm bg-muted px-3 py-2.5">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <span>{activeThinkingModel.name} is thinking</span>
                <span aria-hidden="true" className="flex items-center gap-1">
                  <span className="size-1 animate-pulse rounded-full bg-primary" />
                  <span className="size-1 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
                  <span className="size-1 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
                </span>
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
