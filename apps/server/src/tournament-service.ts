import { Chess, type Square } from "chess.js";
import {
  getChessModelById,
  getGameMetrics,
  type ModelTurnTrace,
  redactModelDiagnostics,
  requestTournamentModelMove,
} from "./chess-games";
import { calculateTournamentNr } from "./tournament-nr";
import { TOURNAMENT_ID, TOURNAMENT_NAME } from "./tournament-schedule";
import type {
  StoredGameRecord,
  StoredMove,
  StoredStanding,
  TournamentSeedLoader,
  TournamentStore,
} from "./tournament-store";
import { TournamentOwnershipError } from "./tournament-store";
import type {
  TournamentGameSnapshot,
  TournamentGameSummary,
  TournamentGroup,
  TournamentResult,
  TournamentSnapshot,
  TournamentStanding,
} from "./tournament-types";

export class TournamentNotFoundError extends Error {}
export class TournamentRunError extends Error {}

export const getTournamentStatus = (
  scheduledGames: number,
  activeGames: number
): TournamentSnapshot["status"] => {
  if (activeGames > 0) {
    return "live";
  }
  return scheduledGames === 0 ? "complete" : "ready";
};

const loadChess = (pgn: string): Chess => {
  const chess = new Chess();
  if (pgn) {
    chess.loadPgn(pgn);
  }
  return chess;
};

const getLastMove = (
  moves: StoredMove[]
): TournamentGameSummary["lastMove"] => {
  const lastMove = moves.at(-1);
  if (!lastMove) {
    return null;
  }
  return {
    from: lastMove.uci.slice(0, 2) as Square,
    san: lastMove.san,
    to: lastMove.uci.slice(2, 4) as Square,
  };
};

const toStanding = (
  standing: StoredStanding,
  rank: number
): TournamentStanding => ({
  ...standing,
  model: getChessModelById(standing.modelId),
  rank,
});

const groupStandings = (
  standings: StoredStanding[],
  group: TournamentGroup
): TournamentStanding[] =>
  standings
    .filter((standing) => standing.group === group)
    .map((standing, index) => toStanding(standing, index + 1));

export class TournamentService {
  private readonly runningGameIds = new Set<string>();
  private readonly store: TournamentStore;

  constructor(store: TournamentStore) {
    this.store = store;
  }

  async initialize(loadSeed?: TournamentSeedLoader): Promise<void> {
    await this.store.initialize(loadSeed);
    await this.resumeInterruptedGames();
  }

  async getTournament(): Promise<TournamentSnapshot> {
    const [storedGames, standings] = await Promise.all([
      this.store.getGames(),
      this.store.getStandings(),
    ]);
    const games = storedGames.map((game) => this.toGameSummary(game));
    const activeGameIds = games
      .filter((game) => game.status === "active")
      .map((game) => game.id);
    const completedGames = games.filter(
      (game) => game.status === "completed"
    ).length;
    const scheduledGames = games.filter(
      (game) => game.status === "scheduled"
    ).length;

    return {
      activeGameIds,
      completedGames,
      games,
      groups: {
        A: groupStandings(standings, "A"),
        B: groupStandings(standings, "B"),
      },
      id: TOURNAMENT_ID,
      name: TOURNAMENT_NAME,
      scheduledGames,
      status: getTournamentStatus(scheduledGames, activeGameIds.length),
    };
  }

  async getGame(
    gameId: string,
    includeDiagnostics = false
  ): Promise<TournamentGameSnapshot> {
    const game = await this.store.getGame(gameId);
    if (!game) {
      throw new TournamentNotFoundError("Tournament game not found");
    }
    const chess = loadChess(game.pgn);
    return {
      ...this.toGameSummary(game),
      fen: chess.fen(),
      modelTurns:
        process.env.NODE_ENV === "production" && !includeDiagnostics
          ? redactModelDiagnostics(game.modelTurns)
          : game.modelTurns,
      moves: game.moves,
      pgn: game.pgn,
      revision: game.revision,
      turn: chess.turn(),
    };
  }

