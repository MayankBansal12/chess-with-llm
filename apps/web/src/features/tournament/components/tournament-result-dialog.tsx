import { Dialog } from "@base-ui/react/dialog";
import { Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModelLogo from "@/features/chess/components/model-logo";
import type { TournamentGameSnapshot } from "@/features/tournament/types";
import { cn } from "@/lib/utils";

interface TournamentResultDialogProps {
  game: TournamentGameSnapshot;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onStartReplay: () => void;
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

const formatNr = (nr: number): string => {
  if (nr === 0) {
    return "0.0";
  }
  return `${nr > 0 ? "+" : ""}${nr.toFixed(1)}`;
};

const getNrClassName = (nr: number): string | undefined => {
  if (nr > 0) {
    return "text-emerald-600 dark:text-emerald-400";
  }
  if (nr < 0) {
    return "text-red-600 dark:text-red-400";
  }
};

const getResultCopy = (game: TournamentGameSnapshot) => {
  if (game.result === "draw") {
    let description = "Draw by rule";
    if (game.error) {
      description = "Match ended after a server interruption";
    } else if (game.terminationReason === "draw_by_agreement") {
      description = "Draw by agreement";
    }
    return { description, score: "½–½", title: "Draw" };
  }
  const winner =
    game.winnerModelId === game.whiteModel.id
      ? game.whiteModel
      : game.blackModel;
  return {
    description:
      game.terminationReason === "model_resignation"
        ? "Opponent resigned after two invalid move responses"
        : "Checkmate",
    score: game.result === "white" ? "1–0" : "0–1",
    title: `${winner.name} wins`,
  };
};

const getColorLabel = (
  game: TournamentGameSnapshot,
  modelId: string,
  color: string
): string =>
  game.winnerModelId === modelId ? `Winner · ${color}` : String(color);

export default function TournamentResultDialog({
  game,
  isOpen,
  onOpenChange,
  onStartReplay,
}: TournamentResultDialogProps) {
  const result = getResultCopy(game);
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={isOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 min-h-dvh bg-black/60 opacity-100 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Dialog.Popup className="w-full max-w-md rounded-xl border bg-card p-5 text-card-foreground shadow-xl transition-[transform,opacity] duration-150 ease-out data-ending-style:scale-[0.97] data-starting-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:opacity-0 sm:p-6">
            <div className="relative text-center">
              <p className="font-bold text-4xl tabular-nums">{result.score}</p>
              <Dialog.Title className="mt-2 text-balance font-semibold text-xl">
                {result.title}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-pretty text-muted-foreground text-sm">
                {result.description}
              </Dialog.Description>
              <Dialog.Close
                aria-label="Review final board"
                className="absolute top-0 right-0"
                render={<Button size="icon" variant="ghost" />}
              >
                <X className="size-4" />
              </Dialog.Close>
            </div>

            <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              {[
                { color: "White", model: game.whiteModel, nr: game.whiteNr },
                { color: "Black", model: game.blackModel, nr: game.blackNr },
              ].map(({ color, model, nr }, index) => (
                <div className="contents" key={model.id}>
                  {index === 1 ? (
                    <span className="font-bold text-muted-foreground text-xs">
                      VS
                    </span>
                  ) : null}
                  <div
                    className={cn(
                      "flex min-w-0 flex-col items-center rounded-xl bg-muted/45 p-3 text-center ring-1 ring-transparent",
                      game.winnerModelId === model.id &&
                        "bg-primary/10 ring-primary/40"
                    )}
                  >
                    <ModelLogo
                      className="size-12 rounded-xl"
                      logoUrl={model.logoUrl}
                      name={model.name}
                    />
                    <span className="mt-2 w-full truncate font-semibold text-sm">
                      {model.name}
                    </span>
                    <span className="mt-0.5 text-[10px] text-muted-foreground uppercase tracking-widest">
                      {getColorLabel(game, model.id, color)}
                    </span>
                    <span
                      className={cn(
                        "mt-2 font-semibold text-xs tabular-nums",
                        getNrClassName(nr)
                      )}
                    >
                      {formatNr(nr)} NR
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs tabular-nums">
              <div className="rounded-lg bg-muted/50 p-2">
                <dt className="text-muted-foreground">Total time</dt>
                <dd className="mt-1 font-semibold">
                  {formatDuration(game.durationMs)}
                </dd>
              </div>
              <div className="rounded-lg bg-muted/50 p-2">
                <dt className="text-muted-foreground">Moves</dt>
                <dd className="mt-1 font-semibold">{game.moveCount}</dd>
              </div>
              <div className="rounded-lg bg-muted/50 p-2">
                <dt className="text-muted-foreground">Cost</dt>
                <dd className="mt-1 font-semibold">
                  {formatCost(game.metrics.totalCostUsd)}
                </dd>
              </div>
            </dl>

            {game.moves.length > 0 ? (
              <Button className="mt-5 w-full" onClick={onStartReplay} size="lg">
                <Play className="size-4" /> Start replay
              </Button>
            ) : null}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
