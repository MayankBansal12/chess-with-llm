import { describe, expect, test } from "bun:test";
import { Chess } from "chess.js";
import {
  describeChessModel,
  diagnoseModelAttempt,
  findLegalModelMove,
  getChessModelById,
  getChessModels,
  getGameMetrics,
  getModelAttemptDisposition,
  type ModelResponseDetails,
  type ModelTurnTrace,
  normalizeModelName,
  redactModelDiagnostics,
} from "./chess-games";

describe("model presentation", () => {
  test("removes provider usage labels from display names", () => {
    expect(normalizeModelName("MiniMax M3 (2x usage)")).toBe("MiniMax M3");
    expect(normalizeModelName("Kimi K2.5 (Free)")).toBe("Kimi K2.5");
    expect(normalizeModelName("DeepSeek V4 Pro")).toBe("DeepSeek V4 Pro");
    expect(normalizeModelName("DeepSeek V4 Pro (New)")).toBe("DeepSeek V4 Pro");
  });

  test("describes retired models that still appear in stored games", () => {
    expect(describeChessModel("grok-4.5")).toEqual({
      description: "Retired from opencode Go",
      id: "grok-4.5",
      logoUrl: "https://grok.com/images/favicon.svg",
      name: "Grok 4.5",
    });
    expect(describeChessModel("gpt-5.6-luna").name).toBe("GPT-5.6 Luna");
    expect(() => getChessModelById("grok-4.5")).toThrow(
      "That model is not currently available"
    );
  });

  test("orders the roster, applies descriptions, and hides unavailable models", () => {
    const models = getChessModels();

    expect(models.map(({ id }) => id)).toEqual([
      "gpt-6-luna",
      "claude-haiku-5-5",
      "gpt-5.6-luna",
      "grok-4.7",
      "grok-4.6",
      "glm-5.3-flash",
      "qwen3.8-flash",
      "glm-5.3",
      "space-bunny",
      "muse-spark-1.3-contributor",
      "kimi-k3",
      "minimax-m3",
      "deepseek-v4.1-flash",
      "deepseek-v4-flash",
      "qwen3.8-max",
      "qwen3.7-plus",
      "deepseek-v4-pro",
      "muse-spark-1.2-contributor",
      "longcat-2.5-preview-free",
      "mimo-v2.6-pro",
      "mimo-v2.6-flash",
      "hy4-preview",
    ]);
    expect(models.find(({ id }) => id === "gpt-6-luna")).toEqual({
      description: "Fast, cheap and good",
      id: "gpt-6-luna",
      logoUrl: "https://models.dev/logos/labs/openai.svg",
      name: "GPT-6 Luna",
    });
    expect(models.find(({ id }) => id === "gpt-5.6-luna")?.description).toBe(
      "Previous house favorite"
    );
    expect(models.find(({ id }) => id === "glm-5.3")?.description).toBe(
      "Good player, but struggles to hold positions"
    );
    expect(models.find(({ id }) => id === "space-bunny")?.description).toBe(
      "Young, dumb and broke"
    );
    for (const hiddenModelId of [
      "deepseek-v4-flash-vision-exp",
      "glm-5.2",
      "hy3",
      "kimi-k2.7-code",
      "longcat-2.0",
      "mimo-v2.5",
      "mimo-v2.5-pro",
      "minimax-m2.7",
    ]) {
      expect(models.some(({ id }) => id === hiddenModelId)).toBe(false);
    }
    expect(models.find(({ id }) => id === "deepseek-v4-pro")?.name).toBe(
      "DeepSeek V4 Pro"
    );
    expect(models.find(({ id }) => id === "claude-haiku-5-5")?.logoUrl).toBe(
      "/model-logos/claude.svg"
    );
    expect(models.find(({ id }) => id === "mimo-v2.6-pro")?.logoUrl).toBe(
      "/model-logos/xiaomi.svg"
    );
    expect(
      models.find(({ id }) => id === "muse-spark-1.2-contributor")?.name
    ).toBe("Muse Spark 1.2");
    expect(
      models.find(({ id }) => id === "longcat-2.5-preview-free")?.logoUrl
    ).toBe("/model-logos/longcat.svg");
    expect(
      models.find(({ id }) => id === "muse-spark-1.2-contributor")?.logoUrl
    ).toBe("https://static.xx.fbcdn.net/rsrc.php/yv/r/-kpAMqWYv41.webp");
  });
});

describe("model move validation", () => {
  test("accepts only UCI moves from the captured legal-move list", () => {
    const chess = new Chess();
    chess.move("e4");
    const legalMoves = chess.moves({ verbose: true });

    expect(findLegalModelMove(legalMoves, "c7c5")?.san).toBe("c5");
    expect(findLegalModelMove(legalMoves, "C7C5")?.san).toBe("c5");
    expect(findLegalModelMove(legalMoves, "c7c6")?.san).toBe("c6");
    expect(findLegalModelMove(legalMoves, "c7c4")).toBeNull();
    expect(findLegalModelMove(legalMoves, "c5")).toBeNull();
  });
});

