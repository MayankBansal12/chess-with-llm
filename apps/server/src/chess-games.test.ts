import { describe, expect, test } from "bun:test";
import {
  diagnoseModelAttempt,
  getModelAttemptDisposition,
  type ModelResponseDetails,
} from "./chess-games";

const createResponse = (
  overrides: Partial<ModelResponseDetails> = {}
): ModelResponseDetails => ({
  contentTypes: [],
  errorMessage: null,
  rawStopReason: null,
  reasoningCharacters: 0,
  response: "",
  stopReason: "stop",
  usage: { input: 100, output: 0, reasoning: null, totalTokens: 100 },
  ...overrides,
});

describe("model attempt diagnosis", () => {
  test("identifies an output limit before final text", () => {
    const response = createResponse({
      contentTypes: ["thinking"],
      reasoningCharacters: 4000,
      stopReason: "length",
      usage: {
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
