import { Agent } from "@earendil-works/pi-agent-core";
import { createModels } from "@earendil-works/pi-ai";
import { opencodeGoProvider } from "@earendil-works/pi-ai/providers/opencode-go";
import { Chess, type Move, type Square } from "chess.js";
import {
  buildModelPrompt,
  getModelPosition,
  MODEL_SYSTEM_PROMPT,
} from "./chess-prompt";

const MAX_INVALID_ATTEMPTS = 3;
const MAX_PROVIDER_ERROR_ATTEMPTS = 2;
const SESSION_TTL_MS = 60 * 60 * 1000;
const JSON_MOVE_PATTERN = /"move"\s*:\s*"([^"]+)"/i;
const UCI_MOVE_PATTERN = /\b[a-h][1-8][a-h][1-8][qrbn]?\b/i;
const EXACT_UCI_MOVE_PATTERN = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i;

const models = createModels();
models.setProvider(opencodeGoProvider());

export interface ChessModel {
  description: string;
  id: string;
  name: string;
}

export type GameOutcome =
  | "active"
  | "checkmate"
  | "draw"
  | "stalemate"
  | "model_forfeit";

export interface GameSnapshot {
  fen: string;
  id: string;
  lastMove: { from: Square; san: string; to: Square } | null;
  model: ChessModel;
  modelTurns: ModelTurnTrace[];
  outcome: GameOutcome;
  pgn: string;
  playerName: string;
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
  input: number;
  output: number;
  reasoning: number | null;
  totalTokens: number;
}

export interface ModelTurnTrace {
  asciiBoard: string;
  attempts: ModelAttemptTrace[];
  fen: string;
  id: string;
  pgn: string;
  status: "accepted" | "forfeit" | "request_error";
  systemPrompt: string;
}

interface GameSession {
  chess: Chess;
  id: string;
  lastMove: GameSnapshot["lastMove"];
  modelId: string;
  modelTurns: ModelTurnTrace[];
  outcome: GameOutcome;
  playerName: string;
  updatedAt: number;
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
  return "A capable OpenCode Go challenger";
};

