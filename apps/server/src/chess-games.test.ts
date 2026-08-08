import { describe, expect, test } from "bun:test";
import { Chess } from "chess.js";
import {
  diagnoseModelAttempt,
  findLegalModelMove,
  getChessModels,
  getGameMetrics,
  getLatestAcceptedMoveResponse,
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
  });

  test("orders the roster, applies descriptions, and hides Kimi K2.7 Code", () => {
    const models = getChessModels();

    expect(models.map(({ id }) => id)).toEqual([
      "gpt-5.6-luna",
      "minimax-m3",
      "deepseek-v4-flash",
      "qwen3.8-max",
      "glm-5.2",
      "kimi-k3",
      "grok-4.5",
      "qwen3.7-plus",
      "kimi-k2.6",
      "qwen3.7-max",
      "mimo-v2.5",
      "deepseek-v4-pro",
      "hy3",
      "mimo-v2.5-pro",
      "glm-5.1",
      "minimax-m2.7",
      "qwen3.6-plus",
    ]);
    expect(models.find(({ id }) => id === "glm-5.1")?.description).toBe(
      "Suprisingly good, but loses it in complicated positions"
    );
    expect(models.find(({ id }) => id === "gpt-5.6-luna")).toEqual({
      description: "Fast, cheap and the house favorite",
      id: "gpt-5.6-luna",
      logoUrl: "https://models.dev/logos/labs/openai.svg",
      name: "GPT-5.6 Luna",
    });
    expect(models.find(({ id }) => id === "qwen3.8-max")?.description).toBe(
      "Great but kinda expensive on my pocket"
    );
    expect(
      models.find(({ id }) => id === "deepseek-v4-flash")?.description
    ).toBe("Good but very slow sometimes");
    expect(models.find(({ id }) => id === "minimax-m3")?.description).toBe(
      "Average and thinks too much at times"
    );
    expect(models.some(({ id }) => id === "kimi-k2.7-code")).toBe(false);
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

const createMoveTurn = (response: string): ModelTurnTrace => ({
  acceptedMove: "e5",
  asciiBoard: "board",
  attempts: [
    {
      ...createResponse({ response }),
      attempt: 1,
      candidate: "e7e5",
      diagnosis: "accepted",
      durationMs: 1000,
      isLegal: true,
      outputTokenLimit: 1024,
      request: "move",
    },
  ],
  decision: null,
  fen: "fen",
  id: crypto.randomUUID(),
  kind: "move",
  message: "I claimed the center.",
  pgn: "1. e4 e5",
  status: "accepted",
  systemPrompt: "system",
});

describe("previous model response", () => {
  test("returns the latest real accepted move response", () => {
    const firstResponse = '{"move":"e7e5","message":"I claim the center."}';
    const latestResponse = '{"move":"g8f6","message":"I develop my knight."}';

    expect(
      getLatestAcceptedMoveResponse([
        createMoveTurn(firstResponse),
        createMoveTurn(latestResponse),
      ])
    ).toBe(latestResponse);
  });

  test("returns no response before the model has moved", () => {
    expect(getLatestAcceptedMoveResponse([])).toBeNull();
  });
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
