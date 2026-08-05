import { Agent } from "@earendil-works/pi-agent-core";
import { createModels } from "@earendil-works/pi-ai";
import { opencodeGoProvider } from "@earendil-works/pi-ai/providers/opencode-go";
import { Chess, type Move, type Square } from "chess.js";
import {
  buildDrawOfferPrompt,
  buildModelPrompt,
  DRAW_SYSTEM_PROMPT,
  getModelPosition,
  MODEL_SYSTEM_PROMPT,
} from "./chess-prompt";

const MAX_INVALID_ATTEMPTS = 3;
const MAX_PROVIDER_ERROR_ATTEMPTS = 2;
const SESSION_TTL_MS = 60 * 60 * 1000;
const JSON_MOVE_PATTERN = /"move"\s*:\s*"([^"]+)"/i;
const JSON_MESSAGE_PATTERN = /"message"\s*:\s*"([^"]+)"/i;
const JSON_DECISION_PATTERN = /"decision"\s*:\s*"(accept|decline)"/i;
const UCI_MOVE_PATTERN = /\b[a-h][1-8][a-h][1-8][qrbn]?\b/i;
const EXACT_UCI_MOVE_PATTERN = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i;

const models = createModels();
models.setProvider(opencodeGoProvider());

export interface ChessModel {
  description: string;
  id: string;
  logoUrl: string;
  name: string;
}

export type GameOutcome =
  | "active"
  | "checkmate"
  | "draw"
  | "stalemate"
  | "model_forfeit"
  | "player_resigned";

export type TerminationReason =
  | "active"
  | "checkmate"
  | "draw_agreement"
  | "draw_by_rule"
  | "model_forfeit"
  | "player_resignation"
  | "stalemate";

export interface GameMetrics {
  totalCostUsd: number;
  totalDurationMs: number;
  totalTokens: number;
}

export interface MoveTiming {
  durationMs: number;
  ply: number;
  side: "model" | "player";
}

export interface GameSnapshot {
  expiresAt: number;
  fen: string;
  id: string;
  isModelThinking: boolean;
  lastMove: { from: Square; san: string; to: Square } | null;
  metrics: GameMetrics;
  model: ChessModel;
  modelError: string | null;
  modelTurns: ModelTurnTrace[];
  moveTimings: MoveTiming[];
  outcome: GameOutcome;
  pgn: string;
  playerName: string;
  revision: number;
  terminationReason: TerminationReason;
  turn: "b" | "w";
  winner: "model" | "player" | null;
}

export interface ModelAttemptTrace {
  attempt: number;
  candidate: string | null;
  contentTypes: string[];
  diagnosis: ModelAttemptDiagnosis;
  durationMs: number;
  errorMessage: string | null;
  isLegal: boolean;
  outputTokenLimit: number;
  rawStopReason: string | null;
  reasoningCharacters: number;
  request: string;
  response: string;
  stopReason: string | null;
  usage: ModelAttemptUsage;
}

export type ModelAttemptDiagnosis =
  | "accepted"
  | "aborted"
  | "empty_response"
  | "illegal_move"
  | "no_move_parsed"
  | "output_limit"
  | "provider_error"
  | "thinking_only";

export interface ModelAttemptUsage {
  cost: {
    cacheRead: number;
    cacheWrite: number;
    input: number;
    output: number;
    total: number;
  };
  input: number;
  output: number;
  reasoning: number | null;
  totalTokens: number;
}

export interface ModelTurnTrace {
  acceptedMove: string | null;
  asciiBoard: string;
  attempts: ModelAttemptTrace[];
  decision: "accept" | "decline" | null;
  fen: string;
  id: string;
  kind: "draw_offer" | "move";
  message: string | null;
  pgn: string;
  status: "accepted" | "forfeit" | "request_error";
  systemPrompt: string;
}

interface GameSession {
  chess: Chess;
  drawOfferPly: number | null;
  expiresAt: number;
  id: string;
  isModelThinking: boolean;
  lastMove: GameSnapshot["lastMove"];
  modelError: string | null;
  modelId: string;
  modelTurns: ModelTurnTrace[];
  moveTimings: MoveTiming[];
  outcome: GameOutcome;
  playerName: string;
  revision: number;
  terminationReason: TerminationReason;
  turnStartedAt: number;
  winner: GameSnapshot["winner"];
}

