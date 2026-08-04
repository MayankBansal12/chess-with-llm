import { Dialog } from "@base-ui/react/dialog";
import { CircleUserRound, RotateCcw, X } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GameSnapshot } from "../types";
import ModelLogo from "./model-logo";

interface GameOverDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  snapshot: GameSnapshot;
}

const getResultCopy = (
  snapshot: GameSnapshot
): { description: string; score: string; title: string } => {
  if (snapshot.terminationReason === "player_resignation") {
    return {
      description: "You resigned the game.",
      score: "0–1",
      title: `${snapshot.model.name} wins`,
    };
  }
  if (snapshot.terminationReason === "model_forfeit") {
    return {
      description: "It failed to provide a legal move in this position.",
      score: "1–0",
      title: `${snapshot.model.name} resigns`,
    };
  }
  if (snapshot.terminationReason === "checkmate") {
    const playerWon = snapshot.winner === "player";
    return {
      description: "Checkmate",
      score: playerWon ? "1–0" : "0–1",
      title: playerWon
        ? `${snapshot.playerName} wins`
        : `${snapshot.model.name} wins`,
    };
  }
  if (snapshot.terminationReason === "stalemate") {
    return { description: "Stalemate", score: "½–½", title: "Draw" };
  }
  return {
    description:
      snapshot.terminationReason === "draw_agreement"
        ? "Draw by agreement"
        : "Draw by rule",
    score: "½–½",
    title: "Draw",
  };
};

const formatCost = (cost: number): string =>
  cost > 0 && cost < 0.0001 ? "<$0.0001" : `$${cost.toFixed(4)}`;

const formatResponseTime = (durationMs: number): string => {
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1000);
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
};

export default function GameOverDialog({
  isOpen,
  onOpenChange,
  snapshot,
}: GameOverDialogProps) {
  const result = getResultCopy(snapshot);
  const playerWon = snapshot.winner === "player";
  const modelWon = snapshot.winner === "model";
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={isOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 min-h-dvh bg-black/60 opacity-100 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Dialog.Popup className="w-full max-w-md rounded-xl border bg-card p-5 text-card-foreground shadow-xl transition-[transform,opacity] duration-150 ease-out data-ending-style:scale-[0.97] data-starting-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:opacity-0 sm:p-6">
            <div className="relative text-center">
              <div>
                <p className="font-bold text-4xl tabular-nums">
                  {result.score}
                </p>
                <Dialog.Title className="mt-2 text-balance font-semibold text-xl">
                  {result.title}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-muted-foreground text-sm">
                  {result.description}
                </Dialog.Description>
              </div>
              <Dialog.Close
                aria-label="Review final board"
                className="absolute top-0 right-0"
                render={<Button size="icon" variant="ghost" />}
              >
                <X className="size-4" />
              </Dialog.Close>
            </div>

            <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
              <div
                className={cn(
                  "flex min-w-0 flex-col items-center rounded-xl bg-muted/45 p-3 text-center ring-1 ring-transparent",
                  playerWon && "bg-primary/10 ring-primary/40"
                )}
              >
                <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <CircleUserRound className="size-6" />
                </span>
                <span className="mt-2 w-full truncate font-semibold text-sm">
                  {snapshot.playerName}
                </span>
                <span className="mt-0.5 text-[10px] text-muted-foreground uppercase tracking-widest">
                  {playerWon ? "Winner · White" : "White"}
                </span>
              </div>
              <span className="self-center font-bold text-muted-foreground text-xs">
                VS
              </span>
              <div
                className={cn(
                  "flex min-w-0 flex-col items-center rounded-xl bg-muted/45 p-3 text-center ring-1 ring-transparent",
                  modelWon && "bg-primary/10 ring-primary/40"
                )}
              >
                <ModelLogo
                  className="size-12 rounded-xl"
                  logoUrl={snapshot.model.logoUrl}
                  name={snapshot.model.name}
                />
                <span className="mt-2 w-full truncate font-semibold text-sm">
                  {snapshot.model.name}
                </span>
                <span className="mt-0.5 text-[10px] text-muted-foreground uppercase tracking-widest">
                  {modelWon ? "Winner · Black" : "Black"}
                </span>
              </div>
            </div>

            <dl className="mt-4 grid auto-rows-fr grid-cols-3 gap-2 text-center text-xs tabular-nums">
              <div className="flex flex-col justify-between rounded-lg bg-muted/50 p-2">
                <dt className="flex min-h-8 items-center justify-center text-muted-foreground">
                  Tokens
                </dt>
                <dd className="mt-1 font-semibold">
                  {snapshot.metrics.totalTokens.toLocaleString()}
                </dd>
              </div>
              <div className="flex flex-col justify-between rounded-lg bg-muted/50 p-2">
                <dt className="flex min-h-8 items-center justify-center text-pretty text-muted-foreground leading-tight">
                  LLM response time
                </dt>
                <dd className="mt-1 font-semibold">
                  {formatResponseTime(snapshot.metrics.totalDurationMs)}
                </dd>
              </div>
              <div className="flex flex-col justify-between rounded-lg bg-muted/50 p-2">
                <dt className="flex min-h-8 items-center justify-center text-muted-foreground">
                  Cost
                </dt>
                <dd className="mt-1 font-semibold">
                  {formatCost(snapshot.metrics.totalCostUsd)}
                </dd>
              </div>
            </dl>

            <Button className="mt-5 w-full" render={<Link to="/" />} size="lg">
              <RotateCcw className="size-4" /> New game
            </Button>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
