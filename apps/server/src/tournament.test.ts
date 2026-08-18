import { describe, expect, test } from "bun:test";
import { Chess } from "chess.js";
import type { ModelTurnTrace } from "./chess-games";
import { calculateTournamentNr } from "./tournament-nr";
import { buildGroupSchedule, GROUP_MODEL_IDS } from "./tournament-schedule";
import { getTournamentStatus } from "./tournament-service";
import {
  type TournamentRedisConnection,
  TournamentStore,
} from "./tournament-store";

class MemoryRedis implements TournamentRedisConnection {
  private readonly values = new Map<string, string>();

  compareAndSet(
    key: string,
    expectedValue: string,
    nextValue: string
  ): Promise<boolean> {
    if (this.values.get(key) !== expectedValue) {
      return Promise.resolve(false);
    }
    this.values.set(key, nextValue);
    return Promise.resolve(true);
  }

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.values.get(key) ?? null);
  }

  mGet(keys: string[]): Promise<(string | null)[]> {
    return Promise.resolve(keys.map((key) => this.values.get(key) ?? null));
  }

  set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }

  setMany(entries: readonly (readonly [string, string])[]): Promise<void> {
    for (const [key, value] of entries) {
      this.values.set(key, value);
    }
    return Promise.resolve();
  }

  delete(key: string): void {
    this.values.delete(key);
  }

  read(key: string): string | undefined {
    return this.values.get(key);
  }
}

const createStore = async (
  redis = new MemoryRedis()
): Promise<{ redis: MemoryRedis; store: TournamentStore }> => {
  const store = new TournamentStore(redis);
  await store.initialize();
  return { redis, store };
};

const createTurn = (): ModelTurnTrace => ({
  acceptedMove: "e4",
  asciiBoard: "private board context",
  attempts: [
    {
      attempt: 1,
      candidate: "e2e4",
      contentTypes: ["thinking", "text"],
      diagnosis: "accepted",
      durationMs: 125,
      errorMessage: null,
      isLegal: true,
      outputTokenLimit: 1000,
      rawStopReason: "stop",
      reasoningCharacters: 42,
      request: "private position prompt",
      response: '{"move":"e2e4","message":"Center control."}',
      stopReason: "stop",
      usage: {
        cost: {
          cacheRead: 0,
          cacheWrite: 0,
          input: 0.001,
          output: 0.002,
          total: 0.003,
        },
        input: 100,
        output: 20,
        reasoning: 10,
        totalTokens: 120,
      },
    },
  ],
  decision: null,
  fen: "private-position-fen",
  id: "turn-1",
  kind: "move",
  message: "Center control.",
  pgn: "private-position-pgn",
  status: "accepted",
  systemPrompt: "private tournament system prompt",
});

describe("tournament schedule", () => {
  test("creates two four-model groups and twenty-four color-reversed games", () => {
    const games = buildGroupSchedule();

    expect(GROUP_MODEL_IDS.A).toHaveLength(4);
    expect(GROUP_MODEL_IDS.B).toHaveLength(4);
    expect(games).toHaveLength(24);
    expect(games.filter((game) => game.group === "A")).toHaveLength(12);
    expect(games.filter((game) => game.group === "B")).toHaveLength(12);

    for (const game of games) {
      expect(
        games.some(
          (reverseGame) =>
            reverseGame.group === game.group &&
            reverseGame.whiteModelId === game.blackModelId &&
            reverseGame.blackModelId === game.whiteModelId
        )
      ).toBe(true);
    }
  });

  test("interleaves groups and reverses colors in the return fixtures", () => {
    const games = buildGroupSchedule();

    expect(games.map(({ sequence }) => sequence)).toEqual(
      Array.from({ length: 24 }, (_, index) => index + 1)
    );
    expect(games.map(({ id }) => id)).toEqual(
      Array.from(
        { length: 24 },
        (_, index) => `group-game-${(index + 1).toString().padStart(2, "0")}`
      )
    );
    expect(
      games.every((game, index) => game.group === (index % 2 ? "B" : "A"))
    ).toBe(true);

    for (let index = 0; index < 12; index += 1) {
      const firstLegGame = games[index];
      const returnGame = games[index + 12];
      expect(returnGame).toMatchObject({
        blackModelId: firstLegGame?.whiteModelId,
        group: firstLegGame?.group,
        whiteModelId: firstLegGame?.blackModelId,
      });
    }
  });

  test("uses the eight-model roster with GLM 5.3 in Group B", () => {
    expect(GROUP_MODEL_IDS.A).toEqual([
      "gpt-5.6-luna",
      "minimax-m3",
      "deepseek-v4-flash",
      "qwen3.8-max",
    ]);
    expect(GROUP_MODEL_IDS.B).toEqual([
      "kimi-k3",
      "grok-4.5",
      "deepseek-v4-pro",
      "glm-5.3",
    ]);
    expect(GROUP_MODEL_IDS.B).toContain("deepseek-v4-pro");
    expect(GROUP_MODEL_IDS.B).not.toContain("qwen3.7-plus");
    expect(GROUP_MODEL_IDS.B).not.toContain("qwen3.7-max");
    expect(GROUP_MODEL_IDS.A).not.toContain("glm-5.2");
    expect(GROUP_MODEL_IDS.A).not.toContain("glm-5.1");
    expect(GROUP_MODEL_IDS.B).not.toContain("kimi-k2.6");
  });
});