interface PlayerMoveInput {
  from: Square;
  promotion?: "b" | "n" | "q" | "r";
  to: Square;
}

export class GameNotFoundError extends Error {}
export class InvalidGameMoveError extends Error {}
export class ModelRequestError extends Error {}

const gameSessions = new Map<string, GameSession>();

const MODEL_LOGOS = {
  deepseek: "/model-logos/deepseek.svg",
  glm: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  grok: "https://grok.com/images/favicon.svg",
  hy: "https://hunyuan-blog-web-prod-1258344703.cos.ap-guangzhou.myqcloud.com/logo.svg",
  kimi: "/model-logos/kimi.svg",
  mimo: "https://mimo.mi.com/favicon.png",
  minimax:
    "https://filecdn.minimax.chat/public/58eca777-e31f-448a-9823-e2220e49b426.png",
  qwen: "https://img.alicdn.com/imgextra/i4/O1CN01OXv3EM1FN8t9W4P79_!!6000000000474-2-tps-80-80.png",
} as const;

const MODEL_NAME_SUFFIX_PATTERN =
  /(?:\s*\((?:free|\d+(?:\.\d+)?x usage)\)\s*)+$/i;

export const normalizeModelName = (name: string): string =>
  name.replace(MODEL_NAME_SUFFIX_PATTERN, "").trim();

const getModelLogoUrl = (modelId: string): string => {
  for (const [family, logoUrl] of Object.entries(MODEL_LOGOS)) {
    if (modelId.toLowerCase().startsWith(family)) {
      return logoUrl;
    }
  }
  return "/favicon.svg";
};

const getModelDescription = (modelId: string): string => {
  if (modelId === "minimax-m3") {
    return "Fast, tactical, and the house favorite";
  }
  if (modelId.includes("flash")) {
    return "Quick replies with an attacking instinct";
  }
  if (modelId.includes("pro") || modelId.includes("max")) {
    return "A deeper-thinking positional opponent";
  }
  return "A capable open-weight challenger";
};

export const getChessModels = (): ChessModel[] =>
  models
    .getModels("opencode-go")
    .map(({ id, name }) => ({
      description: getModelDescription(id),
      id,
      logoUrl: getModelLogoUrl(id),
      name: normalizeModelName(name),
    }))
    .sort((firstModel, secondModel) => {
      if (firstModel.id === "minimax-m3") {
        return -1;
      }
      if (secondModel.id === "minimax-m3") {
        return 1;
      }
      return firstModel.name.localeCompare(secondModel.name);
    });

const getModelInfo = (modelId: string): ChessModel => {
  const model = getChessModels().find(({ id }) => id === modelId);
  if (!model) {
    throw new InvalidGameMoveError("That model is not currently available");
  }
  return model;
};

const removeExpiredSessions = (): void => {
  for (const [sessionId, session] of gameSessions) {
    if (session.expiresAt <= Date.now()) {
      gameSessions.delete(sessionId);
    }
  }
};

const getSession = (gameId: string): GameSession => {
  const session = gameSessions.get(gameId);
  if (!session || session.expiresAt <= Date.now()) {
    gameSessions.delete(gameId);
    throw new GameNotFoundError("This match has expired or does not exist");
  }
  return session;
};

const getBoardOutcome = (
  chess: Chess
): Pick<GameSnapshot, "outcome" | "terminationReason" | "winner"> => {
  if (chess.isCheckmate()) {
    return {
      outcome: "checkmate",
      terminationReason: "checkmate",
      winner: chess.turn() === "w" ? "model" : "player",
    };
  }
  if (chess.isStalemate()) {
    return {
      outcome: "stalemate",
      terminationReason: "stalemate",
      winner: null,
    };
  }
  if (chess.isDraw()) {
    return {
      outcome: "draw",
      terminationReason: "draw_by_rule",
      winner: null,
    };
  }
  return { outcome: "active", terminationReason: "active", winner: null };
};

const updateOutcome = (session: GameSession): void => {
  const { outcome, terminationReason, winner } = getBoardOutcome(session.chess);
  session.outcome = outcome;
  session.terminationReason = terminationReason;
  session.winner = winner;
};

