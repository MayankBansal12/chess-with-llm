import { describe, expect, test } from "bun:test";
import { Chess } from "chess.js";
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
