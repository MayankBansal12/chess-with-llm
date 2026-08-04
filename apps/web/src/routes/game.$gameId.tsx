// biome-ignore-all lint/style/useFilenamingConvention: React Router uses $param filenames for dynamic routes.
import type { Chess, Move, PieceSymbol, Square } from "chess.js";
import {
  Check,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Clipboard,
  Flag,
  Handshake,
  ListOrdered,
  LogOut,
  MessageCircle,
  Swords,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import PromotionDialog from "@/components/chess/promotion-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import ChessBoard from "@/features/chess/components/chess-board";
import GameOverDialog from "@/features/chess/components/game-over-dialog";
import ModelLogo from "@/features/chess/components/model-logo";
import ModelTranscript from "@/features/chess/components/model-transcript";
import { useChessGame } from "@/features/chess/hooks/use-chess-game";
import type { SoundCue } from "@/features/chess/hooks/use-game-sounds";
import { useGameSounds } from "@/features/chess/hooks/use-game-sounds";
import type {
  GameMetrics,
  GameSnapshot,
  ModelTurnTrace,
  MoveInput,
  MoveTiming,
} from "@/features/chess/types";
import {
  getCapturedMaterial,
  getPositionAtPly,
} from "@/features/chess/utils/chess-helpers";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/game.$gameId";

const PIECE_GLYPHS: Record<"b" | "w", Record<PieceSymbol, string>> = {
  b: { b: "♝", k: "♚", n: "♞", p: "♟", q: "♛", r: "♜" },
  w: { b: "♗", k: "♔", n: "♘", p: "♙", q: "♕", r: "♖" },
};

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Live Game · Chess with LLM" },
    {
      content: "Play a live chess game against an open-weight LLM.",
      name: "description",
    },
  ];
}

interface PlayerBarProps {
  captured: PieceSymbol[];
  color: "b" | "w";
  isActive: boolean;
  isThinking?: boolean;
  materialAdvantage: number;
  modelLogoUrl?: string;
  name: string;
  subtitle: string;
}