export const getGameMetrics = (turns: ModelTurnTrace[]): GameMetrics => {
  let totalCostUsd = 0;
  let totalDurationMs = 0;
  let totalTokens = 0;
  for (const turn of turns) {
    for (const attempt of turn.attempts) {
      totalCostUsd += attempt.usage.cost.total;
      totalDurationMs += attempt.durationMs;
      totalTokens += attempt.usage.totalTokens;
    }
  }
  return { totalCostUsd, totalDurationMs, totalTokens };
};

export const getLatestAcceptedMoveResponse = (
  turns: ModelTurnTrace[]
): string | null => {
  for (const turn of [...turns].reverse()) {
    if (turn.kind !== "move" || turn.status !== "accepted") {
      continue;
    }
    for (const attempt of [...turn.attempts].reverse()) {
      if (attempt.diagnosis !== "accepted") {
        continue;
      }
      const response = attempt.response.trim();
      if (response) {
        return response;
      }
    }
  }
  return null;
};

export const redactModelDiagnostics = (
  turns: ModelTurnTrace[]
): ModelTurnTrace[] =>
  turns.map((turn) => ({
    ...turn,
    asciiBoard: "",
    attempts: [],
    fen: "",
    systemPrompt: "",
  }));

const toSnapshot = (
  session: GameSession,
  includeDiagnostics = false
): GameSnapshot => ({
  expiresAt: session.expiresAt,
  fen: session.chess.fen(),
  id: session.id,
  isModelThinking: session.isModelThinking,
  lastMove: session.lastMove,
  metrics: getGameMetrics(session.modelTurns),
  model: getModelInfo(session.modelId),
  modelError: session.modelError,
  modelTurns:
    process.env.NODE_ENV === "production" && !includeDiagnostics
      ? redactModelDiagnostics(session.modelTurns)
      : session.modelTurns,
  moveTimings: session.moveTimings,
  outcome: session.outcome,
  pgn: session.chess.pgn(),
  playerName: session.playerName,
  revision: session.revision,
  terminationReason: session.terminationReason,
  turn: session.chess.turn(),
  winner: session.winner,
});

export const createGame = (
  playerName: string,
  modelId: string
): GameSnapshot => {
  removeExpiredSessions();
  getModelInfo(modelId);

  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const session: GameSession = {
    chess: new Chess(),
    drawOfferPly: null,
    expiresAt: createdAt + SESSION_TTL_MS,
    id,
    isModelThinking: false,
    lastMove: null,
    modelError: null,
    modelId,
    modelTurns: [],
    moveTimings: [],
    outcome: "active",
    playerName,
    revision: 0,
    terminationReason: "active",
    turnStartedAt: createdAt,
    winner: null,
  };
  gameSessions.set(id, session);
  return toSnapshot(session);
};

export const getGame = (
  gameId: string,
  includeDiagnostics = false
): GameSnapshot => toSnapshot(getSession(gameId), includeDiagnostics);

export interface ModelResponseDetails {
  contentTypes: string[];
  errorMessage: string | null;
  rawStopReason: string | null;
  reasoningCharacters: number;
  response: string;
  stopReason: string | null;
  usage: ModelAttemptUsage;
}

const extractResponseDetails = (agent: Agent): ModelResponseDetails => {
  const assistantMessage = agent.state.messages.findLast(
    (message) => message.role === "assistant"
  );
  if (assistantMessage?.role !== "assistant") {
    return {
      contentTypes: [],
      errorMessage: "The provider returned no assistant message",
      rawStopReason: null,
      reasoningCharacters: 0,
      response: "",
      stopReason: null,
      usage: {
        cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
        input: 0,
        output: 0,
        reasoning: null,
        totalTokens: 0,
      },
    };
  }

  const response = assistantMessage.content
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("\n")
    .trim();
  const reasoningCharacters = assistantMessage.content
    .filter((content) => content.type === "thinking")
    .reduce((total, content) => total + content.thinking.length, 0);

  return {
    contentTypes: assistantMessage.content.map((content) => content.type),
    errorMessage: assistantMessage.errorMessage ?? null,
    rawStopReason: assistantMessage.rawStopReason ?? null,
    reasoningCharacters,
    response,
    stopReason: assistantMessage.stopReason,
    usage: {
      cost: assistantMessage.usage.cost,
      input: assistantMessage.usage.input,
      output: assistantMessage.usage.output,
      reasoning: assistantMessage.usage.reasoning ?? null,
      totalTokens: assistantMessage.usage.totalTokens,
    },
  };
};

