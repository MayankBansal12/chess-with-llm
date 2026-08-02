import {
  ArrowRight,
  Bot,
  Check,
  CircleUserRound,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
        "flex cursor-pointer items-center gap-3 border p-3 transition-colors hover:bg-muted/50 has-focus-visible:ring-2 has-focus-visible:ring-ring",
        isSelected && "border-primary bg-primary/5"
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
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center border",
          isSelected && "border-primary bg-primary text-primary-foreground"
        )}
      >
        {isSelected ? <Check className="size-4" /> : <Bot className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-medium text-sm">
          <span className="truncate">{model.name}</span>
          {model.id === DEFAULT_MODEL_ID ? (
            <span className="bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
              Default
            </span>
          ) : null}
        </span>
        <span className="line-clamp-1 text-muted-foreground text-xs">
          {model.description}
        </span>
      </span>
    </label>
  );
}

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "New Match · Chess with LLM" },
    {
      content:
        "Choose your OpenCode Go opponent and play a live game of chess.",
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
          const firstModel = availableModels.at(0);
          setSelectedModelId(firstModel ? firstModel.id : "");
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "OpenCode Go models are unavailable"
        );
      } finally {
        setIsLoadingModels(false);
      }
    };
    loadModels().catch(() => undefined);
  }, []);

  const handleNameChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setPlayerName(event.target.value);
    },
    []
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = playerName.trim();
    if (!trimmedName) {
      setError("Enter the name you want on the scoresheet");
      return;
    }
    if (!selectedModelId) {
      setError("Choose an opponent");
      return;
    }

    setError(null);
    setIsStarting(true);
    try {
      const game = await createGame(trimmedName, selectedModelId);
      await navigate(`/game/${game.id}`);
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
    <main className="min-h-0 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col justify-center px-4 py-10 sm:px-6 lg:py-14">
        <div className="mb-8 grid items-end gap-5 md:grid-cols-[1fr_auto]">
          <div className="max-w-2xl">
            <div className="mb-4 flex items-center gap-2 text-muted-foreground text-xs uppercase">
              <span className="size-2 bg-primary" />
              Live model match
            </div>
            <h1 className="text-balance font-display text-4xl sm:text-5xl lg:text-6xl">
              Choose your rival.
              <br />
              Play the position.
            </h1>
            <p className="mt-4 max-w-xl text-pretty text-muted-foreground">
              You have White. After every move, your selected LLM studies the
              full scoresheet and replies over OpenCode Go.
            </p>
          </div>
          <div className="hidden items-center gap-3 border-l pl-5 text-muted-foreground text-xs md:flex">
            <span className="font-display text-4xl text-foreground">01</span>
            <span>
              Set the table
              <br />
              Begin the match
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="min-h-80 border-t-4 border-t-primary">
              <CardHeader>
                <div className="mb-5 flex size-11 items-center justify-center bg-primary text-primary-foreground">
                  <CircleUserRound className="size-5" />
                </div>
                <CardTitle className="text-balance font-display text-2xl">
                  You play White
                </CardTitle>
                <CardDescription className="text-pretty">
                  Your name will appear beside the board and on the final
                  result.
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto space-y-3">
                <Label className="text-sm" htmlFor="player-name">
                  Player name
                </Label>
                <Input
                  autoComplete="name"
                  autoFocus
                  className="h-12 text-base md:text-base"
                  id="player-name"
                  maxLength={30}
                  onChange={handleNameChange}
                  placeholder="e.g. Mikhail"
                  value={playerName}
                />
                <p className="text-pretty text-muted-foreground text-xs">
                  You’ll always make the opening move.
                </p>
              </CardContent>
            </Card>

            <Card className="min-h-80">
              <CardHeader>
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex size-11 items-center justify-center bg-secondary text-secondary-foreground">
                    <Bot className="size-5" />
                  </div>
                  <span className="flex items-center gap-1.5 bg-secondary px-2 py-1 text-secondary-foreground text-xs">
                    <Sparkles className="size-3" /> OpenCode Go
                  </span>
                </div>
                <CardTitle className="text-balance font-display text-2xl">
                  Choose Black
                </CardTitle>
                <CardDescription className="text-pretty">
                  Each opponent gets three chances to return a legal move.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <fieldset className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  <legend className="sr-only">Available language models</legend>
                  {isLoadingModels
                    ? ["first", "second", "third"].map((item) => (
                        <Skeleton className="h-16 w-full" key={item} />
                      ))
                    : models.map((model) => (
                        <ModelOption
                          isSelected={selectedModelId === model.id}
                          key={model.id}
                          model={model}
                          onSelect={setSelectedModelId}
                        />
                      ))}
                </fieldset>
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 flex flex-col items-stretch justify-between gap-3 border bg-card p-4 sm:flex-row sm:items-center">
            <div aria-live="polite" className="min-h-5 text-sm">
              {error ? (
                <p className="text-pretty text-destructive">{error}</p>
              ) : (
                <p className="text-pretty text-muted-foreground">
                  No clock. No engine hints. Just you and the model.
                </p>
              )}
            </div>
            <Button
              className="h-11 px-5 text-sm"
              disabled={isStarting || isLoadingModels || models.length === 0}
              size="lg"
              type="submit"
            >
              {isStarting ? "Setting the board…" : "Start match"}
              {isStarting ? null : <ArrowRight className="size-4" />}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
