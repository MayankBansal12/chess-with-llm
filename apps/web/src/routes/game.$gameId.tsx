// biome-ignore-all lint/style/useFilenamingConvention: React Router uses $param filenames for dynamic routes.
import {
  Bot,
  Check,
  CircleUserRound,
  Clipboard,
  CornerDownRight,
  Crown,
  RotateCcw,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import PromotionDialog from "@/components/chess/promotion-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import ChessBoard from "@/features/chess/components/chess-board";
import ModelTranscript from "@/features/chess/components/model-transcript";
import { useChessGame } from "@/features/chess/hooks/use-chess-game";
import type { GameOutcome } from "@/features/chess/types";
import type { Route } from "./+types/game.$gameId";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Live Match · Chess with LLM" },
    {
      content: "Play a live chess match against an OpenCode Go model.",
      name: "description",
    },
  ];
}

const getOutcomeCopy = (
  outcome: GameOutcome,
  winner: "model" | "player" | null,
  playerName: string,
  modelName: string
): { description: string; title: string } => {
  if (outcome === "model_forfeit") {
    return {
      description: `${modelName} failed to return a legal move after three attempts.`,
      title: `${playerName} wins by forfeit`,
    };
  }
  if (outcome === "checkmate") {
    return winner === "player"
      ? {
          description: "A clean finish. The model has no legal escape.",
          title: `${playerName} wins`,
        }
      : {
          description: "The king is caught. A well-played game.",
          title: `${modelName} wins`,
        };
  }
  if (outcome === "stalemate") {
    return {
      description: "No legal moves remain, but the king is not in check.",
      title: "Stalemate",
    };
  }
  return {
    description: "The position meets the conditions for a drawn game.",
    title: "Draw",
  };
};

const getActiveStatusCopy = (
  isThinking: boolean,
  isInCheck: boolean
): { description: string; title: string } => {
  if (isThinking) {
    return {
      description: "The board is locked until the model replies.",
      title: "Black is considering",
    };
  }
  if (isInCheck) {
    return {
      description: "Your king must escape the attack on this move.",
      title: "Your king is in check",
    };
  }
  return {
    description: "Select a piece to see its legal destinations.",
    title: "Your move",
  };
};