export const diagnoseModelAttempt = (
  details: ModelResponseDetails,
  candidate: string | null,
  isLegal: boolean
): ModelAttemptDiagnosis => {
  if (details.stopReason === "aborted") {
    return "aborted";
  }
  if (details.stopReason === "error" || details.errorMessage) {
    return "provider_error";
  }
  if (isLegal) {
    return "accepted";
  }
  if (!details.response && details.stopReason === "length") {
    return "output_limit";
  }
  if (!details.response && details.reasoningCharacters > 0) {
    return "thinking_only";
  }
  if (!details.response) {
    return "empty_response";
  }
  if (!candidate) {
    return "no_move_parsed";
  }
  return "illegal_move";
};

export const getModelAttemptDisposition = (
  diagnosis: ModelAttemptDiagnosis,
  invalidAttempts: number,
  providerErrorAttempts: number
): "accept" | "fail" | "forfeit" | "retry" => {
  if (diagnosis === "accepted") {
    return "accept";
  }
  if (diagnosis === "aborted") {
    return "fail";
  }
  if (diagnosis === "provider_error") {
    return providerErrorAttempts < MAX_PROVIDER_ERROR_ATTEMPTS
      ? "retry"
      : "fail";
  }
  return invalidAttempts < MAX_INVALID_ATTEMPTS ? "retry" : "forfeit";
};

const getAttemptCounts = (
  diagnosis: ModelAttemptDiagnosis,
  invalidAttempts: number,
  providerErrorAttempts: number
): { invalidAttempts: number; providerErrorAttempts: number } => {
  if (diagnosis === "provider_error") {
    return {
      invalidAttempts,
      providerErrorAttempts: providerErrorAttempts + 1,
    };
  }
  if (diagnosis !== "accepted" && diagnosis !== "aborted") {
    return { invalidAttempts: invalidAttempts + 1, providerErrorAttempts };
  }
  return { invalidAttempts, providerErrorAttempts };
};

const normalizeModelMessage = (message: unknown, fallback: string): string => {
  if (typeof message !== "string") {
    return fallback;
  }
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return fallback;
  }
  return normalized.length <= 120
    ? normalized
    : `${normalized.slice(0, 119).trimEnd()}…`;
};

interface ParsedMoveResponse {
  candidate: string | null;
  message: string | null;
}

const parseMoveResponse = (response: string): ParsedMoveResponse => {
  const trimmedResponse = response.trim();
  try {
    const parsed = JSON.parse(trimmedResponse) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "move" in parsed &&
      typeof parsed.move === "string"
    ) {
      return {
        candidate: parsed.move.trim(),
        message:
          "message" in parsed && typeof parsed.message === "string"
            ? parsed.message
            : null,
      };
    }
  } catch {
    // Models occasionally wrap the requested value in prose or a code block.
  }

  const jsonMove = response.match(JSON_MOVE_PATTERN)?.[1];
  if (jsonMove) {
    return {
      candidate: jsonMove.trim(),
      message: response.match(JSON_MESSAGE_PATTERN)?.[1] ?? null,
    };
  }
  return {
    candidate: response.match(UCI_MOVE_PATTERN)?.[0] ?? null,
    message: null,
  };
};

interface ParsedDrawResponse {
  decision: "accept" | "decline" | null;
  message: string | null;
}

const parseDrawResponse = (response: string): ParsedDrawResponse => {
  try {
    const parsed = JSON.parse(response.trim()) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "decision" in parsed &&
      (parsed.decision === "accept" || parsed.decision === "decline")
    ) {
      return {
        decision: parsed.decision,
        message:
          "message" in parsed && typeof parsed.message === "string"
            ? parsed.message
            : null,
      };
    }
  } catch {
    // Models occasionally wrap strict JSON in prose or a code block.
  }
  const decision = response.match(JSON_DECISION_PATTERN)?.[1]?.toLowerCase();
  return {
    decision: decision === "accept" || decision === "decline" ? decision : null,
    message: response.match(JSON_MESSAGE_PATTERN)?.[1] ?? null,
  };
};