  async startGame(gameId: string): Promise<TournamentGameSnapshot> {
    if (this.runningGameIds.has(gameId)) {
      throw new TournamentRunError("Tournament game has already started");
    }
    this.runningGameIds.add(gameId);
    let game: StoredGameRecord;
    try {
      game = await this.store.startGame(gameId);
    } catch (error) {
      this.runningGameIds.delete(gameId);
      throw new TournamentRunError(
        error instanceof Error ? error.message : "Unable to start the game",
        { cause: error }
      );
    }
    this.runInBackground(game.id, this.requireRunId(game));
    return this.getGame(game.id);
  }

  async resumeGame(gameId: string): Promise<TournamentGameSnapshot> {
    if (this.runningGameIds.has(gameId)) {
      throw new TournamentRunError("Tournament game is already running");
    }
    this.runningGameIds.add(gameId);
    let game: StoredGameRecord;
    try {
      game = await this.store.resumeGame(gameId);
    } catch (error) {
      this.runningGameIds.delete(gameId);
      throw new TournamentRunError(
        error instanceof Error ? error.message : "Unable to resume the game",
        { cause: error }
      );
    }
    this.runInBackground(game.id, this.requireRunId(game));
    return this.getGame(game.id);
  }

  async restartDrawnKnockoutGame(
    gameId: string
  ): Promise<TournamentGameSnapshot> {
    if (this.runningGameIds.has(gameId)) {
      throw new TournamentRunError("Tournament game is already running");
    }
    this.runningGameIds.add(gameId);
    let game: StoredGameRecord;
    try {
      await this.store.resetDrawnKnockoutGame(gameId);
      game = await this.store.startGame(gameId);
    } catch (error) {
      this.runningGameIds.delete(gameId);
      throw new TournamentRunError(
        error instanceof Error ? error.message : "Unable to restart the game",
        { cause: error }
      );
    }
    this.runInBackground(game.id, this.requireRunId(game));
    return this.getGame(game.id);
  }

  private toGameSummary(game: StoredGameRecord): TournamentGameSummary {
    return {
      blackModel: getChessModelById(game.blackModelId),
      blackNr: game.blackNr,
      completedAt: game.completedAt,
      durationMs:
        game.startedAt === null
          ? 0
          : Math.max(0, (game.completedAt ?? Date.now()) - game.startedAt),
      error: game.error,
      group: game.group,
      id: game.id,
      lastMove: getLastMove(game.moves),
      metrics: {
        totalCostUsd: game.totalCostUsd,
        totalDurationMs: game.totalDurationMs,
        totalTokens: game.totalTokens,
      },
      moveCount: game.moves.length,
      result: game.result,
      sequence: game.sequence,
      stage: game.stage,
      startedAt: game.startedAt,
      status: game.status,
      terminationReason: game.terminationReason,
      thinkingModelId: game.thinkingModelId,
      whiteModel: getChessModelById(game.whiteModelId),
      whiteNr: game.whiteNr,
      winnerModelId: game.winnerModelId,
    };
  }

  private runInBackground(gameId: string, runId: string): void {
    const runner = this.runGame(gameId, runId)
      .catch(async (error: unknown) => {
        await this.pauseAsError(gameId, runId, error);
      })
      .finally(() => {
        this.runningGameIds.delete(gameId);
      });
    runner.catch(() => undefined);
  }

