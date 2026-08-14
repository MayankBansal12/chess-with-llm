import { describe, expect, test } from "bun:test";
import {
  buildGroupSchedule,
  GROUP_MODEL_IDS,
  TOURNAMENT_GAME_LIMIT,
} from "./tournament-schedule";
import { TournamentStore } from "./tournament-store";

describe("tournament schedule", () => {
  test("creates two five-model groups and forty color-reversed games", () => {
    const games = buildGroupSchedule();

    expect(GROUP_MODEL_IDS.A).toHaveLength(5);
    expect(GROUP_MODEL_IDS.B).toHaveLength(5);
    expect(games).toHaveLength(40);
    expect(games.filter((game) => game.group === "A")).toHaveLength(20);
    expect(games.filter((game) => game.group === "B")).toHaveLength(20);

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

  test("places the Luna and DeepSeek Flash validation fixtures first", () => {
    const firstGames = buildGroupSchedule().slice(0, 2);

    expect(
      firstGames.map((game) => [game.whiteModelId, game.blackModelId])
    ).toEqual([
      ["gpt-5.6-luna", "deepseek-v4-flash"],
      ["deepseek-v4-flash", "gpt-5.6-luna"],
    ]);
  });
});

describe("tournament persistence", () => {
  test("scores draws and rejects a fourth started game", () => {
    const store = new TournamentStore(":memory:");
    try {
      for (let index = 0; index < TOURNAMENT_GAME_LIMIT; index += 1) {
        const game = store.startNextGame();
        store.completeGame({
          error: index === 0 ? "provider unavailable" : null,
          fen: "test-fen",
          gameId: game.id,
          pgn: "",
          result: "draw",
          terminationReason:
            index === 0 ? "model_request_error" : "draw_by_rule",
          winnerModelId: null,
        });
      }

      expect(() => store.startNextGame()).toThrow(
        `Initial testing is capped at ${TOURNAMENT_GAME_LIMIT} games`
      );
      const standings = store.getStandings();
      const luna = standings.find(
        (standing) => standing.modelId === "gpt-5.6-luna"
      );
      const deepSeek = standings.find(
        (standing) => standing.modelId === "deepseek-v4-flash"
      );
      expect(luna).toMatchObject({ draws: 3, played: 3, points: 15 });
      expect(deepSeek).toMatchObject({ draws: 2, played: 2, points: 10 });
      expect(
        store.getGames().find((game) => game.sequence === 1)
      ).toMatchObject({
        error: "provider unavailable",
        result: "draw",
        terminationReason: "model_request_error",
      });
    } finally {
      store.close();
    }
  });

  test("does not duplicate the deterministic schedule", () => {
    const store = new TournamentStore(":memory:");
    try {
      expect(store.getGames()).toHaveLength(40);
    } finally {
      store.close();
    }
  });

  test("rejects moves after a game has completed", () => {
    const store = new TournamentStore(":memory:");
    try {
      const game = store.startNextGame();
      store.completeGame({
        error: null,
        fen: "completed-fen",
        gameId: game.id,
        pgn: "",
        result: "draw",
        terminationReason: "draw_by_rule",
        winnerModelId: null,
      });

      expect(() =>
        store.recordMove(
          game.id,
          {
            color: "w",
            costUsd: 0,
            createdAt: Date.now(),
            durationMs: 1,
            fenAfter: "late-fen",
            message: "Late move",
            modelId: game.whiteModelId,
            ply: 1,
            san: "e4",
            tokens: 1,
            uci: "e2e4",
          },
          "1. e4",
          "late-fen"
        )
      ).toThrow("Tournament game is no longer active");
      expect(store.getMoves(game.id)).toHaveLength(0);
    } finally {
      store.close();
    }
  });
});