const getUciMove = (move: Move): string =>
  `${move.from}${move.to}${move.promotion ?? ""}`;

export const findLegalModelMove = (
  legalMoves: Move[],
  candidate: string | null
): Move | null => {
  if (!candidate) {
    return null;
  }
  const normalizedCandidate = candidate.trim().toLowerCase();
  if (!EXACT_UCI_MOVE_PATTERN.test(normalizedCandidate)) {
    return null;
  }
  return (
    legalMoves.find((move) => getUciMove(move) === normalizedCandidate) ?? null
  );
};

const createAgent = (
  session: GameSession,
  systemPrompt: string
): { agent: Agent; outputTokenLimit: number } => {
  const providerModel = models.getModel("opencode-go", session.modelId);
  if (!providerModel) {
    throw new ModelRequestError("The selected model is no longer available");
  }

  return {
    agent: new Agent({
      initialState: {
        model: providerModel,
        systemPrompt,
        thinkingLevel: "low",
      },
      maxRetryDelayMs: 10_000,
      sessionId: crypto.randomUUID(),
      streamFn: models.streamSimple.bind(models),
    }),
    outputTokenLimit: providerModel.maxTokens,
  };
};

interface ModelMoveResult {
  durationMs: number;
  message: string;
  move: Move;
  turn: ModelTurnTrace;
}

const requestModelMove = async (
  session: GameSession
): Promise<ModelMoveResult | null> => {
  const { agent, outputTokenLimit } = createAgent(session, MODEL_SYSTEM_PROMPT);

  const legalMoves = session.chess.moves({ verbose: true });
  const position = getModelPosition(session.chess, legalMoves);
  const modelTurn: ModelTurnTrace = {
    acceptedMove: null,
    asciiBoard: position.asciiBoard,
    attempts: [],
    decision: null,
    fen: position.fen,
    id: crypto.randomUUID(),
    kind: "move",
    message: null,
    pgn: position.pgn,
    status: "request_error",
    systemPrompt: MODEL_SYSTEM_PROMPT,
  };
  const latestAcceptedResponse = getLatestAcceptedMoveResponse(
    session.modelTurns
  );
  session.modelTurns.push(modelTurn);
  let invalidMove: string | null = null;
  let previousResponse = latestAcceptedResponse;
  let invalidAttempts = 0;
  let providerErrorAttempts = 0;
  let attempt = 0;

  while (
    invalidAttempts < MAX_INVALID_ATTEMPTS &&
    providerErrorAttempts < MAX_PROVIDER_ERROR_ATTEMPTS
  ) {
    attempt += 1;
    const request = buildModelPrompt(position, previousResponse, invalidMove);
    const startedAt = performance.now();
    // biome-ignore lint/performance/noAwaitInLoops: each retry must include feedback from the prior invalid response.
    await agent.prompt(request);
    const durationMs = Math.round(performance.now() - startedAt);
    const responseDetails = extractResponseDetails(agent);
    const { response } = responseDetails;
    const { candidate, message } = parseMoveResponse(response);
    const validMove = findLegalModelMove(legalMoves, candidate);
    const diagnosis = diagnoseModelAttempt(
      responseDetails,
      candidate,
      Boolean(validMove)
    );
    modelTurn.attempts.push({
      ...responseDetails,
      attempt,
      candidate,
      diagnosis,
      durationMs,
      isLegal: Boolean(validMove),
      outputTokenLimit,
      request,
    });

    ({ invalidAttempts, providerErrorAttempts } = getAttemptCounts(
      diagnosis,
      invalidAttempts,
      providerErrorAttempts
    ));

    const disposition = getModelAttemptDisposition(
      diagnosis,
      invalidAttempts,
      providerErrorAttempts
    );
    if (disposition === "fail") {
      throw new ModelRequestError(
        responseDetails.errorMessage ?? "The selected model could not respond"
      );
    }
    if (disposition === "accept" && validMove) {
      const normalizedMessage = normalizeModelMessage(
        message,
        `I played ${validMove.san}.`
      );
      return {
        durationMs: modelTurn.attempts.reduce(
          (total, currentAttempt) => total + currentAttempt.durationMs,
          0
        ),
        message: normalizedMessage,
        move: validMove,
        turn: modelTurn,
      };
    }
    if (disposition === "forfeit") {
      break;
    }
    if (diagnosis !== "provider_error") {
      invalidMove = candidate ?? (response.trim() || "unparseable response");
    }
    previousResponse = response;
  }

  modelTurn.status = "forfeit";
  return null;
};