const createResponse = (
  overrides: Partial<ModelResponseDetails> = {}
): ModelResponseDetails => ({
  contentTypes: [],
  errorMessage: null,
  rawStopReason: null,
  reasoningCharacters: 0,
  response: "",
  stopReason: "stop",
  usage: {
    cost: {
      cacheRead: 0,
      cacheWrite: 0,
      input: 0.001,
      output: 0,
      total: 0.001,
    },
    input: 100,
    output: 0,
    reasoning: null,
    totalTokens: 100,
  },
  ...overrides,
});

describe("model attempt diagnosis", () => {
  test("identifies an output limit before final text", () => {
    const response = createResponse({
      contentTypes: ["thinking"],
      reasoningCharacters: 4000,
      stopReason: "length",
      usage: {
        cost: {
          cacheRead: 0,
          cacheWrite: 0,
          input: 0.001,
          output: 0.002,
          total: 0.003,
        },
        input: 100,
        output: 1024,
        reasoning: 1024,
        totalTokens: 1124,
      },
    });

    expect(diagnoseModelAttempt(response, null, false)).toBe("output_limit");
  });

  test("distinguishes reasoning-only and completely empty responses", () => {
    const reasoningOnly = createResponse({
      contentTypes: ["thinking"],
      reasoningCharacters: 500,
    });

    expect(diagnoseModelAttempt(reasoningOnly, null, false)).toBe(
      "thinking_only"
    );
    expect(diagnoseModelAttempt(createResponse(), null, false)).toBe(
      "empty_response"
    );
  });

  test("distinguishes unparseable text from an illegal parsed move", () => {
    const response = createResponse({
      contentTypes: ["text"],
      response: "I would develop the knight.",
    });

    expect(diagnoseModelAttempt(response, null, false)).toBe("no_move_parsed");
    expect(diagnoseModelAttempt(response, "e7e4", false)).toBe("illegal_move");
  });

  test("reports provider failures and accepted moves", () => {
    const providerError = createResponse({
      errorMessage: "Provider unavailable",
      stopReason: "error",
    });
    const accepted = createResponse({
      contentTypes: ["text"],
      response: '{"move":"e7e5"}',
    });

    expect(diagnoseModelAttempt(providerError, null, false)).toBe(
      "provider_error"
    );
    expect(diagnoseModelAttempt(accepted, "e7e5", true)).toBe("accepted");
  });
});

describe("model attempt retry policy", () => {
  test("retries invalid moves twice before forfeiting", () => {
    expect(getModelAttemptDisposition("illegal_move", 1, 0)).toBe("retry");
    expect(getModelAttemptDisposition("illegal_move", 2, 0)).toBe("retry");
    expect(getModelAttemptDisposition("illegal_move", 3, 0)).toBe("forfeit");
  });

  test("retries a provider error once before failing", () => {
    expect(getModelAttemptDisposition("provider_error", 0, 1)).toBe("retry");
    expect(getModelAttemptDisposition("provider_error", 0, 2)).toBe("fail");
  });

  test("does not retry an aborted request", () => {
    expect(getModelAttemptDisposition("aborted", 0, 0)).toBe("fail");
  });
});

describe("game metrics", () => {
  test("aggregates every attempt without double-counting reasoning", () => {
    const turn: ModelTurnTrace = {
      acceptedMove: "e5",
      asciiBoard: "board",
      attempts: [
        {
          attempt: 1,
          candidate: "e7e5",
          contentTypes: ["text"],
          diagnosis: "accepted",
          durationMs: 1250,
          errorMessage: null,
          isLegal: true,
          outputTokenLimit: 1024,
          rawStopReason: null,
          reasoningCharacters: 0,
          request: "move",
          response: '{"move":"e7e5"}',
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
            output: 50,
            reasoning: 20,
            totalTokens: 150,
          },
        },
      ],
      decision: null,
      fen: "fen",
      id: "turn-1",
      kind: "move",
      message: "I played in the center.",
      pgn: "1. e4",
      status: "accepted",
      systemPrompt: "system",
    };

    expect(getGameMetrics([turn])).toEqual({
      totalCostUsd: 0.003,
      totalDurationMs: 1250,
      totalTokens: 150,
    });
    expect(redactModelDiagnostics([turn])[0]).toMatchObject({
      asciiBoard: "",
      attempts: [],
      fen: "",
      message: "I played in the center.",
      systemPrompt: "",
    });
  });
});