export default function Game() {
  const { gameId = "" } = useParams();
  const {
    error,
    handleMove,
    handlePieceSelect,
    handlePromotionCancel,
    handlePromotionSelect,
    isInCheck,
    isLoading,
    isThinking,
    moveHistory,
    position,
    promotionDialog,
    selectedSquare,
    snapshot,
    validMoves,
  } = useChessGame(gameId);
  const [copied, setCopied] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  const movePairs = useMemo(() => {
    const pairs: Array<{
      blackMove: string | null;
      moveNumber: number;
      whiteMove: string | null;
    }> = [];
    for (let index = 0; index < moveHistory.length; index += 2) {
      pairs.push({
        blackMove: moveHistory[index + 1]?.san ?? null,
        moveNumber: Math.floor(index / 2) + 1,
        whiteMove: moveHistory[index]?.san ?? null,
      });
    }
    return pairs;
  }, [moveHistory]);

  const copyPgn = async (): Promise<void> => {
    if (!snapshot?.pgn) {
      return;
    }
    try {
      await navigator.clipboard.writeText(snapshot.pgn);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard permissions can be denied without affecting the match.
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-0 overflow-y-auto">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="aspect-square w-full max-w-2xl" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="flex min-h-0 items-center justify-center p-4">
        <Card className="w-full max-w-md border-t-4 border-t-destructive">
          <CardHeader>
            <CardTitle className="text-balance font-display text-2xl">
              Match unavailable
            </CardTitle>
            <CardDescription className="text-pretty">
              {error ?? "This game could not be found."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button render={<Link to="/" />}>Set up a new match</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const isGameOver = snapshot.outcome !== "active";
  const outcomeCopy = isGameOver
    ? getOutcomeCopy(
        snapshot.outcome,
        snapshot.winner,
        snapshot.playerName,
        snapshot.model.name
      )
    : null;
  const statusCopy = outcomeCopy ?? getActiveStatusCopy(isThinking, isInCheck);

  return (
    <main className="min-h-0 overflow-y-auto">
      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-3 lg:gap-6 lg:py-6">
        <section aria-label="Chess board" className="min-w-0 lg:col-span-2">
          <div className="mx-auto w-full max-w-2xl">
            <div className="mb-3 flex items-center justify-between border bg-card p-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center bg-secondary text-secondary-foreground">
                  <Bot className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-sm">
                    {snapshot.model.name}
                  </span>
                  <span className="block text-muted-foreground text-xs">
                    OpenCode Go · Black
                  </span>
                </span>
              </div>
              <span aria-hidden="true" className="text-2xl">
                ♚
              </span>
            </div>

            <div className="relative">
              <ChessBoard
                disabled={isThinking || isGameOver || snapshot.turn !== "w"}
                game={position}
                isInCheck={isInCheck}
                lastMove={snapshot.lastMove}
                onDrop={handleMove}
                onPieceSelect={handlePieceSelect}
                position={snapshot.fen}
                selectedSquare={selectedSquare}
                validMoves={validMoves}
              />
              {isThinking ? (
                <div
                  aria-live="polite"
                  className="absolute inset-x-4 bottom-4 z-10 flex items-center gap-3 border bg-background p-3 shadow-lg"
                >
                  <span className="relative flex size-8 items-center justify-center bg-primary text-primary-foreground">
                    <Bot className="size-4" />
                  </span>
                  <span>
                    <span className="block font-medium text-sm">
                      {snapshot.model.name} is thinking
                    </span>
                    <span className="block text-muted-foreground text-xs">
                      Reading the PGN and current ASCII board…
                    </span>
                  </span>
                </div>
              ) : null}
            </div>

            <div className="mt-3 flex items-center justify-between border bg-card p-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center bg-primary text-primary-foreground">
                  <CircleUserRound className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-sm">
                    {snapshot.playerName}
                  </span>
                  <span className="block text-muted-foreground text-xs">
                    You · White
                  </span>
                </span>
              </div>
              <span aria-hidden="true" className="text-2xl">
                ♔
              </span>
            </div>

            <ModelTranscript
              isThinking={isThinking}
              turns={snapshot.modelTurns}
            />
          </div>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
          <Card
            className={isGameOver ? "border-t-4 border-t-primary" : undefined}
          >
            <CardHeader>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-muted-foreground text-xs uppercase">
                  Match status
                </span>
                <span className="size-2 bg-primary" />
              </div>
              <CardTitle className="text-balance font-display text-2xl">
                {statusCopy.title}
              </CardTitle>
              <CardDescription className="text-pretty">
                {statusCopy.description}
              </CardDescription>
            </CardHeader>
            {error ? (
              <CardContent>
                <div
                  className="text-pretty border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm"
                  role="alert"
                >
                  {error}
                </div>
              </CardContent>
            ) : null}
            {isGameOver ? (
              <CardContent>
                <Button className="w-full" render={<Link to="/" />}>
                  <RotateCcw className="size-4" /> New match
                </Button>
              </CardContent>
            ) : null}
          </Card>

          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Scoresheet</CardTitle>
                  <CardDescription className="mt-1 tabular-nums">
                    {moveHistory.length} half-moves played
                  </CardDescription>
                </div>
                <Button
                  aria-label="Copy PGN"
                  disabled={!snapshot.pgn}
                  onClick={copyPgn}
                  size="icon"
                  variant="ghost"
                >
                  {copied ? (
                    <Check className="size-4" />
                  ) : (
                    <Clipboard className="size-4" />
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-1">
              <div className="max-h-80 overflow-y-auto" ref={historyRef}>
                {movePairs.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-center">
                    <CornerDownRight className="mb-3 size-5 text-muted-foreground" />
                    <p className="font-medium text-sm">
                      The scoresheet is empty
                    </p>
                    <p className="mt-1 text-pretty text-muted-foreground text-xs">
                      Move a white piece to begin.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {movePairs.map((pair) => (
                      <div
                        className="grid grid-cols-[2rem_1fr_1fr] py-2.5 font-mono text-sm tabular-nums"
                        key={pair.moveNumber}
                      >
                        <span className="text-muted-foreground">
                          {pair.moveNumber}.
                        </span>
                        <span>{pair.whiteMove}</span>
                        <span>{pair.blackMove ?? "…"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-3 text-pretty border-l-2 border-l-primary px-3 py-1 text-muted-foreground text-xs">
            <Crown className="size-4 shrink-0 text-foreground" />
            Every model turn starts a fresh Pi agent session with the current
            PGN and an ASCII board.
          </div>
        </aside>
      </div>

      {promotionDialog ? (
        <PromotionDialog
          color="w"
          isOpen
          onCancel={handlePromotionCancel}
          onSelect={handlePromotionSelect}
        />
      ) : null}
    </main>
  );
}
