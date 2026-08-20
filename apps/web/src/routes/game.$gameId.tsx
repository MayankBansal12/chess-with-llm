// biome-ignore-all lint/style/useFilenamingConvention: React Router uses $param filenames for dynamic routes.
import type { Chess, Move, PieceSymbol, Square } from "chess.js";
import {
  Check,
  CircleUserRound,
  Clipboard,
  Clock3,
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
import { Link, useLocation, useNavigate, useParams } from "react-router";
import PromotionDialog from "@/components/chess/promotion-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ChessBoard from "@/features/chess/components/chess-board";
import {
  HistoryControls,
  MetricsStrip,
  ModelChat,
  MoveHistory,
  PlayerBar,
} from "@/features/chess/components/game-display";
import GameOverDialog from "@/features/chess/components/game-over-dialog";
import ModelLogo from "@/features/chess/components/model-logo";
import ModelTranscript from "@/features/chess/components/model-transcript";
import { useChessGame } from "@/features/chess/hooks/use-chess-game";
import type {
  MoveSoundSide,
  SoundCue,
} from "@/features/chess/hooks/use-game-sounds";
import { useGameSounds } from "@/features/chess/hooks/use-game-sounds";
import type {
  GameSnapshot,
  ModelTurnTrace,
  MoveInput,
} from "@/features/chess/types";
import {
  getCapturedMaterial,
  getPositionAtPly,
} from "@/features/chess/utils/chess-helpers";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/game.$gameId";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Live Game · Chess with LLM" },
    {
      content: "Play a live chess game against an open-weight LLM.",
      name: "description",
    },
  ];
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

const shouldShowDiagnostics = (search: string): boolean =>
  import.meta.env.DEV || new URLSearchParams(search).get("debug") === "true";

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

const getMoveSoundSide = (position: Chess): MoveSoundSide =>
  position.turn() === "b" ? "player" : "opponent";

const getResultSound = (snapshot: GameSnapshot): SoundCue => {
  if (snapshot.winner === "player") {
    return "win";
  }
  if (snapshot.winner === "model") {
    return "loss";
  }
  return "draw";
};

const MODEL_THINKING_LINES = [
  "Comparing solid candidate moves.",
  "Checking safe piece development.",
  "Weighing exchanges and replies.",
  "Scanning checks, captures, threats.",
  "Replaying the current position.",
  "Comparing legal continuations.",
  "Checking king safety first.",
  "Evaluating the next turning point.",
  "Reviewing recent move history.",
  "Choosing a fitting legal move.",
] as const;

const formatExpiryCountdown = (remainingMs: number): string => {
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const formatExpiryTooltip = (remainingMs: number): string => {
  if (remainingMs <= 0) {
    return "This game has expired. Games are available for one hour after creation.";
  }
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `This game expires in ${minutes} ${minutes === 1 ? "minute" : "minutes"} and ${seconds} ${seconds === 1 ? "second" : "seconds"}. Games are available for one hour after creation.`;
};

function GameExpiryTimer({ remainingMs }: { remainingMs: number }) {
  const hasExpired = remainingMs <= 0;
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={formatExpiryTooltip(remainingMs)}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-md px-2 font-medium text-muted-foreground text-xs tabular-nums outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
          hasExpired && "text-destructive hover:text-destructive"
        )}
        delay={250}
      >
        <Clock3 className="size-3.5" />
        {hasExpired ? "Expired" : formatExpiryCountdown(remainingMs)}
      </TooltipTrigger>
      <TooltipContent>{formatExpiryTooltip(remainingMs)}</TooltipContent>
    </Tooltip>
  );
}

const isGamePlayable = (
  outcome: GameSnapshot["outcome"],
  remainingMs: number
): boolean => outcome === "active" && remainingMs > 0;

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
  onLeave: () => void;
  onOfferDraw: () => void;
  onResign: () => void;
  onSelectPly: (ply: number | null) => void;
  onToggleSound: () => void;
  remainingMs: number;
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
  onLeave,
  onOfferDraw,
  onResign,
  onSelectPly,
  onToggleSound,
  remainingMs,
  snapshot,
}: GamePanelProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "moves">("chat");
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
        <div className="flex items-center">
          <GameExpiryTimer remainingMs={remainingMs} />
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

      {isGamePlayable(snapshot.outcome, remainingMs) ? (
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
            onConfirm={onLeave}
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
  let drawOffer: ModelTurnTrace | undefined;
  for (const turn of modelTurns) {
    if (
      turn.kind === "draw_offer" &&
      turn.pgn === pgn &&
      turn.status === "accepted"
    ) {
      drawOffer = turn;
    }
  }
  return {
    decision: drawOffer?.decision ?? null,
    hasOffered: drawOffer !== undefined,
  };
};

export default function Game() {
  const { gameId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const showDiagnostics = shouldShowDiagnostics(location.search);
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
    thinkingMessageIndex,
    moveHistory,
    position,
    premovePosition,
    premoves,
    promotionDialog,
    selectedSquare,
    snapshot,
    validMoves,
  } = useChessGame(gameId, showDiagnostics);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now);
  const [isMatchIntroOpen, setIsMatchIntroOpen] = useState(() =>
    shouldShowMatchIntro(location.state)
  );
  const previousPgn = useRef<string | null>(null);
  const previousOutcome = useRef<string | null>(null);
  const previousPremove = useRef<string | null>(null);
  const { isMuted, play, toggleMuted } = useGameSounds();

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

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
  const leaveAction = useCallback(async (): Promise<void> => {
    if (await handleResign()) {
      await navigate("/");
    }
  }, [handleResign, navigate]);

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
      play(getResultSound(snapshot));
      setIsResultOpen(true);
    } else if (!isFirstSnapshot && previousPgn.current !== snapshot.pgn) {
      const sound = getPositionSound(position);
      if (sound) {
        play(sound, getMoveSoundSide(position));
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
  const remainingMs = snapshot.expiresAt - currentTime;
  const gameIsActive = isGamePlayable(snapshot.outcome, remainingMs);
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
            thinkingText={
              MODEL_THINKING_LINES[
                thinkingMessageIndex % MODEL_THINKING_LINES.length
              ]
            }
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
          onLeave={leaveAction}
          onOfferDraw={offerDrawAction}
          onResign={resignAction}
          onSelectPly={selectPly}
          onToggleSound={toggleMuted}
          remainingMs={remainingMs}
          snapshot={snapshot}
        />
      </div>

      {showDiagnostics && snapshot.modelTurns.length > 0 ? (
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
