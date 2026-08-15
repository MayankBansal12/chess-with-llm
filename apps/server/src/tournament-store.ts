import type { GameMetrics, ModelTurnTrace } from "./chess-games";
import {
  buildGroupSchedule,
  DRAW_POINTS,
  GROUP_MODEL_IDS,
  TOURNAMENT_ID,
  TOURNAMENT_NAME,
  WIN_POINTS,
} from "./tournament-schedule";
import type {
  TournamentGameStatus,
  TournamentGroup,
  TournamentResult,
} from "./tournament-types";

const SCHEMA_VERSION = 1;
const REDACTED_PROMPT = "[not stored]";
const CURRENT_SCHEDULE_VERSION = 2;
const STATE_KEY = "tournament:state";
const gameKey = (gameId: string): string => `tournament:game:${gameId}`;

export interface TournamentRedisConnection {
  compareAndSet: (
    key: string,
    expectedValue: string,
    nextValue: string
  ) => Promise<boolean>;
  get: (key: string) => Promise<string | null>;
  mGet: (keys: string[]) => Promise<(string | null)[]>;
  set: (key: string, value: string) => Promise<void>;
  setMany: (entries: readonly (readonly [string, string])[]) => Promise<void>;
}

export interface StoredGame {
  blackModelId: string;
  blackNr: number;
  completedAt: number | null;
  error: string | null;
  fen: string;
  group: TournamentGroup | null;
  id: string;
  pgn: string;
  result: TournamentResult | null;
  revision: number;
  sequence: number;
  stage: "final" | "group" | "semifinal";
  startedAt: number | null;
  status: TournamentGameStatus;
  terminationReason: string | null;
  thinkingModelId: string | null;
  totalCostUsd: number;
  totalDurationMs: number;
  totalTokens: number;
  whiteModelId: string;
  whiteNr: number;
  winnerModelId: string | null;
}

export interface StoredMove {
  color: "b" | "w";
  costUsd: number;
  createdAt: number;
  durationMs: number;
  fenAfter: string;
  message: string;
  modelId: string;
  ply: number;
  san: string;
  tokens: number;
  uci: string;
}

export interface StoredStanding {
  draws: number;
  group: TournamentGroup;
  losses: number;
  modelId: string;
  nr: number;
  played: number;
  points: number;
  seed: number;
  wins: number;
}

export interface StoredGameRecord extends StoredGame {
  modelTurns: ModelTurnTrace[];
  moves: StoredMove[];
  schemaVersion: typeof SCHEMA_VERSION;
}

interface TournamentState {
  createdAt: number;
  gameIds: string[];
  name: string;
  scheduleVersion: number;
  schemaVersion: typeof SCHEMA_VERSION;
  tournamentId: string;
}

export interface TournamentSeed {
  createdAt?: number;
  games: Omit<StoredGameRecord, "schemaVersion">[];
}

export type TournamentSeedLoader = () => TournamentSeed | null;

export interface CompleteGameInput {
  blackNr: number;
  error: string | null;
  fen: string;
  gameId: string;
  pgn: string;
  result: TournamentResult;
  terminationReason: string;
  whiteNr: number;
  winnerModelId: string | null;
}

const parseDocument = <Document>(
  value: string | null,
  documentName: string
): Document | null => {
  if (value === null) {
    return null;
  }
  try {
    const document = JSON.parse(value) as { schemaVersion?: unknown };
    if (document.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`${documentName} has an unsupported schema version`);
    }
    return document as Document;
  } catch (error) {
    throw new Error(`Unable to read ${documentName} from Redis`, {
      cause: error,
    });
  }
};

const serialize = (value: unknown): string => JSON.stringify(value);

const createScheduledGame = (
  game: ReturnType<typeof buildGroupSchedule>[number]
): StoredGameRecord => ({
  blackModelId: game.blackModelId,
  blackNr: 0,
  completedAt: null,
  error: null,
  fen: "start",
  group: game.group,
  id: game.id,
  modelTurns: [],
  moves: [],
  pgn: "",
  result: null,
  revision: 0,
  schemaVersion: SCHEMA_VERSION,
  sequence: game.sequence,
  stage: "group",
  startedAt: null,
  status: "scheduled",
  terminationReason: null,
  thinkingModelId: null,
  totalCostUsd: 0,
  totalDurationMs: 0,
  totalTokens: 0,
  whiteModelId: game.whiteModelId,
  whiteNr: 0,
  winnerModelId: null,
});

const emptyStandings = (): StoredStanding[] => {
  const standings: StoredStanding[] = [];
  for (const group of ["A", "B"] as const) {
    for (const [index, modelId] of GROUP_MODEL_IDS[group].entries()) {
      standings.push({
        draws: 0,
        group,
        losses: 0,
        modelId,
        nr: 0,
        played: 0,
        points: 0,
        seed: index + 1,
        wins: 0,
      });
    }
  }
  return standings;
};

