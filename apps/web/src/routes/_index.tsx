import {
  ArrowRight,
  BadgeCheck,
  CircleUserRound,
  Cpu,
  MessageCircle,
  Swords,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import BrandMark from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import ModelLogo from "@/features/chess/components/model-logo";
import { playGameSound } from "@/features/chess/hooks/use-game-sounds";
import type { ChessModel } from "@/features/chess/types";
import { createGame, getModels } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/_index";

const DEFAULT_MODEL_ID = "minimax-m3";

interface ModelOptionProps {
  isSelected: boolean;
  model: ChessModel;
  onSelect: (modelId: string) => void;
}

function ModelOption({ isSelected, model, onSelect }: ModelOptionProps) {
  const handleSelect = useCallback(() => {
    onSelect(model.id);
  }, [model.id, onSelect]);

  return (
    <label
      className={cn(
        "relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors duration-150 hover:bg-muted/60 has-focus-visible:ring-2 has-focus-visible:ring-ring",
        isSelected && "bg-primary/10 ring-1 ring-primary/35"
      )}
    >
      <input
        checked={isSelected}
        className="sr-only"
        name="model"
        onChange={handleSelect}
        type="radio"
        value={model.id}
      />
      <ModelLogo className="size-8" logoUrl={model.logoUrl} name={model.name} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-semibold text-sm">
          <span className="truncate">{model.name}</span>
          {model.id === DEFAULT_MODEL_ID ? (
            <span className="rounded bg-primary/15 px-1.5 py-0.5 font-semibold text-[9px] text-primary uppercase tracking-wide">
              Popular
            </span>
          ) : null}
        </span>
        <span className="line-clamp-1 text-muted-foreground text-xs">
          {model.description}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full border border-muted-foreground/40",
          isSelected && "border-primary bg-primary"
        )}
      />
    </label>
  );
}

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Challenge Open-Weight AI · Chess with LLM" },
    {
      content:
        "Choose an open-weight AI model, take the White pieces, and challenge it to a live game of chess.",
      name: "description",
    },
  ];
}

