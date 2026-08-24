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
const CURRENT_SCHEDULE_VERSION = 5;
const STATE_KEY = `tournament:${TOURNAMENT_ID}:v${CURRENT_SCHEDULE_VERSION}:state`;
const gameKey = (gameId: string): string =>
  `tournament:${TOURNAMENT_ID}:v${CURRENT_SCHEDULE_VERSION}:game:${gameId}`;
const LEGACY_STATE_KEY = "tournament:state";
const legacyGameKey = (gameId: string): string => `tournament:game:${gameId}`;
const GROUP_GAME_IDS = new Set(buildGroupSchedule().map((game) => game.id));

export interface TournamentRedisConnection {
  compareAndSet: (
    key: string,
    expectedValue: string,
    nextValue: string
  ) => Promise<boolean>;
  compareAndSetMany: (
    key: string,
    expectedValue: string,
    nextValue: string,
    entries: readonly (readonly [string, string])[]
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
  runId?: string | null;
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
  runId: string;
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
  runId: null,
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

const createKnockoutGame = ({
  blackModelId,
  id,
  sequence,
  stage,
  whiteModelId,
}: {
  blackModelId: string;
  id: string;
  sequence: number;
  stage: "final" | "semifinal";
  whiteModelId: string;
}): StoredGameRecord => ({
  blackModelId,
  blackNr: 0,
  completedAt: null,
  error: null,
  fen: "start",
  group: null,
  id,
  modelTurns: [],
  moves: [],
  pgn: "",
  result: null,
  revision: 0,
  runId: null,
  schemaVersion: SCHEMA_VERSION,
  sequence,
  stage,
  startedAt: null,
  status: "scheduled",
  terminationReason: null,
  thinkingModelId: null,
  totalCostUsd: 0,
  totalDurationMs: 0,
  totalTokens: 0,
  whiteModelId,
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
    if (
      !GROUP_GAME_IDS.has(game.id) ||
      game.stage !== "group" ||
      game.status !== "completed"
    ) {
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
    request: attempt.request,
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
  systemPrompt: turn.systemPrompt,
});

const withSchemaVersion = (
  game: Omit<StoredGameRecord, "schemaVersion">
): StoredGameRecord => ({
  ...game,
  modelTurns: game.modelTurns.map(sanitizeModelTurn),
  schemaVersion: SCHEMA_VERSION,
});

const fixtureKey = (
  game: Pick<StoredGame, "blackModelId" | "group" | "whiteModelId">
): string => `${game.group}:${game.whiteModelId}:${game.blackModelId}`;

const pairingKey = (
  game: Pick<StoredGame, "blackModelId" | "group" | "whiteModelId">
): string =>
  `${game.group}:${[game.whiteModelId, game.blackModelId].sort().join(":")}`;

type SeedGame = TournamentSeed["games"][number];

const takeMatchingGame = (
  games: SeedGame[],
  key: string,
  getKey: (game: SeedGame) => string
): SeedGame | undefined => {
  const matchingIndex = games.findIndex((game) => getKey(game) === key);
  if (matchingIndex === -1) {
    return;
  }
  return games.splice(matchingIndex, 1)[0];
};

const mergeCompletedGames = (
  scheduledGames: StoredGameRecord[],
  seed: TournamentSeed | null
): StoredGameRecord[] => {
  if (!seed) {
    return scheduledGames;
  }
  const remainingCompletedGames = seed.games.filter(
    (game) =>
      game.status === "completed" && game.group && game.stage === "group"
  );
  const completedGameByScheduledId = new Map<string, SeedGame>();
  const remainingScheduledGames: StoredGameRecord[] = [];

  for (const scheduledGame of scheduledGames) {
    const completedGame = takeMatchingGame(
      remainingCompletedGames,
      fixtureKey(scheduledGame),
      fixtureKey
    );
    if (completedGame) {
      completedGameByScheduledId.set(scheduledGame.id, completedGame);
    } else {
      remainingScheduledGames.push(scheduledGame);
    }
  }

  for (const scheduledGame of remainingScheduledGames) {
    const completedGame = takeMatchingGame(
      remainingCompletedGames,
      pairingKey(scheduledGame),
      pairingKey
    );
    if (completedGame) {
      completedGameByScheduledId.set(scheduledGame.id, completedGame);
    }
  }

  return scheduledGames.map((scheduledGame) => {
    const completedGame = completedGameByScheduledId.get(scheduledGame.id);
    if (!completedGame) {
      return scheduledGame;
    }
    return {
      ...withSchemaVersion(completedGame),
      group: scheduledGame.group,
      id: scheduledGame.id,
      sequence: scheduledGame.sequence,
      stage: "group",
    };
  });
};

export class TournamentStore {
  private readonly redis: TournamentRedisConnection;

  constructor(redis: TournamentRedisConnection) {
    this.redis = redis;
  }

  async initialize(loadSeed?: TournamentSeedLoader): Promise<void> {
    const existingState = await this.getState();
    if (!existingState) {
      const legacyRedisSeed = await this.loadLegacyRedisSeed();
      await this.seed(legacyRedisSeed ?? loadSeed?.() ?? null);
    }
    await this.advanceKnockoutStage();
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
      runId: crypto.randomUUID(),
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

  resumeGame(gameId: string): Promise<StoredGameRecord> {
    return this.claimGame(gameId, "paused");
  }

  async resetDrawnKnockoutGame(gameId: string): Promise<StoredGameRecord> {
    const storedGame = await this.redis.get(gameKey(gameId));
    const game = parseDocument<StoredGameRecord>(
      storedGame,
      `tournament game ${gameId}`
    );
    if (!game) {
      throw new Error("Tournament game not found");
    }
    if (
      game.stage === "group" ||
      game.status !== "completed" ||
      game.result !== "draw"
    ) {
      throw new Error("Only a drawn knockout match can be restarted");
    }
    const resetGame: StoredGameRecord = {
      ...createKnockoutGame({
        blackModelId: game.blackModelId,
        id: game.id,
        sequence: game.sequence,
        stage: game.stage,
        whiteModelId: game.whiteModelId,
      }),
      revision: game.revision + 1,
    };
    const didReset = await this.redis.compareAndSet(
      gameKey(gameId),
      storedGame ?? "",
      serialize(resetGame)
    );
    if (!didReset) {
      throw new Error("Tournament game changed before it could be restarted");
    }
    return resetGame;
  }

  claimActiveGame(gameId: string): Promise<StoredGameRecord> {
    return this.claimGame(gameId, "active");
  }

  async setThinkingModel(
    gameId: string,
    runId: string,
    modelId: string | null
  ): Promise<void> {
    await this.updateOwnedGame(gameId, runId, (game) => ({
      ...game,
      revision: game.revision + 1,
      thinkingModelId: modelId,
    }));
  }

  async recordCompletedTurn(
    gameId: string,
    runId: string,
    turn: ModelTurnTrace,
    move: StoredMove,
    pgn: string,
    fen: string
  ): Promise<void> {
    await this.updateOwnedGame(gameId, runId, (game) => ({
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
    }));
  }

  async recordFailedTurns(
    gameId: string,
    runId: string,
    turns: ModelTurnTrace[],
    metrics: GameMetrics
  ): Promise<void> {
    await this.updateOwnedGame(gameId, runId, (game) => ({
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
    }));
  }

  async pauseGame(gameId: string, runId: string, error: string): Promise<void> {
    await this.updateOwnedGame(gameId, runId, (game) => ({
      ...game,
      error,
      revision: game.revision + 1,
      runId: null,
      status: "paused",
      thinkingModelId: null,
    }));
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
    if (game.status !== "active" || game.runId !== input.runId) {
      throw new TournamentOwnershipError();
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
      runId: null,
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
      return;
    }
    await this.advanceKnockoutStage();
  }

  private async advanceKnockoutStage(): Promise<void> {
    const storedState = await this.redis.get(STATE_KEY);
    const state = parseDocument<TournamentState>(
      storedState,
      "tournament state"
    );
    if (!state) {
      return;
    }
    const games = await this.getGames();
    const semifinalGames = games.filter((game) => game.stage === "semifinal");
    let newGames: StoredGameRecord[] = [];

    if (semifinalGames.length === 0) {
      const groupGames = games.filter((game) => game.stage === "group");
      if (
        groupGames.length === buildGroupSchedule().length &&
        groupGames.every((game) => game.status === "completed")
      ) {
        const standings = buildStandings(groupGames);
        const groupA = standings.filter((standing) => standing.group === "A");
        const groupB = standings.filter((standing) => standing.group === "B");
        const [groupAFirst, groupASecond] = groupA;
        const [groupBFirst, groupBSecond] = groupB;
        if (groupAFirst && groupASecond && groupBFirst && groupBSecond) {
          newGames = [
            createKnockoutGame({
              blackModelId: groupBSecond.modelId,
              id: "semifinal-1",
              sequence: 25,
              stage: "semifinal",
              whiteModelId: groupAFirst.modelId,
            }),
            createKnockoutGame({
              blackModelId: groupASecond.modelId,
              id: "semifinal-2",
              sequence: 26,
              stage: "semifinal",
              whiteModelId: groupBFirst.modelId,
            }),
          ];
        }
      }
    } else if (
      semifinalGames.length === 2 &&
      !games.some((game) => game.stage === "final") &&
      semifinalGames.every(
        (game) => game.status === "completed" && game.winnerModelId
      )
    ) {
      const [semifinalOne, semifinalTwo] = semifinalGames.sort(
        (first, second) => first.sequence - second.sequence
      );
      if (semifinalOne?.winnerModelId && semifinalTwo?.winnerModelId) {
        newGames = [
          createKnockoutGame({
            blackModelId: semifinalTwo.winnerModelId,
            id: "final",
            sequence: 27,
            stage: "final",
            whiteModelId: semifinalOne.winnerModelId,
          }),
        ];
      }
    }

    if (newGames.length === 0) {
      return;
    }
    const nextState: TournamentState = {
      ...state,
      gameIds: [...state.gameIds, ...newGames.map((game) => game.id)],
    };
    const didAdvance = await this.redis.compareAndSetMany(
      STATE_KEY,
      storedState ?? "",
      serialize(nextState),
      newGames.map((game) => [gameKey(game.id), serialize(game)] as const)
    );
    if (!didAdvance) {
      await this.advanceKnockoutStage();
    }
  }

  private async seed(seed: TournamentSeed | null = null): Promise<void> {
    const records = mergeCompletedGames(
      buildGroupSchedule().map(createScheduledGame),
      seed
    );
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

  private async loadLegacyRedisSeed(): Promise<TournamentSeed | null> {
    const state = parseDocument<TournamentState>(
      await this.redis.get(LEGACY_STATE_KEY),
      "legacy tournament state"
    );
    if (!state) {
      return null;
    }
    const values = await this.redis.mGet(state.gameIds.map(legacyGameKey));
    const games = values.map((value, index) => {
      const gameId = state.gameIds[index] ?? "unknown";
      const game = parseDocument<StoredGameRecord>(
        value,
        `legacy tournament game ${gameId}`
      );
      if (!game) {
        throw new Error(
          `Legacy tournament game ${gameId} is missing from Redis`
        );
      }
      return game;
    });
    return { createdAt: state.createdAt, games };
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

  private async claimGame(
    gameId: string,
    expectedStatus: "active" | "paused"
  ): Promise<StoredGameRecord> {
    const storedGame = await this.redis.get(gameKey(gameId));
    const game = parseDocument<StoredGameRecord>(
      storedGame,
      `tournament game ${gameId}`
    );
    if (!game) {
      throw new Error("Tournament game not found");
    }
    if (game.status !== expectedStatus) {
      throw new Error(
        expectedStatus === "paused"
          ? "Tournament game is not paused"
          : "Tournament game is no longer active"
      );
    }
    const claimedGame: StoredGameRecord = {
      ...game,
      error: expectedStatus === "paused" ? null : game.error,
      revision: game.revision + 1,
      runId: crypto.randomUUID(),
      status: "active",
      thinkingModelId: null,
    };
    const didClaim = await this.redis.compareAndSet(
      gameKey(gameId),
      storedGame ?? "",
      serialize(claimedGame)
    );
    if (!didClaim) {
      return this.claimGame(gameId, expectedStatus);
    }
    return claimedGame;
  }

  private async updateOwnedGame(
    gameId: string,
    runId: string,
    update: (game: StoredGameRecord) => StoredGameRecord
  ): Promise<StoredGameRecord> {
    const storedGame = await this.redis.get(gameKey(gameId));
    const game = parseDocument<StoredGameRecord>(
      storedGame,
      `tournament game ${gameId}`
    );
    if (game?.status !== "active" || game.runId !== runId) {
      throw new TournamentOwnershipError();
    }
    const nextGame = update(game);
    const didUpdate = await this.redis.compareAndSet(
      gameKey(gameId),
      storedGame ?? "",
      serialize(nextGame)
    );
    if (!didUpdate) {
      return this.updateOwnedGame(gameId, runId, update);
    }
    return nextGame;
  }
}

export class TournamentOwnershipError extends Error {
  constructor() {
    super("Tournament runner lost ownership");
  }
}
