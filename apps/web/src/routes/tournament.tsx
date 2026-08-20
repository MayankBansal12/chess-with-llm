import { Activity, ArrowRight, Play, Trophy } from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import { Link, Outlet, useParams } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import ModelLogo from "@/features/chess/components/model-logo";
import type { ChessModel } from "@/features/chess/types";
import type {
  TournamentGameSummary,
  TournamentGroup,
  TournamentSnapshot,
  TournamentStanding,
} from "@/features/tournament/types";
import { getTournament } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/tournament";

const POLL_INTERVAL_MS = 2500;
const GROUP_GAME_COUNT = 24;
const SEMIFINAL_ONE_MATCH_NUMBER = GROUP_GAME_COUNT + 1;
const SEMIFINAL_TWO_MATCH_NUMBER = GROUP_GAME_COUNT + 2;
const FINAL_MATCH_NUMBER = GROUP_GAME_COUNT + 3;

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

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Open Weight Tournament · Chess with LLM" },
    {
      content:
        "Watch open-weight language models play a live chess tournament.",
      name: "description",
    },
  ];
}

const getResultLabel = (game: TournamentGameSummary): string => {
  if (game.status === "active") {
    const thinkingModel =
      game.thinkingModelId === game.whiteModel.id
        ? game.whiteModel
        : game.blackModel;
    return game.thinkingModelId
      ? `${thinkingModel.name} is thinking`
      : "Game in progress";
  }
  if (game.status === "scheduled") {
    return "Upcoming Match";
  }
  if (game.status === "paused") {
    return "Paused · ready to continue";
  }
  if (game.result === "draw") {
    return "Match ended in Draw";
  }
  const winner = [game.whiteModel, game.blackModel].find(
    (model) => model.id === game.winnerModelId
  );
  return game.result && winner ? `${winner.id} wins` : "Result unavailable";
};