export default function Home() {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState("");
  const [models, setModels] = useState<ChessModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState(DEFAULT_MODEL_ID);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadModels = async (): Promise<void> => {
      try {
        const availableModels = await getModels();
        setModels(availableModels);
        if (!availableModels.some(({ id }) => id === DEFAULT_MODEL_ID)) {
          setSelectedModelId(availableModels.at(0)?.id ?? "");
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Challengers are unavailable"
        );
      } finally {
        setIsLoadingModels(false);
      }
    };
    loadModels().catch(() => undefined);
  }, []);

  const selectedModel = useMemo(
    () => models.find(({ id }) => id === selectedModelId) ?? null,
    [models, selectedModelId]
  );
  const handleNameChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setPlayerName(event.target.value);
    },
    []
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = playerName.trim();
    if (!(trimmedName && selectedModelId)) {
      setError("Enter your name before starting the game");
      return;
    }
    setError(null);
    setIsStarting(true);
    playGameSound("gameStart");
    try {
      const game = await createGame(trimmedName, selectedModelId);
      await navigate(`/game/${game.id}`, {
        state: { showMatchIntro: true },
      });
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Unable to start the match"
      );
      setIsStarting(false);
    }
  };

  return (
    <main className="min-h-0">
      <div className="mx-auto w-full max-w-6xl px-4 pt-10 pb-14 sm:px-6 sm:pt-16">
        <section className="mx-auto max-w-3xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 font-semibold text-primary text-xs">
            <BrandMark className="size-4" /> Open Weight Arena
          </div>
          <h1 className="text-balance font-bold text-4xl tracking-tight sm:text-6xl">
            Can you outplay an LLM model in chess?
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
            Choose your favorite model and put them to test - one move at a
            time.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-3 text-muted-foreground text-xs">
            <span className="flex items-center gap-1.5">
              <BadgeCheck className="size-3.5 text-primary" /> Legal moves
              validation
            </span>
            <span className="flex items-center gap-1.5">
              <MessageCircle className="size-3.5 text-primary" /> Live chat
              &amp; response time
            </span>
            <span className="flex items-center gap-1.5">
              <Cpu className="size-3.5 text-primary" />
              Token usage &amp; API cost
            </span>
          </div>
        </section>

        <form className="mt-12" onSubmit={handleSubmit}>
          <Card className="overflow-hidden p-0 shadow-lg">
            <div className="bg-muted/35 px-5 py-3 text-center font-semibold text-xs uppercase tracking-widest">
              Set your matchup
            </div>
            <CardContent className="grid items-stretch p-0 lg:grid-cols-[1fr_auto_1fr]">
              <section className="flex min-h-80 flex-col items-center justify-center p-6 text-center sm:p-8">
                <span className="mb-5 flex size-24 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
                  <CircleUserRound className="size-11" />
                </span>
                <p className="font-semibold text-primary text-xs uppercase tracking-widest">
                  White · You
                </p>
                <h2 className="mt-2 text-balance font-bold text-2xl">
                  {playerName.trim() || "Guest"}
                </h2>
                <div className="mt-6 w-full max-w-xs text-left">
                  <Label className="sr-only" htmlFor="player-name">
                    Your display name
                  </Label>
                  <Input
                    autoComplete="name"
                    autoFocus
                    className="h-12 rounded-lg bg-background text-center text-base md:text-base"
                    id="player-name"
                    maxLength={30}
                    onChange={handleNameChange}
                    placeholder="Your display name"
                    value={playerName}
                  />
                </div>
              </section>

              <div className="relative flex items-center justify-center px-6 py-2 lg:px-2 lg:py-6">
                <span className="absolute inset-x-8 h-px bg-border lg:inset-x-auto lg:inset-y-8 lg:h-auto lg:w-px" />
                <span className="relative flex size-14 items-center justify-center rounded-full bg-foreground font-bold text-background text-sm shadow-md ring-8 ring-card">
                  VS
                </span>
              </div>

              <section className="flex min-h-80 flex-col border-t p-5 lg:border-t-0 lg:p-6">
                <div className="flex items-center gap-4 rounded-xl bg-muted/45 p-4">
                  {selectedModel ? (
                    <ModelLogo
                      className="size-14 rounded-xl"
                      logoUrl={selectedModel.logoUrl}
                      name={selectedModel.name}
                    />
                  ) : (
                    <Skeleton className="size-14 rounded-xl" />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-[10px] text-primary uppercase tracking-widest">
                      Black · Challenger
                    </p>
                    <h2 className="mt-1 truncate font-bold text-xl">
                      {selectedModel?.name ?? "Choosing opponent…"}
                    </h2>
                    <p className="truncate text-muted-foreground text-xs">
                      {selectedModel?.description ?? "Loading the roster"}
                    </p>
                  </div>
                </div>

                <fieldset className="mt-4 min-h-0 flex-1">
                  <legend className="mb-2 font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">
                    Choose your challenger
                  </legend>
                  <div className="max-h-56 space-y-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
                    {isLoadingModels
                      ? ["first", "second", "third"].map((item) => (
                          <Skeleton
                            className="h-14 w-full rounded-lg"
                            key={item}
                          />
                        ))
                      : models.map((model) => (
                          <ModelOption
                            isSelected={selectedModelId === model.id}
                            key={model.id}
                            model={model}
                            onSelect={setSelectedModelId}
                          />
                        ))}
                  </div>
                </fieldset>
              </section>
            </CardContent>

            <div className="border-t bg-muted/20 p-4 sm:px-6">
              <div className="mx-auto max-w-md">
                <div aria-live="polite" className="mb-2 min-h-5 text-center">
                  {error ? (
                    <p
                      className="text-pretty text-destructive text-sm"
                      role="alert"
                    >
                      {error}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      Untimed game · You always begin as White
                    </p>
                  )}
                </div>
                <Button
                  className="h-12 w-full text-sm"
                  disabled={
                    isStarting || isLoadingModels || models.length === 0
                  }
                  size="lg"
                  type="submit"
                >
                  {isStarting ? "Entering the arena…" : "Start the match"}
                  {isStarting ? null : <ArrowRight className="size-4" />}
                </Button>
              </div>
            </div>
          </Card>
        </form>

        <p className="mt-5 flex items-center justify-center gap-2 text-center text-muted-foreground text-xs">
          <Swords className="size-3.5" /> No account, clock, or rating pressure.
          Just chess.
        </p>
      </div>
    </main>
  );
}
