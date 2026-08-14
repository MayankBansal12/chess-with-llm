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
import {
  type StoredGame,
  type StoredMove,
  type StoredStanding,
  TournamentStore,
} from "./tournament-store";
import type {
  TournamentGameSnapshot,
  TournamentGameSummary,
  TournamentGroup,
  TournamentResult,
  TournamentSnapshot,
  TournamentStanding,
} from "./tournament-types";

const DATABASE_PATH =
  process.env.TOURNAMENT_DATABASE_PATH ?? "./data/tournament.sqlite";

export class TournamentNotFoundError extends Error {}
export class TournamentRunError extends Error {}

const getTournamentStatus = (
  scheduledGames: number,
  hasActiveGame: boolean
): TournamentSnapshot["status"] => {
  if (scheduledGames === 0) {
    return "complete";
  }
  return hasActiveGame ? "live" : "ready";
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
  private readonly store: TournamentStore;
  private runningGameId: string | null = null;

  constructor(store = new TournamentStore(DATABASE_PATH)) {
    this.store = store;
    this.recoverInterruptedGame();
  }

  getTournament(): TournamentSnapshot {
    const storedGames = this.store.getGames();
    const games = storedGames.map((game) => this.toGameSummary(game));
    const standings = this.store.getStandings();
    const activeGame = games.find((game) => game.status === "active");
    const completedGames = games.filter(
      (game) => game.status === "completed"
    ).length;
    const scheduledGames = games.filter(
      (game) => game.status === "scheduled"
    ).length;

    return {
      activeGameId: activeGame?.id ?? null,
      completedGames,
      games,
      groups: {
        A: groupStandings(standings, "A"),
        B: groupStandings(standings, "B"),
      },
      id: TOURNAMENT_ID,
      name: TOURNAMENT_NAME,
      scheduledGames,
      status: getTournamentStatus(scheduledGames, Boolean(activeGame)),
    };
  }

  getGame(gameId: string, includeDiagnostics = false): TournamentGameSnapshot {
    const game = this.store.getGame(gameId);
    if (!game) {
      throw new TournamentNotFoundError("Tournament game not found");
    }
    const moves = this.store.getMoves(gameId);
    const modelTurns = this.store.getModelTurns(gameId);
    const chess = loadChess(game.pgn);
    return {
      ...this.toGameSummary(game, moves),
      fen: chess.fen(),
      modelTurns:
        process.env.NODE_ENV === "production" && !includeDiagnostics
          ? redactModelDiagnostics(modelTurns)
          : modelTurns,
      moves,
      pgn: game.pgn,
      revision: game.revision,
      turn: chess.turn(),
    };
  }

  startNextGame(): TournamentGameSnapshot {
    if (this.runningGameId) {
      throw new TournamentRunError("A tournament game is already running");
    }
    let game: StoredGame;
    try {
      game = this.store.startNextGame();
    } catch (error) {
      throw new TournamentRunError(
        error instanceof Error ? error.message : "Unable to start the game",
        { cause: error }
      );
    }
    this.runningGameId = game.id;
    this.runGame(game.id)
      .catch((error: unknown) => {
        this.completeAsError(game.id, error);
      })
      .finally(() => {
        if (this.runningGameId === game.id) {
          this.runningGameId = null;
        }
      });
    return this.getGame(game.id);
  }

  private toGameSummary(
    game: StoredGame,
    knownMoves?: StoredMove[]
  ): TournamentGameSummary {
    const moves = knownMoves ?? this.store.getMoves(game.id);
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
      lastMove: getLastMove(moves),
      metrics: {
        totalCostUsd: game.totalCostUsd,
        totalDurationMs: game.totalDurationMs,
        totalTokens: game.totalTokens,
      },
      moveCount: moves.length,
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

  private async runGame(gameId: string): Promise<void> {
    const storedGame = this.store.getGame(gameId);
    if (!storedGame) {
      throw new TournamentNotFoundError("Tournament game not found");
    }
    const chess = loadChess(storedGame.pgn);

    while (!chess.isGameOver()) {
      const color = chess.turn();
      const modelId =
        color === "w" ? storedGame.whiteModelId : storedGame.blackModelId;
      this.store.setThinkingModel(gameId, modelId);
      const turns: ModelTurnTrace[] = [];
      let modelResult: Awaited<ReturnType<typeof requestTournamentModelMove>>;
      try {
        // biome-ignore lint/performance/noAwaitInLoops: chess turns are intentionally sequential.
        modelResult = await requestTournamentModelMove({
          chess,
          color,
          modelId,
          turns,
        });
      } catch (error) {
        this.recordModelTurns(gameId, modelId, color, turns);
        this.store.recordUsage(gameId, getGameMetrics(turns));
        throw error;
      }
      if (!modelResult) {
        this.recordModelTurns(gameId, modelId, color, turns);
        this.store.recordUsage(gameId, getGameMetrics(turns));
        this.completeResignation(gameId, chess, color);
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
      this.store.recordModelTurn(gameId, modelId, color, modelResult.turn);
      const metrics = getGameMetrics([modelResult.turn]);
      this.store.recordMove(
        gameId,
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

    this.completeFromBoard(gameId, chess);
  }

  private recordModelTurns(
    gameId: string,
    modelId: string,
    color: "b" | "w",
    turns: ModelTurnTrace[]
  ): void {
    for (const turn of turns) {
      this.store.recordModelTurn(gameId, modelId, color, turn);
    }
  }

  private completeFromBoard(gameId: string, chess: Chess): void {
    if (!chess.isCheckmate()) {
      this.completeDraw(gameId, chess, "draw_by_rule", null);
      return;
    }
    const result: TournamentResult = chess.turn() === "b" ? "white" : "black";
    const game = this.store.getGame(gameId);
    if (!game) {
      throw new TournamentNotFoundError("Tournament game not found");
    }
    this.store.completeGame({
      ...calculateTournamentNr(chess, result),
      error: null,
      fen: chess.fen(),
      gameId,
      pgn: chess.pgn(),
      result,
      terminationReason: "checkmate",
      winnerModelId: result === "white" ? game.whiteModelId : game.blackModelId,
    });
  }

  private completeDraw(
    gameId: string,
    chess: Chess,
    terminationReason: string,
    error: string | null
  ): void {
    this.store.completeGame({
      ...calculateTournamentNr(chess, "draw", error !== null),
      error,
      fen: chess.fen(),
      gameId,
      pgn: chess.pgn(),
      result: "draw",
      terminationReason,
      winnerModelId: null,
    });
  }

  private completeResignation(
    gameId: string,
    chess: Chess,
    resigningColor: "b" | "w"
  ): void {
    const game = this.store.getGame(gameId);
    if (!game) {
      throw new TournamentNotFoundError("Tournament game not found");
    }
    const result: TournamentResult = resigningColor === "w" ? "black" : "white";
    this.store.completeGame({
      ...calculateTournamentNr(chess, result),
      error: null,
      fen: chess.fen(),
      gameId,
      pgn: chess.pgn(),
      result,
      terminationReason: "model_resignation",
      winnerModelId: result === "white" ? game.whiteModelId : game.blackModelId,
    });
  }

  private completeAsError(gameId: string, error: unknown): void {
    const game = this.store.getGame(gameId);
    if (!game || game.status === "completed") {
      return;
    }
    const chess = loadChess(game.pgn);
    this.completeDraw(
      gameId,
      chess,
      "model_request_error",
      error instanceof Error ? error.message : "The match could not continue"
    );
  }

  private recoverInterruptedGame(): void {
    const activeGame = this.store
      .getGames()
      .find((game) => game.status === "active");
    if (!activeGame) {
      return;
    }
    const chess = loadChess(activeGame.pgn);
    this.completeDraw(
      activeGame.id,
      chess,
      "server_restart",
      "The server restarted before the match completed"
    );
  }
}

export const tournamentService = new TournamentService();