  private async runGame(gameId: string, runId: string): Promise<void> {
    const storedGame = await this.store.getGame(gameId);
    if (!storedGame) {
      throw new TournamentNotFoundError("Tournament game not found");
    }
    const chess = loadChess(storedGame.pgn);

    while (!chess.isGameOver()) {
      const color = chess.turn();
      const modelId =
        color === "w" ? storedGame.whiteModelId : storedGame.blackModelId;
      // biome-ignore lint/performance/noAwaitInLoops: tournament moves are intentionally sequential.
      await this.store.setThinkingModel(gameId, runId, modelId);
      const turns: ModelTurnTrace[] = [];
      let modelResult: Awaited<ReturnType<typeof requestTournamentModelMove>>;
      try {
        modelResult = await requestTournamentModelMove({
          chess,
          color,
          modelId,
          turns,
        });
      } catch (error) {
        await this.store.recordFailedTurns(
          gameId,
          runId,
          turns,
          getGameMetrics(turns)
        );
        throw error;
      }
      if (!modelResult) {
        await this.store.recordFailedTurns(
          gameId,
          runId,
          turns,
          getGameMetrics(turns)
        );
        await this.completeResignation(gameId, runId, chess, color);
        return;
      }

      const appliedMove = chess.move({
        from: modelResult.move.from,
        promotion: modelResult.move.promotion,
        to: modelResult.move.to,
      });
      modelResult.turn.acceptedMove = appliedMove.san;
      modelResult.turn.message = modelResult.message;
      modelResult.turn.status = "accepted";
      const metrics = getGameMetrics([modelResult.turn]);
      await this.store.recordCompletedTurn(
        gameId,
        runId,
        modelResult.turn,
        {
          color,
          costUsd: metrics.totalCostUsd,
          createdAt: Date.now(),
          durationMs: metrics.totalDurationMs,
          fenAfter: chess.fen(),
          message: modelResult.message,
          modelId,
          ply: chess.history().length,
          san: appliedMove.san,
          tokens: metrics.totalTokens,
          uci: `${appliedMove.from}${appliedMove.to}${appliedMove.promotion ?? ""}`,
        },
        chess.pgn(),
        chess.fen()
      );
    }

    await this.completeFromBoard(gameId, runId, chess);
  }

  private async completeFromBoard(
    gameId: string,
    runId: string,
    chess: Chess
  ): Promise<void> {
    if (!chess.isCheckmate()) {
      await this.completeDraw(gameId, runId, chess, "draw_by_rule", null);
      return;
    }
    const result: TournamentResult = chess.turn() === "b" ? "white" : "black";
    const game = await this.store.getGame(gameId);
    if (!game) {
      throw new TournamentNotFoundError("Tournament game not found");
    }
    await this.store.completeGame({
      ...calculateTournamentNr(chess, result),
      error: null,
      fen: chess.fen(),
      gameId,
      pgn: chess.pgn(),
      result,
      runId,
      terminationReason: "checkmate",
      winnerModelId: result === "white" ? game.whiteModelId : game.blackModelId,
    });
  }

  private async completeDraw(
    gameId: string,
    runId: string,
    chess: Chess,
    terminationReason: string,
    error: string | null
  ): Promise<void> {
    await this.store.completeGame({
      ...calculateTournamentNr(chess, "draw", error !== null),
      error,
      fen: chess.fen(),
      gameId,
      pgn: chess.pgn(),
      result: "draw",
      runId,
      terminationReason,
      winnerModelId: null,
    });
  }

  private async completeResignation(
    gameId: string,
    runId: string,
    chess: Chess,
    resigningColor: "b" | "w"
  ): Promise<void> {
    const game = await this.store.getGame(gameId);
    if (!game) {
      throw new TournamentNotFoundError("Tournament game not found");
    }
    const result: TournamentResult = resigningColor === "w" ? "black" : "white";
    await this.store.completeGame({
      ...calculateTournamentNr(chess, result),
      error: null,
      fen: chess.fen(),
      gameId,
      pgn: chess.pgn(),
      result,
      runId,
      terminationReason: "model_resignation",
      winnerModelId: result === "white" ? game.whiteModelId : game.blackModelId,
    });
  }

  private async pauseAsError(
    gameId: string,
    runId: string,
    error: unknown
  ): Promise<void> {
    if (error instanceof TournamentOwnershipError) {
      return;
    }
    try {
      await this.store.pauseGame(
        gameId,
        runId,
        error instanceof Error ? error.message : "The match could not continue"
      );
    } catch (pauseError) {
      if (!(pauseError instanceof TournamentOwnershipError)) {
        throw pauseError;
      }
    }
  }

  private async resumeInterruptedGames(): Promise<void> {
    const activeGames = await this.store.getActiveGames();
    for (const activeGame of activeGames) {
      // biome-ignore lint/performance/noAwaitInLoops: each recovered game must be claimed before its runner starts.
      const claimedGame = await this.store.claimActiveGame(activeGame.id);
      this.runningGameIds.add(activeGame.id);
      this.runInBackground(claimedGame.id, this.requireRunId(claimedGame));
    }
  }

  private requireRunId(game: StoredGameRecord): string {
    if (!game.runId) {
      throw new TournamentRunError("Tournament runner ownership is missing");
    }
    return game.runId;
  }
}
