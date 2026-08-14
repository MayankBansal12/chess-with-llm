import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Chess } from "chess.js";
import type { ModelTurnTrace } from "./chess-games";
import { calculateTournamentNr } from "./tournament-nr";
import { buildGroupSchedule, GROUP_MODEL_IDS } from "./tournament-schedule";
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

  test("uses DeepSeek V4 Pro instead of Qwen 3.7 Plus", () => {
    expect(GROUP_MODEL_IDS.B).toContain("deepseek-v4-pro");
    expect(GROUP_MODEL_IDS.B).not.toContain("qwen3.7-plus");
  });
});

describe("tournament persistence", () => {
  test("persists complete LLM turn diagnostics for tournament games", () => {
    const store = new TournamentStore(":memory:");
    try {
      const game = store.startNextGame();
      const turn: ModelTurnTrace = {
        acceptedMove: "e4",
        asciiBoard: "board",
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
            request: "position prompt",
            response: '{"move":"e2e4"}',
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
        fen: "position-fen",
        id: "turn-1",
        kind: "move",
        message: "I played e4.",
        pgn: "",
        status: "accepted",
        systemPrompt: "tournament system prompt",
      };

      store.recordModelTurn(game.id, game.whiteModelId, "w", turn);

      expect(store.getModelTurns(game.id)).toEqual([turn]);
    } finally {
      store.close();
    }
  });

  test("migrates the retired Qwen standing and fixtures to DeepSeek Pro", () => {
    const directory = mkdtempSync(join(tmpdir(), "tournament-migration-"));
    const databasePath = join(directory, "tournament.sqlite");

    try {
      new TournamentStore(databasePath).close();
      const legacyDatabase = new Database(databasePath);
      legacyDatabase
        .query(
          "UPDATE standings SET model_id = 'qwen3.7-plus' WHERE model_id = 'deepseek-v4-pro'"
        )
        .run();
      legacyDatabase
        .query(`
          INSERT INTO standings (tournament_id, model_id, group_name, seed)
          VALUES ('open-weight-2026', 'deepseek-v4-pro', 'B', 3)
        `)
        .run();
      legacyDatabase
        .query(
          "UPDATE tournament_games SET white_model_id = 'qwen3.7-plus' WHERE white_model_id = 'deepseek-v4-pro'"
        )
        .run();
      legacyDatabase
        .query(
          "UPDATE tournament_games SET black_model_id = 'qwen3.7-plus' WHERE black_model_id = 'deepseek-v4-pro'"
        )
        .run();
      legacyDatabase.close();

      const migratedStore = new TournamentStore(databasePath);
      try {
        const groupB = migratedStore
          .getStandings()
          .filter((standing) => standing.group === "B");
        expect(groupB).toHaveLength(5);
        expect(groupB.map(({ modelId }) => modelId)).toContain(
          "deepseek-v4-pro"
        );
        expect(groupB.map(({ modelId }) => modelId)).not.toContain(
          "qwen3.7-plus"
        );
        expect(
          migratedStore
            .getGames()
            .some(
              (game) =>
                game.whiteModelId === "qwen3.7-plus" ||
                game.blackModelId === "qwen3.7-plus"
            )
        ).toBe(false);
        expect(
          migratedStore
            .getGames()
            .filter(
              (game) =>
                game.whiteModelId === "deepseek-v4-pro" ||
                game.blackModelId === "deepseek-v4-pro"
            )
        ).toHaveLength(8);
      } finally {
        migratedStore.close();
      }
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  test("scores draws and allows the full schedule to continue", () => {
    const store = new TournamentStore(":memory:");
    try {
      for (let index = 0; index < 4; index += 1) {
        const game = store.startNextGame();
        store.completeGame({
          blackNr: index === 0 ? 0 : 0.1,
          error: index === 0 ? "provider unavailable" : null,
          fen: "test-fen",
          gameId: game.id,
          pgn: "",
          result: "draw",
          terminationReason:
            index === 0 ? "model_request_error" : "draw_by_rule",
          whiteNr: index === 0 ? 0 : -0.1,
          winnerModelId: null,
        });
      }

      expect(store.startNextGame().sequence).toBe(5);
      const standings = store.getStandings();
      const luna = standings.find(
        (standing) => standing.modelId === "gpt-5.6-luna"
      );
      const deepSeek = standings.find(
        (standing) => standing.modelId === "deepseek-v4-flash"
      );
      expect(luna).toMatchObject({
        draws: 4,
        nr: 0.1,
        played: 4,
        points: 20,
      });
      expect(deepSeek).toMatchObject({
        draws: 2,
        nr: -0.1,
        played: 2,
        points: 10,
      });
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

  test("uses NR as the first tiebreak after points", () => {
    const store = new TournamentStore(":memory:");
    try {
      const game = store.startNextGame();
      store.completeGame({
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

      const groupA = store
        .getStandings()
        .filter((standing) => standing.group === "A");
      expect(groupA[0]?.modelId).toBe("deepseek-v4-flash");
      expect(groupA[1]?.modelId).toBe("gpt-5.6-luna");
    } finally {
      store.close();
    }
  });

  test("rejects moves after a game has completed", () => {
    const store = new TournamentStore(":memory:");
    try {
      const game = store.startNextGame();
      store.completeGame({
        blackNr: 0,
        error: null,
        fen: "completed-fen",
        gameId: game.id,
        pgn: "",
        result: "draw",
        terminationReason: "draw_by_rule",
        whiteNr: 0,
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

  test("totals token and cost usage from both tournament models", () => {
    const store = new TournamentStore(":memory:");
    try {
      const game = store.startNextGame();
      store.recordMove(
        game.id,
        {
          color: "w",
          costUsd: 0.01,
          createdAt: Date.now(),
          durationMs: 1000,
          fenAfter: "after-white",
          message: "White move",
          modelId: game.whiteModelId,
          ply: 1,
          san: "e4",
          tokens: 100,
          uci: "e2e4",
        },
        "1. e4",
        "after-white"
      );
      store.recordMove(
        game.id,
        {
          color: "b",
          costUsd: 0.025,
          createdAt: Date.now(),
          durationMs: 2000,
          fenAfter: "after-black",
          message: "Black move",
          modelId: game.blackModelId,
          ply: 2,
          san: "e5",
          tokens: 250,
          uci: "e7e5",
        },
        "1. e4 e5",
        "after-black"
      );

      expect(store.getGame(game.id)).toMatchObject({
        totalCostUsd: 0.035,
        totalDurationMs: 3000,
        totalTokens: 350,
      });
    } finally {
      store.close();
    }
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