const sortStandings = (standings: StoredStanding[]): StoredStanding[] =>
  standings.sort((first, second) => {
    const groupOrder = first.group.localeCompare(second.group);
    if (groupOrder !== 0) {
      return groupOrder;
    }
    return (
      second.points - first.points ||
      second.nr - first.nr ||
      second.wins - first.wins ||
      first.seed - second.seed
    );
  });

export const buildStandings = (
  games: readonly StoredGame[]
): StoredStanding[] => {
  const standings = emptyStandings();
  const byModelId = new Map(
    standings.map((standing) => [standing.modelId, standing])
  );
  for (const game of games) {
    if (game.status !== "completed") {
      continue;
    }
    const white = byModelId.get(game.whiteModelId);
    const black = byModelId.get(game.blackModelId);
    if (!(white && black && game.result)) {
      continue;
    }
    white.played += 1;
    black.played += 1;
    white.nr += game.whiteNr;
    black.nr += game.blackNr;
    if (game.result === "draw") {
      white.draws += 1;
      black.draws += 1;
      white.points += DRAW_POINTS;
      black.points += DRAW_POINTS;
      continue;
    }
    const winner = game.result === "white" ? white : black;
    const loser = game.result === "white" ? black : white;
    winner.wins += 1;
    winner.points += WIN_POINTS;
    loser.losses += 1;
  }
  return sortStandings(standings);
};

const sanitizeModelTurn = (turn: ModelTurnTrace): ModelTurnTrace => ({
  acceptedMove: turn.acceptedMove,
  asciiBoard: "",
  attempts: turn.attempts.map((attempt) => ({
    attempt: attempt.attempt,
    candidate: attempt.candidate,
    contentTypes: [...attempt.contentTypes],
    diagnosis: attempt.diagnosis,
    durationMs: attempt.durationMs,
    errorMessage: attempt.errorMessage,
    isLegal: attempt.isLegal,
    outputTokenLimit: attempt.outputTokenLimit,
    rawStopReason: attempt.rawStopReason,
    reasoningCharacters: attempt.reasoningCharacters,
    request: REDACTED_PROMPT,
    response: attempt.response,
    stopReason: attempt.stopReason,
    usage: {
      cost: {
        cacheRead: attempt.usage.cost.cacheRead,
        cacheWrite: attempt.usage.cost.cacheWrite,
        input: attempt.usage.cost.input,
        output: attempt.usage.cost.output,
        total: attempt.usage.cost.total,
      },
      input: attempt.usage.input,
      output: attempt.usage.output,
      reasoning: attempt.usage.reasoning,
      totalTokens: attempt.usage.totalTokens,
    },
  })),
  decision: turn.decision,
  fen: "",
  id: turn.id,
  kind: turn.kind,
  message: turn.message,
  pgn: "",
  status: turn.status,
  systemPrompt: REDACTED_PROMPT,
});

const withSchemaVersion = (
  game: Omit<StoredGameRecord, "schemaVersion">
): StoredGameRecord => ({
  ...game,
  modelTurns: game.modelTurns.map(sanitizeModelTurn),
  schemaVersion: SCHEMA_VERSION,
});

export class TournamentStore {
  private readonly redis: TournamentRedisConnection;

  constructor(redis: TournamentRedisConnection) {
    this.redis = redis;
  }

  async initialize(loadSeed?: TournamentSeedLoader): Promise<void> {
    const existingState = await this.getState();
    if (!existingState) {
      await this.seed(loadSeed?.() ?? null);
    }
  }

  async getGames(): Promise<StoredGameRecord[]> {
    const state = await this.requireState();
    const values = await this.redis.mGet(state.gameIds.map(gameKey));
    const games = values.map((value, index) => {
      const gameId = state.gameIds[index] ?? "unknown";
      const game = parseDocument<StoredGameRecord>(
        value,
        `tournament game ${gameId}`
      );
      if (!game) {
        throw new Error(`Tournament game ${gameId} is missing from Redis`);
      }
      return game;
    });
    return games.sort((first, second) => first.sequence - second.sequence);
  }

  async getGame(gameId: string): Promise<StoredGameRecord | null> {
    return parseDocument<StoredGameRecord>(
      await this.redis.get(gameKey(gameId)),
      `tournament game ${gameId}`
    );
  }

  async getMoves(gameId: string): Promise<StoredMove[]> {
    const game = await this.getGame(gameId);
    return game ? game.moves : [];
  }

  async getModelTurns(gameId: string): Promise<ModelTurnTrace[]> {
    const game = await this.getGame(gameId);
    return game ? game.modelTurns : [];
  }

  async getStandings(): Promise<StoredStanding[]> {
    return buildStandings(await this.getGames());
  }

  async getActiveGames(): Promise<StoredGameRecord[]> {
    return (await this.getGames()).filter((game) => game.status === "active");
  }