describe("tournament status", () => {
  test("stays live while games are active after the schedule is exhausted", () => {
    expect(getTournamentStatus(0, 2)).toBe("live");
    expect(getTournamentStatus(0, 0)).toBe("complete");
    expect(getTournamentStatus(2, 0)).toBe("ready");
  });
});

describe("Redis tournament persistence", () => {
  test("seeds the schedule once", async () => {
    const { redis, store } = await createStore();
    expect(await store.getGames()).toHaveLength(24);

    const restartedStore = new TournamentStore(redis);
    await restartedStore.initialize();
    expect(await restartedStore.getGames()).toHaveLength(24);
  });

  test("stores prompts for debugging but redacts board context and reasoning", async () => {
    const { redis, store } = await createStore();
    const game = await store.startNextGame();
    await store.recordCompletedTurn(
      game.id,
      createTurn(),
      {
        color: "w",
        costUsd: 0.003,
        createdAt: Date.now(),
        durationMs: 125,
        fenAfter: "after-white",
        message: "Center control.",
        modelId: game.whiteModelId,
        ply: 1,
        san: "e4",
        tokens: 120,
        uci: "e2e4",
      },
      "1. e4",
      "after-white"
    );

    const [turn] = await store.getModelTurns(game.id);
    expect(turn?.attempts[0]?.response).toContain("Center control");
    expect(turn?.attempts[0]?.reasoningCharacters).toBe(42);
    expect(turn?.systemPrompt).toBe("private tournament system prompt");
    expect(turn?.asciiBoard).toBe("");
    expect(turn?.fen).toBe("");
    expect(turn?.pgn).toBe("");
    expect(turn?.attempts[0]?.request).toBe("private position prompt");

    const rawGame =
      redis.read(`tournament:open-weight-2026:v3:game:${game.id}`) ?? "";
    expect(rawGame).toContain("private tournament system prompt");
    expect(rawGame).toContain("private position prompt");
    expect(rawGame).not.toContain("private board context");
  });

  test("checkpoints moves and metrics for restart recovery", async () => {
    const { redis, store } = await createStore();
    const game = await store.startNextGame();
    await store.recordCompletedTurn(
      game.id,
      createTurn(),
      {
        color: "w",
        costUsd: 0.003,
        createdAt: Date.now(),
        durationMs: 125,
        fenAfter: "after-white",
        message: "Center control.",
        modelId: game.whiteModelId,
        ply: 1,
        san: "e4",
        tokens: 120,
        uci: "e2e4",
      },
      "1. e4",
      "after-white"
    );

    const restartedStore = new TournamentStore(redis);
    await restartedStore.initialize();
    expect(await restartedStore.getActiveGames()).toEqual([
      expect.objectContaining({
        id: game.id,
        pgn: "1. e4",
        status: "active",
        totalCostUsd: 0.003,
        totalDurationMs: 125,
        totalTokens: 120,
      }),
    ]);
    expect(await restartedStore.getMoves(game.id)).toHaveLength(1);
  });

  test("completes once and derives the leaderboard from results", async () => {
    const { store } = await createStore();
    const game = await store.startNextGame();
    const completion = {
      blackNr: -0.2,
      error: null,
      fen: "completed-fen",
      gameId: game.id,
      pgn: "1. e4",
      result: "white" as const,
      terminationReason: "checkmate",
      whiteNr: 0.2,
      winnerModelId: game.whiteModelId,
    };
    await store.completeGame(completion);
    await store.completeGame(completion);

    expect(await store.getActiveGames()).toHaveLength(0);
    expect(await store.getGame(game.id)).toMatchObject({
      result: "white",
      status: "completed",
    });
    expect(
      (await store.getStandings()).find(
        (standing) => standing.modelId === game.whiteModelId
      )
    ).toMatchObject({ played: 1, points: 10, wins: 1 });
  });

  test("uses NR as the first tiebreak after points", async () => {
    const { store } = await createStore();
    const game = await store.startNextGame();
    await store.completeGame({
      blackNr: 0.2,
      error: null,
      fen: "drawn-fen",
      gameId: game.id,
      pgn: "",
      result: "draw",
      terminationReason: "draw_by_rule",
      whiteNr: -0.2,
      winnerModelId: null,
    });

    const gameGroup = (await store.getStandings()).filter(
      (standing) => standing.group === game.group
    );
    expect(gameGroup[0]?.modelId).toBe(game.blackModelId);
  });

  test("starts multiple selected games while guarding duplicate starts", async () => {
    const { redis, store } = await createStore();
    const games = await store.getGames();
    const selectedGame = games.find((game) => game.sequence === 13);
    const secondGame = games.find((game) => game.sequence === 14);
    expect(selectedGame).toBeDefined();
    expect(secondGame).toBeDefined();
    if (!(selectedGame && secondGame)) {
      return;
    }
    await expect(store.startGame(selectedGame.id)).resolves.toMatchObject({
      id: selectedGame.id,
      status: "active",
    });
    await expect(store.startGame(secondGame.id)).resolves.toMatchObject({
      id: secondGame.id,
      status: "active",
    });
    await expect(store.startGame(selectedGame.id)).rejects.toThrow(
      "Tournament game has already started"
    );
    expect((await store.getActiveGames()).map((game) => game.id)).toEqual([
      selectedGame.id,
      secondGame.id,
    ]);
    const restartedStore = new TournamentStore(redis);
    await restartedStore.initialize();
    expect(
      (await restartedStore.getActiveGames()).map((game) => game.id)
    ).toEqual([selectedGame.id, secondGame.id]);
    await store.completeGame({
      blackNr: 0,
      error: null,
      fen: "completed-fen",
      gameId: selectedGame.id,
      pgn: "",
      result: "draw",
      terminationReason: "draw_by_rule",
      whiteNr: 0,
      winnerModelId: null,
    });
    expect((await store.getActiveGames()).map((game) => game.id)).toEqual([
      secondGame.id,
    ]);
    await expect(
      store.recordCompletedTurn(
        selectedGame.id,
        createTurn(),
        {
          color: "w",
          costUsd: 0,
          createdAt: Date.now(),
          durationMs: 1,
          fenAfter: "late-fen",
          message: "Late move",
          modelId: selectedGame.whiteModelId,
          ply: 1,
          san: "e4",
          tokens: 1,
          uci: "e2e4",
        },
        "1. e4",
        "late-fen"
      )
    ).rejects.toThrow("Tournament game is no longer active");
  });

  test("claims a fixture exactly once under concurrent starts", async () => {
    const { store } = await createStore();
    const [game] = await store.getGames();
    expect(game).toBeDefined();
    if (!game) {
      return;
    }

    const starts = await Promise.allSettled([
      store.startGame(game.id),
      store.startGame(game.id),
    ]);

    expect(starts.filter((start) => start.status === "fulfilled")).toHaveLength(
      1
    );
    expect(starts.filter((start) => start.status === "rejected")).toHaveLength(
      1
    );
    expect(await store.getActiveGames()).toHaveLength(1);
  });

  test("keeps both results when active games complete concurrently", async () => {
    const { store } = await createStore();
    const [firstGame, secondGame] = await store.getGames();
    expect(firstGame).toBeDefined();
    expect(secondGame).toBeDefined();
    if (!(firstGame && secondGame)) {
      return;
    }
    await Promise.all([
      store.startGame(firstGame.id),
      store.startGame(secondGame.id),
    ]);

    await Promise.all([
      store.completeGame({
        blackNr: -0.2,
        error: null,
        fen: "first-completed-fen",
        gameId: firstGame.id,
        pgn: "1. e4",
        result: "white",
        terminationReason: "checkmate",
        whiteNr: 0.2,
        winnerModelId: firstGame.whiteModelId,
      }),
      store.completeGame({
        blackNr: 0.2,
        error: null,
        fen: "second-completed-fen",
        gameId: secondGame.id,
        pgn: "1. d4",
        result: "black",
        terminationReason: "checkmate",
        whiteNr: -0.2,
        winnerModelId: secondGame.blackModelId,
      }),
    ]);

    expect(await store.getActiveGames()).toHaveLength(0);
    expect(
      (await store.getGames()).filter((game) => game.status === "completed")
    ).toHaveLength(2);
    expect(
      (await store.getStandings()).reduce(
        (playedGames, standing) => playedGames + standing.played,
        0
      )
    ).toBe(4);
  });
});

describe("tournament NR", () => {
  test("rewards wins and penalizes losses using the final material edge", () => {
    const chess = new Chess("4k3/8/8/8/8/8/8/3QK3 w - - 0 1");

    expect(calculateTournamentNr(chess, "white")).toEqual({
      blackNr: -1.231,
      whiteNr: 1.231,
    });
  });

  test("flips a draw's material edge at half scale", () => {
    const chess = new Chess("4k3/8/8/8/8/8/8/3QK3 w - - 0 1");

    expect(calculateTournamentNr(chess, "draw")).toEqual({
      blackNr: 0.115,
      whiteNr: -0.115,
    });
  });

  test("assigns zero NR to infrastructure draws", () => {
    const chess = new Chess("4k3/8/8/8/8/8/8/3QK3 w - - 0 1");

    expect(calculateTournamentNr(chess, "draw", true)).toEqual({
      blackNr: 0,
      whiteNr: 0,
    });
  });
});