export const getChessModels = (): ChessModel[] =>
  models
    .getModels("opencode-go")
    .map(({ id, name }) => ({
      description: getModelDescription(id),
      id,
      name,
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
    throw new InvalidGameMoveError(
      "That model is not available on OpenCode Go"
    );
  }
  return model;
};

const removeExpiredSessions = (): void => {
  const expiryTime = Date.now() - SESSION_TTL_MS;
  for (const [sessionId, session] of gameSessions) {
    if (session.updatedAt < expiryTime) {
      gameSessions.delete(sessionId);
    }
  }
};

const getSession = (gameId: string): GameSession => {
  const session = gameSessions.get(gameId);
  if (!session || session.updatedAt < Date.now() - SESSION_TTL_MS) {
    gameSessions.delete(gameId);
    throw new GameNotFoundError("This match has expired or does not exist");
  }
  session.updatedAt = Date.now();
  return session;
};

const getBoardOutcome = (
  chess: Chess
): Pick<GameSnapshot, "outcome" | "winner"> => {
  if (chess.isCheckmate()) {
    return {
      outcome: "checkmate",
      winner: chess.turn() === "w" ? "model" : "player",
    };
  }
  if (chess.isStalemate()) {
    return { outcome: "stalemate", winner: null };
  }
  if (chess.isDraw()) {
    return { outcome: "draw", winner: null };
  }
  return { outcome: "active", winner: null };
};

const updateOutcome = (session: GameSession): void => {
  const { outcome, winner } = getBoardOutcome(session.chess);
  session.outcome = outcome;
  session.winner = winner;
};

const toSnapshot = (session: GameSession): GameSnapshot => ({
  fen: session.chess.fen(),
  id: session.id,
  lastMove: session.lastMove,
  model: getModelInfo(session.modelId),
  modelTurns: session.modelTurns,
  outcome: session.outcome,
  pgn: session.chess.pgn(),
  playerName: session.playerName,
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
  const session: GameSession = {
    chess: new Chess(),
    id,
    lastMove: null,
    modelId,
    modelTurns: [],
    outcome: "active",
    playerName,
    updatedAt: Date.now(),
    winner: null,
  };
  gameSessions.set(id, session);
  return toSnapshot(session);
};

export const getGame = (gameId: string): GameSnapshot =>
  toSnapshot(getSession(gameId));

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
      usage: { input: 0, output: 0, reasoning: null, totalTokens: 0 },
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

const parseMoveCandidate = (response: string): string | null => {
  const trimmedResponse = response.trim();
  try {
    const parsed = JSON.parse(trimmedResponse) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "move" in parsed &&
      typeof parsed.move === "string"
    ) {
      return parsed.move.trim();
    }
  } catch {
    // Models occasionally wrap the requested value in prose or a code block.
  }

  const jsonMove = response.match(JSON_MOVE_PATTERN)?.[1];
  if (jsonMove) {
    return jsonMove.trim();
  }
  return response.match(UCI_MOVE_PATTERN)?.[0] ?? null;
};

const validateModelMove = (
  chess: Chess,
  candidate: string | null
): Move | null => {
  if (!candidate) {
    return null;
  }

  const validationBoard = new Chess();
  validationBoard.loadPgn(chess.pgn());
  try {
    const uciMove = candidate.match(EXACT_UCI_MOVE_PATTERN);
    if (uciMove) {
      return validationBoard.move({
        from: uciMove[1] as Square,
        promotion:
          (uciMove[3]?.toLowerCase() as PlayerMoveInput["promotion"]) ?? "q",
        to: uciMove[2] as Square,
      });
    }
    return validationBoard.move(candidate);
  } catch {
    return null;
  }
};

const requestModelMove = async (session: GameSession): Promise<Move | null> => {
  const providerModel = models.getModel("opencode-go", session.modelId);
  if (!providerModel) {
    throw new ModelRequestError("The selected model is no longer available");
  }

  const agent = new Agent({
    initialState: {
      model: providerModel,
      systemPrompt: MODEL_SYSTEM_PROMPT,
      thinkingLevel: "low",
    },
    maxRetryDelayMs: 10_000,
    sessionId: crypto.randomUUID(),
    streamFn: models.streamSimple.bind(models),
  });

  const position = getModelPosition(session.chess);
  const modelTurn: ModelTurnTrace = {
    ...position,
    attempts: [],
    id: crypto.randomUUID(),
    status: "request_error",
    systemPrompt: MODEL_SYSTEM_PROMPT,
  };
  session.modelTurns.push(modelTurn);
  let invalidMove: string | null = null;
  let invalidAttempts = 0;
  let providerErrorAttempts = 0;
  let attempt = 0;

  while (
    invalidAttempts < MAX_INVALID_ATTEMPTS &&
    providerErrorAttempts < MAX_PROVIDER_ERROR_ATTEMPTS
  ) {
    attempt += 1;
    const request = buildModelPrompt(position, invalidMove);
    const startedAt = performance.now();
    // biome-ignore lint/performance/noAwaitInLoops: each retry must include feedback from the prior invalid response.
    await agent.prompt(request);
    const durationMs = Math.round(performance.now() - startedAt);
    const responseDetails = extractResponseDetails(agent);
    const { response } = responseDetails;
    const candidate = parseMoveCandidate(response);
    const validMove = validateModelMove(session.chess, candidate);
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
      outputTokenLimit: providerModel.maxTokens,
      request,
    });

    if (diagnosis === "provider_error") {
      providerErrorAttempts += 1;
    } else if (diagnosis !== "accepted" && diagnosis !== "aborted") {
      invalidAttempts += 1;
    }

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
      modelTurn.status = "accepted";
      return validMove;
    }
    if (disposition === "forfeit") {
      break;
    }
    if (diagnosis !== "provider_error") {
      invalidMove = candidate ?? (response.trim() || "unparseable response");
    }
  }

  modelTurn.status = "forfeit";
  return null;
};

export const playTurn = async (
  gameId: string,
  playerMove: PlayerMoveInput
): Promise<GameSnapshot> => {
  const session = getSession(gameId);
  if (session.outcome !== "active") {
    throw new InvalidGameMoveError("This match is already over");
  }
  if (session.chess.turn() !== "w") {
    throw new InvalidGameMoveError("Wait for your opponent to move");
  }

  const pgnBeforeTurn = session.chess.pgn();
  const lastMoveBeforeTurn = session.lastMove;
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
  updateOutcome(session);
  if (session.outcome !== "active") {
    return toSnapshot(session);
  }

  try {
    const modelMove = await requestModelMove(session);
    if (!modelMove) {
      session.outcome = "model_forfeit";
      session.winner = "player";
      return toSnapshot(session);
    }

    const appliedModelMove = session.chess.move({
      from: modelMove.from,
      promotion: modelMove.promotion,
      to: modelMove.to,
    });
    session.lastMove = {
      from: appliedModelMove.from,
      san: appliedModelMove.san,
      to: appliedModelMove.to,
    };
    updateOutcome(session);
    return toSnapshot(session);
  } catch (error) {
    session.chess = new Chess();
    if (pgnBeforeTurn) {
      session.chess.loadPgn(pgnBeforeTurn);
    }
    session.lastMove = lastMoveBeforeTurn;
    if (error instanceof ModelRequestError) {
      throw error;
    }
    throw new ModelRequestError(
      "The model connection failed. Please try that move again.",
      { cause: error }
    );
  }
};