  async startNextGame(): Promise<StoredGameRecord> {
    const scheduledGames = (await this.getGames()).filter(
      (game) => game.status === "scheduled"
    );
    for (const game of scheduledGames) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: concurrent callers may claim earlier fixtures first.
        return await this.startGame(game.id);
      } catch (error) {
        const currentGame = await this.getGame(game.id);
        if (!currentGame || currentGame.status === "scheduled") {
          throw error;
        }
      }
    }
    throw new Error("No scheduled tournament games remain");
  }

  async startGame(gameId: string): Promise<StoredGameRecord> {
    const storedGame = await this.redis.get(gameKey(gameId));
    const game = parseDocument<StoredGameRecord>(
      storedGame,
      `tournament game ${gameId}`
    );
    if (!game) {
      throw new Error("Tournament game not found");
    }
    if (game.status !== "scheduled") {
      throw new Error("Tournament game has already started");
    }
    const activeGame: StoredGameRecord = {
      ...game,
      revision: game.revision + 1,
      startedAt: Date.now(),
      status: "active",
    };
    const didStart = await this.redis.compareAndSet(
      gameKey(gameId),
      storedGame ?? "",
      serialize(activeGame)
    );
    if (!didStart) {
      throw new Error("Tournament game has already started");
    }
    return activeGame;
  }

  async setThinkingModel(
    gameId: string,
    modelId: string | null
  ): Promise<void> {
    const game = await this.requireActiveGame(gameId);
    await this.redis.set(
      gameKey(gameId),
      serialize({
        ...game,
        revision: game.revision + 1,
        thinkingModelId: modelId,
      })
    );
  }

  async recordCompletedTurn(
    gameId: string,
    turn: ModelTurnTrace,
    move: StoredMove,
    pgn: string,
    fen: string
  ): Promise<void> {
    const game = await this.requireActiveGame(gameId);
    const nextGame: StoredGameRecord = {
      ...game,
      fen,
      modelTurns: [...game.modelTurns, sanitizeModelTurn(turn)],
      moves: [...game.moves, move],
      pgn,
      revision: game.revision + 1,
      thinkingModelId: null,
      totalCostUsd: game.totalCostUsd + move.costUsd,
      totalDurationMs: game.totalDurationMs + move.durationMs,
      totalTokens: game.totalTokens + move.tokens,
    };
    await this.redis.set(gameKey(gameId), serialize(nextGame));
  }

  async recordFailedTurns(
    gameId: string,
    turns: ModelTurnTrace[],
    metrics: GameMetrics
  ): Promise<void> {
    const game = await this.requireActiveGame(gameId);
    const nextGame: StoredGameRecord = {
      ...game,
      modelTurns: [
        ...game.modelTurns,
        ...turns.map((turn) => sanitizeModelTurn(turn)),
      ],
      revision: game.revision + 1,
      thinkingModelId: null,
      totalCostUsd: game.totalCostUsd + metrics.totalCostUsd,
      totalDurationMs: game.totalDurationMs + metrics.totalDurationMs,
      totalTokens: game.totalTokens + metrics.totalTokens,
    };
    await this.redis.set(gameKey(gameId), serialize(nextGame));
  }

  async completeGame(input: CompleteGameInput): Promise<void> {
    const storedGame = await this.redis.get(gameKey(input.gameId));
    const game = parseDocument<StoredGameRecord>(
      storedGame,
      `tournament game ${input.gameId}`
    );
    if (!game || game.status === "completed") {
      return;
    }
    const completedGame: StoredGameRecord = {
      ...game,
      blackNr: input.blackNr,
      completedAt: Date.now(),
      error: input.error,
      fen: input.fen,
      pgn: input.pgn,
      result: input.result,
      revision: game.revision + 1,
      status: "completed",
      terminationReason: input.terminationReason,
      thinkingModelId: null,
      whiteNr: input.whiteNr,
      winnerModelId: input.winnerModelId,
    };
    const didComplete = await this.redis.compareAndSet(
      gameKey(input.gameId),
      storedGame ?? "",
      serialize(completedGame)
    );
    if (!didComplete) {
      await this.completeGame(input);
    }
  }

  private async seed(seed: TournamentSeed | null = null): Promise<void> {
    const records = seed
      ? seed.games.map(withSchemaVersion)
      : buildGroupSchedule().map(createScheduledGame);
    const state: TournamentState = {
      createdAt: seed?.createdAt ?? Date.now(),
      gameIds: records
        .sort((first, second) => first.sequence - second.sequence)
        .map((game) => game.id),
      name: TOURNAMENT_NAME,
      scheduleVersion: CURRENT_SCHEDULE_VERSION,
      schemaVersion: SCHEMA_VERSION,
      tournamentId: TOURNAMENT_ID,
    };
    await this.redis.setMany([
      [STATE_KEY, serialize(state)],
      ...records.map((game) => [gameKey(game.id), serialize(game)] as const),
    ]);
  }

  private async getState(): Promise<TournamentState | null> {
    return parseDocument<TournamentState>(
      await this.redis.get(STATE_KEY),
      "tournament state"
    );
  }

  private async requireState(): Promise<TournamentState> {
    const state = await this.getState();
    if (!state) {
      throw new Error("Tournament state is missing from Redis");
    }
    return state;
  }

  private async requireActiveGame(gameId: string): Promise<StoredGameRecord> {
    const game = await this.getGame(gameId);
    if (game?.status !== "active") {
      throw new Error("Tournament game is no longer active");
    }
    return game;
  }
}
