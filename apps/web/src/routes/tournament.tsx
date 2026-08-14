import {
  Activity,
  ArrowRight,
  CircleDot,
  Clock3,
  Play,
  Swords,
  Trophy,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, Outlet, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import ModelLogo from "@/features/chess/components/model-logo";
import type {
  TournamentGameSummary,
  TournamentGroup,
  TournamentSnapshot,
  TournamentStanding,
} from "@/features/tournament/types";
import { getTournament, runNextTournamentGame } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/tournament";

const POLL_INTERVAL_MS = 2500;

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
    return "Upcoming";
  }
  if (game.result === "draw") {
    return "Draw";
  }
  return game.winnerModelId === game.whiteModel.id
    ? `${game.whiteModel.name} won`
    : `${game.blackModel.name} won`;
};

function StandingsTable({
  group,
  standings,
}: {
  group: TournamentGroup;
  standings: TournamentStanding[];
}) {
  return (
    <Card className="overflow-hidden p-0">
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
                  #
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

function GameRow({ game }: { game: TournamentGameSummary }) {
  const gameLabel = `${game.whiteModel.name} versus ${game.blackModel.name}`;
  let statusIcon = <Clock3 className="size-3.5" />;
  if (game.status === "active") {
    statusIcon = (
      <span className="size-2 rounded-full bg-primary motion-safe:animate-pulse" />
    );
  } else if (game.status === "completed") {
    statusIcon = <CircleDot className="size-3.5" />;
  }
  return (
    <Link
      aria-label={`Open ${gameLabel}`}
      className="group grid gap-3 px-4 py-4 outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:grid-cols-[6rem_1fr_auto] sm:items-center"
      to={`/tournament/games/${game.id}`}
    >
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
        {statusIcon}
        {game.status === "active" ? "Live" : `Game ${game.sequence}`}
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold text-sm">{gameLabel}</p>
        <p className="mt-0.5 truncate text-muted-foreground text-xs">
          Group {game.group} · {getResultLabel(game)}
        </p>
      </div>
      <ArrowRight className="hidden size-4 text-muted-foreground group-hover:text-foreground sm:block" />
    </Link>
  );
}

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
  const [isStarting, setIsStarting] = useState(false);

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

  const startNextGame = useCallback(async (): Promise<void> => {
    setIsStarting(true);
    setError(null);
    try {
      await runNextTournamentGame();
      await refreshTournament();
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Unable to start the next game"
      );
    } finally {
      setIsStarting(false);
    }
  }, [refreshTournament]);

  if (!(tournament || error)) {
    return <TournamentSkeleton />;
  }

  const activeGame = tournament?.games.find((game) => game.status === "active");
  const completedGames =
    tournament?.games.filter((game) => game.status === "completed") ?? [];
  const scheduledGames =
    tournament?.games.filter((game) => game.status === "scheduled") ?? [];

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
            Ten models. Two groups. Every move chosen by an LLM and validated by
            the same chess engine.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs tabular-nums">
          <span className="text-muted-foreground">
            {tournament?.completedGames ?? 0} / 40 group games
          </span>
          {activeGame ? (
            <Link
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              to={`/tournament/games/${activeGame.id}`}
            >
              <Activity className="size-4" /> Watch live
            </Link>
          ) : null}
        </div>
      </header>

      {error ? (
        <p className="mt-5 text-pretty text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {import.meta.env.DEV ? (
        <div className="mt-5 flex items-center justify-between gap-4 rounded-lg border bg-muted/20 p-4">
          <div>
            <p className="font-medium text-sm">Local tournament control</p>
            <p className="mt-0.5 text-muted-foreground text-xs">
              Sequential runner · hard limit {tournament?.gameLimit ?? 3} games
            </p>
          </div>
          <Button
            disabled={
              isStarting ||
              Boolean(activeGame) ||
              (tournament?.completedGames ?? 0) >= (tournament?.gameLimit ?? 3)
            }
            onClick={startNextGame}
          >
            <Play className="size-4" />
            {isStarting ? "Starting…" : "Run next game"}
          </Button>
        </div>
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
          <StandingsTable group="A" standings={tournament?.groups.A ?? []} />
          <StandingsTable group="B" standings={tournament?.groups.B ?? []} />
        </div>
      </section>

      <section aria-labelledby="knockout-heading" className="mt-10">
        <Card>
          <CardHeader>
            <p className="font-semibold text-primary text-xs uppercase tracking-widest">
              Knockouts
            </p>
            <CardTitle className="text-balance" id="knockout-heading">
              Road to the final
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
            <div className="space-y-2">
              <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                Group A #1 <span className="text-muted-foreground">vs</span>{" "}
                Group B #2
              </div>
              <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                Group B #1 <span className="text-muted-foreground">vs</span>{" "}
                Group A #2
              </div>
            </div>
            <ArrowRight className="mx-auto hidden size-4 text-muted-foreground md:block" />
            <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
              Semifinal winners
            </div>
            <ArrowRight className="mx-auto hidden size-4 text-muted-foreground md:block" />
            <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
              Champion
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="games-heading" className="mt-10">
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
        <Card className="overflow-hidden p-0">
          {activeGame ? <GameRow game={activeGame} /> : null}
          {completedGames.map((game) => (
            <GameRow game={game} key={game.id} />
          ))}
          {scheduledGames.map((game) => (
            <GameRow game={game} key={game.id} />
          ))}
          {(tournament?.games.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <Swords className="size-6 text-muted-foreground" />
              <p className="mt-3 font-medium">No games scheduled</p>
              <p className="mt-1 text-pretty text-muted-foreground text-sm">
                Add tournament fixtures to begin the season.
              </p>
            </div>
          ) : null}
        </Card>
      </section>
    </main>
  );
}

export default function TournamentPage() {
  const { gameId } = useParams();
  return gameId ? <Outlet /> : <TournamentOverview />;
}