const requestDrawDecision = async (
  session: GameSession
): Promise<{ decision: "accept" | "decline"; message: string }> => {
  const { agent, outputTokenLimit } = createAgent(session, DRAW_SYSTEM_PROMPT);
  const position = getModelPosition(session.chess);
  const modelTurn: ModelTurnTrace = {
    acceptedMove: null,
    asciiBoard: position.asciiBoard,
    attempts: [],
    decision: null,
    fen: position.fen,
    id: crypto.randomUUID(),
    kind: "draw_offer",
    message: null,
    pgn: position.pgn,
    status: "request_error",
    systemPrompt: DRAW_SYSTEM_PROMPT,
  };
  session.modelTurns.push(modelTurn);
  let invalidResponse: string | null = null;
  let invalidAttempts = 0;
  let providerErrorAttempts = 0;
  let attempt = 0;

  while (
    invalidAttempts < MAX_INVALID_ATTEMPTS &&
    providerErrorAttempts < MAX_PROVIDER_ERROR_ATTEMPTS
  ) {
    attempt += 1;
    const request = buildDrawOfferPrompt(position, invalidResponse);
    const startedAt = performance.now();
    // biome-ignore lint/performance/noAwaitInLoops: each retry includes feedback from the prior response.
    await agent.prompt(request);
    const durationMs = Math.round(performance.now() - startedAt);
    const responseDetails = extractResponseDetails(agent);
    const { response } = responseDetails;
    const { decision, message } = parseDrawResponse(response);
    const diagnosis = diagnoseModelAttempt(
      responseDetails,
      decision,
      Boolean(decision)
    );
    modelTurn.attempts.push({
      ...responseDetails,
      attempt,
      candidate: decision,
      diagnosis,
      durationMs,
      isLegal: Boolean(decision),
      outputTokenLimit,
      request,
    });

    ({ invalidAttempts, providerErrorAttempts } = getAttemptCounts(
      diagnosis,
      invalidAttempts,
      providerErrorAttempts
    ));

    const disposition = getModelAttemptDisposition(
      diagnosis,
      invalidAttempts,
      providerErrorAttempts
    );
    if (disposition === "fail") {
      throw new ModelRequestError(
        responseDetails.errorMessage ?? "The selected model could not respond"
      );
    }
    if (disposition === "accept" && decision) {
      const fallback =
        decision === "accept"
          ? "This position looks balanced."
          : "I still have chances to play for.";
      modelTurn.decision = decision;
      modelTurn.message = normalizeModelMessage(message, fallback);
      modelTurn.status = "accepted";
      return { decision, message: modelTurn.message };
    }
    if (disposition === "forfeit") {
      break;
    }
    if (diagnosis !== "provider_error") {
      invalidResponse = response.trim() || "empty response";
    }
  }

  modelTurn.decision = "decline";
  modelTurn.message = "I still have chances to play for.";
  modelTurn.status = "accepted";
  return { decision: "decline", message: modelTurn.message };
};

interface PlayerTurnRollback {
  lastMove: GameSnapshot["lastMove"];
  moveTimingCount: number;
  pgn: string;
}

const restorePlayerTurn = (
  session: GameSession,
  rollback: PlayerTurnRollback
): void => {
  session.chess = new Chess();
  if (rollback.pgn) {
    session.chess.loadPgn(rollback.pgn);
  }
  session.lastMove = rollback.lastMove;
  session.moveTimings.length = rollback.moveTimingCount;
};