function StandingsTable({
  group,
  standings,
}: {
  group: TournamentGroup;
  standings: TournamentStanding[];
}) {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <CardHeader className="border-b bg-muted/30 px-5 py-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-balance text-base">
            Group {group}
          </CardTitle>
          <span className="text-muted-foreground text-xs">Top 2 advance</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm tabular-nums">
            <thead className="border-b text-muted-foreground text-xs">
              <tr>
                <th className="px-4 py-3 font-medium" scope="col">
                  <span className="inline-flex size-6 items-center justify-center">
                    #
                  </span>
                </th>
                <th className="px-2 py-3 font-medium" scope="col">
                  Model
                </th>
                <th className="px-2 py-3 text-center font-medium" scope="col">
                  P
                </th>
                <th className="px-2 py-3 text-center font-medium" scope="col">
                  W
                </th>
                <th className="px-2 py-3 text-center font-medium" scope="col">
                  D
                </th>
                <th className="px-2 py-3 text-center font-medium" scope="col">
                  L
                </th>
                <th className="px-4 py-3 text-right font-medium" scope="col">
                  NR
                </th>
                <th className="px-4 py-3 text-right font-medium" scope="col">
                  Pts
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {standings.map((standing) => (
                <tr className="hover:bg-muted/20" key={standing.model.id}>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-full font-semibold text-xs",
                        standing.rank <= 2
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground"
                      )}
                    >
                      {standing.rank}
                    </span>
                  </td>
                  <th className="px-2 py-3 font-medium" scope="row">
                    <span className="flex min-w-40 items-center gap-2.5">
                      <ModelLogo
                        className="size-7"
                        logoUrl={standing.model.logoUrl}
                        name={standing.model.name}
                      />
                      <span className="truncate">{standing.model.name}</span>
                    </span>
                  </th>
                  <td className="px-2 py-3 text-center">{standing.played}</td>
                  <td className="px-2 py-3 text-center">{standing.wins}</td>
                  <td className="px-2 py-3 text-center">{standing.draws}</td>
                  <td className="px-2 py-3 text-center">{standing.losses}</td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right font-semibold",
                      getNrClassName(standing.nr)
                    )}
                  >
                    {formatNr(standing.nr)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold">
                    {standing.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

const getGameScore = (
  game: TournamentGameSummary,
  color: "black" | "white"
): string => {
  if (game.result === "draw") {
    return "½";
  }
  if (!game.result) {
    return "–";
  }
  return game.result === color ? "1" : "0";
};

const getGameStageLabel = (game: TournamentGameSummary): string => {
  if (game.group) {
    return `Group ${game.group}`;
  }
  return game.stage === "semifinal"
    ? `SF${game.sequence - GROUP_GAME_COUNT}`
    : "Final";
};

const getGameStageBadgeClassName = (
  stage: TournamentGameSummary["stage"]
): string => {
  if (stage === "final") {
    return "bg-primary text-primary-foreground";
  }
  if (stage === "semifinal") {
    return "bg-primary/15 text-primary";
  }
  return "bg-muted text-muted-foreground";
};

const getGameActionLabel = (game: TournamentGameSummary): string => {
  if (game.status === "active") {
    return "Watch game";
  }
  if (game.status === "paused") {
    return "Continue game";
  }
  return game.status === "completed" ? "View game" : "View matchup";
};

const getGameCardEntranceStyle = (index: number): CSSProperties =>
  ({
    "--game-card-delay": `${Math.min(index, 5) * 45}ms`,
  }) as CSSProperties;

function GameCard({
  game,
  index: cardIndex,
}: {
  game: TournamentGameSummary;
  index: number;
}) {
  const gameLabel = `${game.whiteModel.name} versus ${game.blackModel.name}`;

  return (
    <Link
      aria-label={`Open ${gameLabel}`}
      className="tournament-game-card tournament-game-card-link group relative rounded-xl border bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={getGameCardEntranceStyle(cardIndex)}
      to={`/tournament/games/${game.id}`}
    >
      <div className="flex items-center justify-between gap-3 text-xs">
        <span
          className={cn(
            "rounded-full px-2.5 py-1 font-medium uppercase tracking-wider",
            getGameStageBadgeClassName(game.stage)
          )}
        >
          {getGameStageLabel(game)}
        </span>
        <div className="flex items-center gap-2.5">
          {game.status === "active" ? (
            <span className="rounded-full bg-primary/15 px-2.5 py-1 font-medium text-primary uppercase tracking-wider">
              Live
            </span>
          ) : null}
          <span className="text-muted-foreground tabular-nums">
            Match {game.sequence}
          </span>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-start gap-3 text-center">
        {[
          {
            color: "white" as const,
            model: game.whiteModel,
          },
          {
            color: "black" as const,
            model: game.blackModel,
          },
        ].map(({ color, model }, index) => (
          <div className="contents" key={model.id}>
            {index === 1 ? (
              <span className="mt-4 font-bold text-muted-foreground text-xs">
                VS
              </span>
            ) : null}
            <div
              className={cn(
                "min-w-0",
                game.result &&
                  game.result !== "draw" &&
                  game.result !== color &&
                  "opacity-40"
              )}
            >
              <div className="relative mx-auto w-fit">
                <ModelLogo
                  className="size-12 rounded-xl"
                  logoUrl={model.logoUrl}
                  name={model.name}
                />
                {game.status === "scheduled" ? null : (
                  <span className="absolute -right-2 -bottom-2 flex size-6 items-center justify-center rounded-full border bg-background font-bold text-xs tabular-nums">
                    {getGameScore(game, color)}
                  </span>
                )}
              </div>
              <p className="mt-3 truncate font-semibold text-sm">
                {model.name}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 text-center">
        <p className="truncate text-muted-foreground text-xs">
          {getResultLabel(game)}
        </p>
      </div>
      <span
        aria-hidden="true"
        className="tournament-card-play absolute right-4 bottom-4 inline-flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
        title={getGameActionLabel(game)}
      >
        <Play className="size-5" />
      </span>
    </Link>
  );
}

interface BracketSlot {
  label: string;
  model?: ChessModel;
}

function KnockoutArchiveCard({
  index,
  label,
  matchNumber,
  slots,
}: {
  index: number;
  label: "Final" | "SF1" | "SF2";
  matchNumber: number;
  slots: BracketSlot[];
}) {
  const participants = slots.map((slot) => slot.model?.name ?? "TBD");
  const participantSlots = slots.map((slot, slotIndex) => ({
    side: slotIndex === 0 ? "white" : "black",
    slot,
  }));
  const isMatchupSet = slots.every((slot) => Boolean(slot.model));

  return (
    <article
      aria-label={`${label}: ${participants.join(" versus ")}`}
      className="tournament-game-card relative flex flex-col rounded-xl border bg-card p-4"
      style={getGameCardEntranceStyle(index)}
    >
      <div className="flex items-center justify-between gap-3 text-xs">
        <span
          className={cn(
            "rounded-full px-2.5 py-1 font-medium uppercase tracking-wider",
            getGameStageBadgeClassName(
              label === "Final" ? "final" : "semifinal"
            )
          )}
        >
          {label}
        </span>
        <span className="text-muted-foreground tabular-nums">
          Match {matchNumber}
        </span>
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 text-center">
          {participantSlots.map(({ side, slot }, slotIndex) => (
            <div className="contents" key={`${label}-${side}`}>
              {slotIndex === 1 ? (
                <span className="mt-4 font-bold text-muted-foreground text-xs">
                  VS
                </span>
              ) : null}
              <div className="min-w-0">
                {slot.model ? (
                  <ModelLogo
                    className="mx-auto size-12 rounded-xl"
                    logoUrl={slot.model.logoUrl}
                    name={slot.model.name}
                  />
                ) : (
                  <span className="mx-auto flex size-12 items-center justify-center rounded-xl border border-dashed bg-muted/30 font-semibold text-muted-foreground text-xs">
                    TBD
                  </span>
                )}
                {slot.model ? (
                  <p className="mt-3 truncate font-semibold text-sm">
                    {slot.model.name}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-5 truncate text-center text-muted-foreground text-xs">
          {isMatchupSet ? "Matchup set" : "Awaiting qualification"}
        </p>
      </div>
    </article>
  );
}

function BracketMatch({
  label,
  matchNumber,
  slots,
}: {
  label: string;
  matchNumber: number;
  slots: BracketSlot[];
}) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3 text-[10px] uppercase tracking-widest">
        <span className="font-semibold text-muted-foreground">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          Match {matchNumber}
        </span>
      </div>
      <div className="space-y-1">
        {slots.map((slot) => (
          <div
            className="flex min-h-11 items-center gap-2 rounded-lg bg-muted/40 px-2.5 text-sm"
            key={slot.model?.id ?? slot.label}
          >
            {slot.model ? (
              <ModelLogo
                className="size-7"
                logoUrl={slot.model.logoUrl}
                name={slot.model.name}
              />
            ) : (
              <span className="size-7 rounded-full border border-dashed" />
            )}
            <span className="min-w-0 flex-1 truncate font-medium">
              {slot.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const getWinnerModel = (
  game: TournamentGameSummary | undefined
): ChessModel | undefined => {
  if (!game?.winnerModelId) {
    return;
  }
  return game.winnerModelId === game.whiteModel.id
    ? game.whiteModel
    : game.blackModel;
};

const getBracketSlots = (
  game: TournamentGameSummary | undefined,
  fallback: BracketSlot[]
): BracketSlot[] => {
  if (!game) {
    return fallback;
  }
  return [game.whiteModel, game.blackModel].map((model) => ({
    label: model.name,
    model,
  }));
};

const getChampionLabel = (game: TournamentGameSummary | undefined): string => {
  const winner = getWinnerModel(game);
  return winner ? winner.name : "Champion awaits";
};

function TournamentSkeleton() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="mt-3 h-5 w-full max-w-xl" />
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </main>
  );
}

function TournamentOverview() {
  const [tournament, setTournament] = useState<TournamentSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshTournament = useCallback(async (): Promise<void> => {
    try {
      const snapshot = await getTournament();
      setTournament(snapshot);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load the tournament"
      );
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const refresh = async (): Promise<void> => {
      if (!isCancelled) {
        await refreshTournament();
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
  }, [refreshTournament]);

  if (!(tournament || error)) {
    return <TournamentSkeleton />;
  }

  if (!tournament) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-20 text-center">
        <h1 className="text-balance font-bold text-2xl">
          Tournament unavailable
        </h1>
        <p className="mt-3 text-pretty text-destructive text-sm" role="alert">
          {error}
        </p>
      </main>
    );
  }

  const activeGames = tournament.games.filter(
    (game) => game.status === "active"
  );
  const soleActiveGame = activeGames.length === 1 ? activeGames[0] : undefined;
  const orderedGroupGames = tournament.games
    .filter((game) => game.stage === "group")
    .sort((first, second) => first.sequence - second.sequence);
  const groupGames = tournament.games.filter((game) => game.stage === "group");
  const completedGroupGames = groupGames.filter(
    (game) => game.status === "completed"
  ).length;
  const areGroupGamesComplete =
    groupGames.length === GROUP_GAME_COUNT &&
    completedGroupGames === GROUP_GAME_COUNT;
  const semifinalGames = tournament.games
    .filter((game) => game.stage === "semifinal")
    .sort((first, second) => first.sequence - second.sequence);
  const finalGame = tournament.games.find((game) => game.stage === "final");
  const pendingSemifinalSlots = [{ label: "TBD" }, { label: "TBD" }];
  const semifinalOneSlots = areGroupGamesComplete
    ? getBracketSlots(semifinalGames[0], [
        {
          label: tournament.groups.A[0]?.model.name ?? "TBD",
          model: tournament.groups.A[0]?.model,
        },
        {
          label: tournament.groups.B[1]?.model.name ?? "TBD",
          model: tournament.groups.B[1]?.model,
        },
      ])
    : pendingSemifinalSlots;
  const semifinalTwoSlots = areGroupGamesComplete
    ? getBracketSlots(semifinalGames[1], [
        {
          label: tournament.groups.B[0]?.model.name ?? "TBD",
          model: tournament.groups.B[0]?.model,
        },
        {
          label: tournament.groups.A[1]?.model.name ?? "TBD",
          model: tournament.groups.A[1]?.model,
        },
      ])
    : pendingSemifinalSlots;
  const semifinalWinners = [
    getWinnerModel(semifinalGames[0]),
    getWinnerModel(semifinalGames[1]),
  ];
  const finalSlotModels = finalGame
    ? [finalGame.whiteModel, finalGame.blackModel]
    : semifinalWinners;
  const finalSlots = finalSlotModels.map((model, index) => ({
    label: model?.name ?? `SF ${index + 1} winner`,
    model,
  }));
  const knockoutArchiveEntries = [
    {
      game: semifinalGames[0],
      label: "SF1" as const,
      matchNumber: SEMIFINAL_ONE_MATCH_NUMBER,
      slots: semifinalOneSlots,
    },
    {
      game: semifinalGames[1],
      label: "SF2" as const,
      matchNumber: SEMIFINAL_TWO_MATCH_NUMBER,
      slots: semifinalTwoSlots,
    },
    {
      game: finalGame,
      label: "Final" as const,
      matchNumber: FINAL_MATCH_NUMBER,
      slots: finalSlots,
    },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-5 border-b pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 font-semibold text-primary text-xs uppercase tracking-widest">
            <Trophy className="size-4" /> Season one
          </p>
          <h1 className="mt-3 text-balance font-bold text-3xl tracking-tight sm:text-5xl">
            Open Weight Tournament
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-muted-foreground">
            Eight models, divided into two groups, playing each other to prove
            who’s best at chess.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs tabular-nums">
          <span className="text-muted-foreground">
            24 group games and 3 knockouts
          </span>
          {soleActiveGame ? (
            <Link
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              to={`/tournament/games/${soleActiveGame.id}`}
            >
              <Activity className="size-4" /> Watch live
            </Link>
          ) : null}
          {activeGames.length > 1 ? (
            <Link
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              to="/tournament#games"
            >
              <Activity className="size-4" /> {activeGames.length} live games
            </Link>
          ) : null}
        </div>
      </header>

      {error ? (
        <p className="mt-5 text-pretty text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <section aria-labelledby="standings-heading" className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="font-semibold text-primary text-xs uppercase tracking-widest">
              Leaderboard
            </p>
            <h2
              className="mt-1 text-balance font-bold text-2xl"
              id="standings-heading"
            >
              Group standings
            </h2>
          </div>
          <p className="text-muted-foreground text-xs tabular-nums">
            Win 10 · Draw 5 · Loss 0
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <StandingsTable group="A" standings={tournament.groups.A} />
          <StandingsTable group="B" standings={tournament.groups.B} />
        </div>
      </section>

      <section aria-labelledby="knockout-heading" className="mt-10">
        <Card className="overflow-hidden">
          <CardHeader className="border-b">
            <p className="font-semibold text-primary text-xs uppercase tracking-widest">
              Knockouts
            </p>
            <CardTitle
              className="mt-1 text-balance font-bold text-2xl"
              id="knockout-heading"
            >
              Road to Final
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 bg-muted/15 p-5 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(180px,0.65fr)] md:items-center">
            <div>
              <div className="space-y-4">
                <BracketMatch
                  label="Semi-final 1"
                  matchNumber={
                    semifinalGames[0]?.sequence ?? SEMIFINAL_ONE_MATCH_NUMBER
                  }
                  slots={semifinalOneSlots}
                />
                <BracketMatch
                  label="Semi-final 2"
                  matchNumber={
                    semifinalGames[1]?.sequence ?? SEMIFINAL_TWO_MATCH_NUMBER
                  }
                  slots={semifinalTwoSlots}
                />
              </div>
            </div>
            <ArrowRight className="mx-auto hidden size-5 text-muted-foreground md:block" />
            <div>
              <BracketMatch
                label="Championship Final"
                matchNumber={finalGame?.sequence ?? FINAL_MATCH_NUMBER}
                slots={finalSlots}
              />
            </div>
            <ArrowRight className="mx-auto hidden size-5 text-muted-foreground md:block" />
            <div>
              <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed bg-card p-4 text-center shadow-sm">
                <Trophy className="size-6 text-primary" />
                <p className="mt-3 font-semibold text-sm">
                  {getChampionLabel(finalGame)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="games-heading" className="mt-10" id="games">
        <div className="mb-4">
          <p className="font-semibold text-primary text-xs uppercase tracking-widest">
            Match archive
          </p>
          <h2
            className="mt-1 text-balance font-bold text-2xl"
            id="games-heading"
          >
            Games
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orderedGroupGames.map((game, index) => (
            <GameCard game={game} index={index} key={game.id} />
          ))}
          {knockoutArchiveEntries.map((entry, knockoutIndex) =>
            entry.game ? (
              <GameCard
                game={entry.game}
                index={orderedGroupGames.length + knockoutIndex}
                key={entry.label}
              />
            ) : (
              <KnockoutArchiveCard
                index={orderedGroupGames.length + knockoutIndex}
                key={entry.label}
                label={entry.label}
                matchNumber={entry.matchNumber}
                slots={entry.slots}
              />
            )
          )}
        </div>
      </section>
    </main>
  );
}

export default function TournamentPage() {
  const { gameId } = useParams();
  return gameId ? <Outlet /> : <TournamentOverview />;
}