function PlayerBar({
  captured,
  color,
  isActive,
  isThinking = false,
  materialAdvantage,
  modelLogoUrl,
  name,
  subtitle,
}: PlayerBarProps) {
  const capturedGroups = (["q", "r", "b", "n", "p"] as const)
    .map((piece) => ({
      count: captured.filter((capturedPiece) => capturedPiece === piece).length,
      piece,
    }))
    .filter(({ count }) => count > 0);
  return (
    <div className="flex min-h-14 items-center gap-3 px-1 py-2">
      <div className="flex min-w-0 items-center gap-3">
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
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold text-sm">{name}</span>
            {isActive ? (
              <span className="size-2 rounded-full bg-primary" />
            ) : null}
          </span>
          <span className="flex min-h-5 items-center gap-1 text-muted-foreground text-xs">
            {isThinking ? (
              <span className="animate-pulse">Thinking…</span>
            ) : (
              subtitle
            )}
            {captured.length > 0 ? (
              <span
                aria-label={`${captured.length} captured pieces`}
                className="ml-1 flex"
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
        </span>
      </div>
    </div>
  );
}

const MATCH_QUOTES = [
  (modelName: string) => `${modelName} is waiting for your opening move.`,
  (modelName: string) => `The board is set. ${modelName} is ready.`,
  (modelName: string) => `${modelName} has entered the arena.`,
  (modelName: string) => `Your first move against ${modelName} awaits.`,
  (modelName: string) => `${modelName} is studying the starting position.`,
  (modelName: string) => `A fresh position. A new test for ${modelName}.`,
  (modelName: string) => `${modelName} is ready when you are.`,
  (modelName: string) => `The clock is off. ${modelName} is on.`,
  (modelName: string) =>
    `Sixty-four squares stand between you and ${modelName}.`,
  (modelName: string) => `${modelName} awaits your challenge.`,
] as const;

const getMatchQuote = (snapshot: GameSnapshot): string => {
  const quoteIndex = [...snapshot.id].reduce(
    (total, character) => total + character.charCodeAt(0),
    0
  );
  const quote = MATCH_QUOTES[quoteIndex % MATCH_QUOTES.length];
  return quote?.(snapshot.model.name) ?? `${snapshot.model.name} is ready.`;
};

function MatchIntro({ snapshot }: { snapshot: GameSnapshot }) {
  return (
    <div
      aria-label={`${snapshot.playerName} versus ${snapshot.model.name}`}
      className="motion-safe:fade-in pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/95 px-5 motion-safe:animate-in motion-safe:duration-200"
      role="status"
    >
      <div className="w-full max-w-3xl text-center">
        <p className="mb-8 flex items-center justify-center gap-2 font-semibold text-primary text-xs uppercase tracking-[0.2em]">
          <Swords className="size-4" /> Match ready
        </p>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-10">
          <div className="min-w-0">
            <span className="mx-auto flex size-20 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md sm:size-28">
              <CircleUserRound className="size-9 sm:size-12" />
            </span>
            <p className="mt-4 truncate font-bold text-lg sm:text-2xl">
              {snapshot.playerName}
            </p>
            <p className="mt-1 text-muted-foreground text-xs uppercase tracking-widest">
              White
            </p>
          </div>
          <span className="flex size-12 items-center justify-center rounded-full bg-foreground font-bold text-background text-sm shadow-md sm:size-16">
            VS
          </span>
          <div className="min-w-0">
            <ModelLogo
              className="mx-auto size-20 rounded-2xl sm:size-28"
              logoUrl={snapshot.model.logoUrl}
              name={snapshot.model.name}
            />
            <p className="mt-4 truncate font-bold text-lg sm:text-2xl">
              {snapshot.model.name}
            </p>
            <p className="mt-1 text-muted-foreground text-xs uppercase tracking-widest">
              Black
            </p>
          </div>
        </div>
        <p className="mt-10 text-pretty text-muted-foreground text-sm">
          {getMatchQuote(snapshot)}
        </p>
      </div>
    </div>
  );
}

const formatCost = (cost: number): string =>
  cost > 0 && cost < 0.0001 ? "<$0.0001" : `$${cost.toFixed(4)}`;

const formatElapsedDuration = (durationMs: number): string => {
  if (durationMs < 60_000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
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

function MetricsStrip({ metrics }: { metrics: GameMetrics }) {
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

interface MoveHistoryProps {
  activePly: number;
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

function MoveHistory({
  activePly,
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
          Move a white piece to start the game.
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

function ModelChat({
  isThinking,
  model,
  turns,
}: {
  isThinking: boolean;
  model: GameSnapshot["model"];
  turns: ModelTurnTrace[];
}) {
  const messages = turns.filter(
    (turn) => turn.status === "accepted" && turn.message
  );
  const latestMessageId = messages.at(-1)?.id ?? "empty";
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
      {messages.length === 0 && !isThinking ? (
        <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
          <MessageCircle className="mb-3 size-5 text-muted-foreground" />
          <p className="font-medium text-sm">{model.name} is quiet—for now</p>
          <p className="mt-1 max-w-56 text-pretty text-muted-foreground text-xs">
            Its short move explanations will appear here.
          </p>
        </div>
      ) : null}
      <div
        className={cn(
          "space-y-3",
          messages.length === 0 &&
            isThinking &&
            "flex min-h-full items-center justify-center"
        )}
      >
        {messages.map((turn) => (
          <div className="flex items-start gap-2.5" key={turn.id}>
            <ModelLogo
              className="size-7"
              logoUrl={model.logoUrl}
              name={model.name}
            />
            <div className="min-w-0 rounded-lg rounded-tl-sm bg-muted px-3 py-2">
              <div className="mb-1 flex items-center gap-2 text-xs">
                <span className="font-semibold">{model.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {turn.kind === "move"
                    ? turn.acceptedMove
                    : `Draw ${turn.decision ?? "reply"}`}
                </span>
              </div>
              <p className="text-pretty text-sm">{turn.message}</p>
            </div>
          </div>
        ))}
        {isThinking ? (
          <div
            className="flex items-center gap-2.5 text-muted-foreground text-xs"
            role="status"
          >
            <ModelLogo
              className="size-7"
              logoUrl={model.logoUrl}
              name={model.name}
            />
            <div className="max-w-64 rounded-lg rounded-tl-sm bg-muted px-3 py-2.5">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <span className="animate-pulse">{model.name} is thinking</span>
                <span aria-hidden="true" className="flex items-center gap-1">
                  <span className="size-1 animate-pulse rounded-full bg-primary" />
                  <span className="size-1 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
                  <span className="size-1 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
                </span>
              </p>
              <p className="mt-1 text-pretty text-muted-foreground">
                Comparing candidate moves on the board.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface HistoryControlsProps {
  activePly: number;
  moveCount: number;
  onSelectPly: (ply: number | null) => void;
}

function HistoryControls({
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

interface GamePanelProps {
  activePly: number;
  canOfferDraw: boolean;
  drawOfferDecision: "accept" | "decline" | null;
  hasOfferedDraw: boolean;
  isMuted: boolean;
  isOfferingDraw: boolean;
  isResigning: boolean;
  isThinking: boolean;
  moves: Move[];
  onOfferDraw: () => void;
  onResign: () => void;
  onSelectPly: (ply: number | null) => void;
  onToggleSound: () => void;
  snapshot: GameSnapshot;
}

const getDrawButtonLabel = (
  isOfferingDraw: boolean,
  hasOfferedDraw: boolean,
  drawOfferDecision: "accept" | "decline" | null
): string => {
  if (isOfferingDraw) {
    return "Offering…";
  }
  if (drawOfferDecision === "accept") {
    return "Draw accepted";
  }
  if (drawOfferDecision === "decline") {
    return "Draw declined";
  }
  if (hasOfferedDraw) {
    return "Draw offered!";
  }
  return "Offer draw";
};

function GamePanel({
  activePly,
  canOfferDraw,
  drawOfferDecision,
  hasOfferedDraw,
  isMuted,
  isOfferingDraw,
  isResigning,
  isThinking,
  moves,
  onOfferDraw,
  onResign,
  onSelectPly,
  onToggleSound,
  snapshot,
}: GamePanelProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "moves">("moves");
  const [copied, setCopied] = useState(false);

  const showMoves = useCallback(() => {
    setActiveTab("moves");
  }, []);
  const showChat = useCallback(() => {
    setActiveTab("chat");
  }, []);
  const copyPgn = useCallback(async (): Promise<void> => {
    if (!snapshot.pgn) {
      return;
    }
    try {
      await navigator.clipboard.writeText(snapshot.pgn);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access is optional.
    }
  }, [snapshot.pgn]);

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
        <div className="flex">
          <Button
            aria-label={copied ? "PGN copied" : "Copy PGN"}
            disabled={!snapshot.pgn}
            onClick={copyPgn}
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
        </div>
      </div>

      <MetricsStrip metrics={snapshot.metrics} />

      <div className="flex min-h-0 flex-1 flex-col">
        {activeTab === "moves" ? (
          <MoveHistory
            activePly={activePly}
            moves={moves}
            onSelectPly={onSelectPly}
            timings={snapshot.moveTimings}
          />
        ) : (
          <ModelChat
            isThinking={isThinking || isOfferingDraw}
            model={snapshot.model}
            turns={snapshot.modelTurns}
          />
        )}
      </div>

      {activeTab === "moves" ? (
        <HistoryControls
          activePly={activePly}
          moveCount={moves.length}
          onSelectPly={onSelectPly}
        />
      ) : null}

      {snapshot.outcome === "active" ? (
        <div className="grid grid-cols-2 gap-2 border-t p-3">
          <Button
            disabled={!canOfferDraw || hasOfferedDraw}
            onClick={onOfferDraw}
            variant="outline"
          >
            <Handshake />
            {getDrawButtonLabel(
              isOfferingDraw,
              hasOfferedDraw,
              drawOfferDecision
            )}
          </Button>
          <ConfirmDialog
            confirmLabel="Resign game"
            description="This ends the game immediately and awards the win to the model."
            isPending={isResigning}
            onConfirm={onResign}
            title="Resign this game?"
          >
            <Button variant="outline">
              <Flag /> Resign
            </Button>
          </ConfirmDialog>
          <ConfirmDialog
            confirmLabel="Leave and resign"
            description="Leaving counts as a resignation and awards the game to the model."
            isPending={isResigning}
            onConfirm={onResign}
            title="Leave this game?"
          >
            <Button className="col-span-2" variant="ghost">
              <LogOut /> Leave game
            </Button>
          </ConfirmDialog>
        </div>
      ) : (
        <div className="border-t p-3">
          <Button className="w-full" render={<Link to="/" />}>
            Start a new game
          </Button>
        </div>
      )}
    </Card>
  );
}

interface PremoveQueueOverlayProps {
  onClear: () => void;
  premoves: MoveInput[];
}

function PremoveQueueOverlay({ onClear, premoves }: PremoveQueueOverlayProps) {
  if (premoves.length === 0) {
    return null;
  }
  const moveList = premoves
    .map(
      (queuedMove, index) => `${index + 1}. ${queuedMove.from}–${queuedMove.to}`
    )
    .join(" · ");

  return (
    <div className="absolute right-3 bottom-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg bg-background/95 px-3 py-2 text-xs shadow-lg ring-1 ring-border">
      <span className="truncate font-medium tabular-nums">
        {premoves.length === 1 ? "Premove" : "Premoves"} {moveList}
      </span>
      <button
        className="shrink-0 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        onClick={onClear}
        type="button"
      >
        Clear
      </button>
    </div>
  );
}

const getLastMove = (moves?: Move[]) => {
  const move = moves?.at(-1);
  return move
    ? {
        from: move.from as Square,
        san: move.san,
        to: move.to as Square,
      }
    : null;
};

const shouldShowMatchIntro = (locationState: unknown): boolean =>
  (locationState as { showMatchIntro?: boolean } | null)?.showMatchIntro ===
  true;

interface DrawOfferState {
  decision: "accept" | "decline" | null;
  hasOffered: boolean;
}

const getCurrentDrawOfferState = (
  modelTurns: ModelTurnTrace[],
  pgn: string
): DrawOfferState => {
  const drawOffer = modelTurns.findLast(
    (turn) => turn.kind === "draw_offer" && turn.pgn === pgn
  );
  return {
    decision: drawOffer?.decision ?? null,
    hasOffered: drawOffer !== undefined,
  };
};

export default function Game() {
  const { gameId = "" } = useParams();
  const location = useLocation();
  const {
    error,
    handleMove,
    handleOfferDraw,
    handlePieceSelect,
    handlePremoveCancel,
    handlePromotionCancel,
    handlePromotionSelect,
    handleResign,
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
  } = useChessGame(gameId);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const [isMatchIntroOpen, setIsMatchIntroOpen] = useState(() =>
    shouldShowMatchIntro(location.state)
  );
  const previousPgn = useRef<string | null>(null);
  const previousOutcome = useRef<string | null>(null);
  const previousPremove = useRef<string | null>(null);
  const { isMuted, play, toggleMuted } = useGameSounds();

  useEffect(() => {
    if (!isMatchIntroOpen) {
      return;
    }
    const timeout = window.setTimeout(() => setIsMatchIntroOpen(false), 1700);
    return () => window.clearTimeout(timeout);
  }, [isMatchIntroOpen]);

  const activePly = viewPly ?? moveHistory.length;
  const viewedGame = useMemo(
    () =>
      viewPly === null || !snapshot
        ? position
        : getPositionAtPly(snapshot.pgn, viewPly),
    [position, snapshot, viewPly]
  );
  const viewedMoves = useMemo(
    () => moveHistory.slice(0, activePly),
    [activePly, moveHistory]
  );
  const captured = useMemo(
    () => getCapturedMaterial(viewedMoves),
    [viewedMoves]
  );
  const lastMove = getLastMove(viewedMoves);
  const returnToLive = useCallback(() => {
    setViewPly(null);
  }, []);
  const selectPly = useCallback(
    (ply: number | null) => {
      setViewPly(ply === null || ply >= moveHistory.length ? null : ply);
    },
    [moveHistory.length]
  );
  const offerDrawAction = useCallback(() => {
    handleOfferDraw().catch(() => undefined);
  }, [handleOfferDraw]);
  const resignAction = useCallback(() => {
    handleResign().catch(() => undefined);
  }, [handleResign]);

  useEffect(() => {
    const premoveKey = premoves
      .map((premove) => `${premove.from}-${premove.to}`)
      .join("|");
    if (premoveKey && premoveKey !== previousPremove.current) {
      play("premove");
    }
    previousPremove.current = premoveKey || null;
  }, [play, premoves]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    const isFirstSnapshot = previousPgn.current === null;
    const didGameEnd =
      previousOutcome.current === "active" && snapshot.outcome !== "active";
    if (!isFirstSnapshot && didGameEnd) {
      play("gameOver");
      setIsResultOpen(true);
    } else if (!isFirstSnapshot && previousPgn.current !== snapshot.pgn) {
      const sound = getPositionSound(position);
      if (sound) {
        play(sound);
      }
    } else if (isFirstSnapshot && snapshot.outcome !== "active") {
      setIsResultOpen(true);
    }
    previousPgn.current = snapshot.pgn;
    previousOutcome.current = snapshot.outcome;
  }, [play, position, snapshot]);

  if (isLoading) {
    return (
      <main className="min-h-0">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div>
            <Skeleton className="mb-2 h-14 w-full rounded-lg" />
            <Skeleton className="aspect-square w-full rounded-lg" />
            <Skeleton className="mt-2 h-14 w-full rounded-lg" />
          </div>
          <Skeleton className="h-[620px] w-full rounded-xl" />
        </div>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="flex min-h-0 items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-balance text-lg">
              Game unavailable
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-pretty text-muted-foreground text-sm">
              {error ?? "This game could not be found."}
            </p>
            <Button className="w-full" render={<Link to="/" />}>
              Start a new game
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const isLive = viewPly === null;
  const gameIsActive = snapshot.outcome === "active";
  const modelIsThinking = isThinking || snapshot.isModelThinking;
  const { decision: drawOfferDecision, hasOffered: hasOfferedDraw } =
    getCurrentDrawOfferState(snapshot.modelTurns, snapshot.pgn);
  const canOfferDraw =
    gameIsActive &&
    snapshot.turn === "w" &&
    !modelIsThinking &&
    !isOfferingDraw &&
    isLive;
  const displayedGame =
    isLive && modelIsThinking ? premovePosition : viewedGame;

  return (
    <main className="min-h-0">
      {isMatchIntroOpen ? <MatchIntro snapshot={snapshot} /> : null}
      <div className="mx-auto grid max-w-[1220px] items-start gap-5 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,min(720px,calc(100dvh-13.5rem),calc(100vw-26rem)))_minmax(340px,400px)] lg:justify-center lg:gap-6">
        <section aria-label="Chess board" className="min-w-0">
          <PlayerBar
            captured={captured.white}
            color="b"
            isActive={gameIsActive && viewedGame.turn() === "b"}
            isThinking={modelIsThinking}
            materialAdvantage={Math.max(0, -captured.materialAdvantage)}
            modelLogoUrl={snapshot.model.logoUrl}
            name={snapshot.model.name}
            subtitle="Black"
          />

          <div className="relative">
            <ChessBoard
              disabled={!isLive || isOfferingDraw || !gameIsActive}
              game={displayedGame}
              isInCheck={displayedGame.isCheck()}
              lastMove={lastMove}
              onDrop={handleMove}
              onPieceSelect={handlePieceSelect}
              onPremoveCancel={handlePremoveCancel}
              position={displayedGame.fen()}
              premoves={premoves}
              selectedSquare={isLive ? selectedSquare : null}
              validMoves={isLive ? validMoves : []}
            />
            {isLive ? null : (
              <Button
                className="absolute right-3 bottom-3 z-10 shadow-lg"
                onClick={returnToLive}
                size="sm"
              >
                Return to live
              </Button>
            )}
            {isLive ? (
              <PremoveQueueOverlay
                onClear={handlePremoveCancel}
                premoves={premoves}
              />
            ) : null}
          </div>

          <PlayerBar
            captured={captured.black}
            color="w"
            isActive={gameIsActive && viewedGame.turn() === "w"}
            materialAdvantage={Math.max(0, captured.materialAdvantage)}
            name={snapshot.playerName}
            subtitle="White"
          />

          {error ? (
            <p
              className="mt-2 text-pretty rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </section>

        <GamePanel
          activePly={activePly}
          canOfferDraw={canOfferDraw}
          drawOfferDecision={drawOfferDecision}
          hasOfferedDraw={hasOfferedDraw}
          isMuted={isMuted}
          isOfferingDraw={isOfferingDraw}
          isResigning={isResigning}
          isThinking={modelIsThinking}
          moves={moveHistory}
          onOfferDraw={offerDrawAction}
          onResign={resignAction}
          onSelectPly={selectPly}
          onToggleSound={toggleMuted}
          snapshot={snapshot}
        />
      </div>

      {import.meta.env.DEV && snapshot.modelTurns.length > 0 ? (
        <details className="mx-auto mb-8 max-w-[1220px] px-4 sm:px-6">
          <summary className="cursor-pointer text-muted-foreground text-xs hover:text-foreground">
            Developer details · prompts, retries, and provider diagnostics
          </summary>
          <ModelTranscript
            isThinking={modelIsThinking}
            turns={snapshot.modelTurns}
          />
        </details>
      ) : null}

      {promotionDialog ? (
        <PromotionDialog
          color="w"
          isOpen
          onCancel={handlePromotionCancel}
          onSelect={handlePromotionSelect}
        />
      ) : null}

      <GameOverDialog
        isOpen={isResultOpen}
        onOpenChange={setIsResultOpen}
        snapshot={snapshot}
      />
    </main>
  );
}