const completeModelTurn = async (
  session: GameSession,
  rollback: PlayerTurnRollback
): Promise<void> => {
  try {
    const modelResult = await requestModelMove(session);
    if (
      session.expiresAt <= Date.now() ||
      session.outcome !== "active" ||
      session.chess.turn() !== "b"
    ) {
      return;
    }
    if (!modelResult) {
      session.outcome = "model_forfeit";
      session.terminationReason = "model_forfeit";
      session.winner = "player";
      return;
    }

    const appliedModelMove = session.chess.move({
      from: modelResult.move.from,
      promotion: modelResult.move.promotion,
      to: modelResult.move.to,
    });
    modelResult.turn.acceptedMove = appliedModelMove.san;
    modelResult.turn.message = modelResult.message;
    modelResult.turn.status = "accepted";
    session.lastMove = {
      from: appliedModelMove.from,
      san: appliedModelMove.san,
      to: appliedModelMove.to,
    };
    session.moveTimings.push({
      durationMs: modelResult.durationMs,
      ply: session.chess.history().length,
      side: "model",
    });
    session.modelError = null;
    updateOutcome(session);
    session.turnStartedAt = Date.now();
  } catch {
    if (session.expiresAt <= Date.now() || session.outcome !== "active") {
      return;
    }
    restorePlayerTurn(session, rollback);
    session.modelError =
      "The model could not respond, so the position was restored. Please try your move again.";
  } finally {
    session.isModelThinking = false;
    session.revision += 1;
  }
};

export const playTurn = (
  gameId: string,
  playerMove: PlayerMoveInput,
  includeDiagnostics = false
): GameSnapshot => {
  const session = getSession(gameId);
  if (session.outcome !== "active") {
    throw new InvalidGameMoveError("This match is already over");
  }
  if (session.chess.turn() !== "w") {
    throw new InvalidGameMoveError("Wait for your opponent to move");
  }
  if (session.isModelThinking) {
    throw new InvalidGameMoveError("Wait for your opponent to finish");
  }

  const rollback: PlayerTurnRollback = {
    lastMove: session.lastMove,
    moveTimingCount: session.moveTimings.length,
    pgn: session.chess.pgn(),
  };
  let appliedPlayerMove: Move;
  try {
    appliedPlayerMove = session.chess.move(playerMove);
  } catch (error) {
    throw new InvalidGameMoveError("That move is not legal in this position", {
      cause: error,
    });
  }
  session.lastMove = {
    from: appliedPlayerMove.from,
    san: appliedPlayerMove.san,
    to: appliedPlayerMove.to,
  };
  session.moveTimings.push({
    durationMs: Math.max(0, Date.now() - session.turnStartedAt),
    ply: session.chess.history().length,
    side: "player",
  });
  session.modelError = null;
  updateOutcome(session);
  session.revision += 1;
  if (session.outcome !== "active") {
    return toSnapshot(session, includeDiagnostics);
  }

  session.isModelThinking = true;
  completeModelTurn(session, rollback).catch(() => undefined);
  return toSnapshot(session, includeDiagnostics);
};

export const offerDraw = async (
  gameId: string,
  includeDiagnostics = false
): Promise<GameSnapshot> => {
  const session = getSession(gameId);
  if (session.outcome !== "active") {
    throw new InvalidGameMoveError("This match is already over");
  }
  if (session.chess.turn() !== "w" || session.isModelThinking) {
    throw new InvalidGameMoveError(
      "You can only offer a draw when it is your turn"
    );
  }
  const currentPly = session.chess.history().length;
  if (session.drawOfferPly === currentPly) {
    throw new InvalidGameMoveError(
      "You have already offered a draw on this turn"
    );
  }

  session.isModelThinking = true;
  session.revision += 1;
  try {
    const result = await requestDrawDecision(session);
    if (session.outcome !== "active") {
      session.isModelThinking = false;
      return toSnapshot(session, includeDiagnostics);
    }
    session.drawOfferPly = currentPly;
    if (result.decision === "accept") {
      session.outcome = "draw";
      session.terminationReason = "draw_agreement";
      session.winner = null;
    }
    session.isModelThinking = false;
    return toSnapshot(session, includeDiagnostics);
  } finally {
    session.isModelThinking = false;
    session.revision += 1;
  }
};

export const resignGame = (
  gameId: string,
  includeDiagnostics = false
): GameSnapshot => {
  const session = getSession(gameId);
  if (session.outcome !== "active") {
    throw new InvalidGameMoveError("This match is already over");
  }
  session.outcome = "player_resigned";
  session.terminationReason = "player_resignation";
  session.winner = "model";
  session.revision += 1;
  return toSnapshot(session, includeDiagnostics);
};
