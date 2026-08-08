import "dotenv/config";
import fastifyCors from "@fastify/cors";
import type { Square } from "chess.js";
import Fastify, { type FastifyReply } from "fastify";
import { z } from "zod";
import {
  createGame,
  GameNotFoundError,
  getChessModels,
  getGame,
  InvalidGameMoveError,
  ModelRequestError,
  offerDraw,
  playTurn,
  resignGame,
} from "./chess-games";

const corsOrigin = process.env.CORS_ORIGIN;

if (!corsOrigin) {
  throw new Error("CORS_ORIGIN is required");
}

if (!URL.canParse(corsOrigin)) {
  throw new Error("CORS_ORIGIN must be a valid URL");
}

const baseCorsConfig = {
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  maxAge: 86_400,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  origin: corsOrigin,
};

const fastify = Fastify({
  logger: true,
});

fastify.register(fastifyCors, baseCorsConfig);

fastify.get("/", () => "OK");

const DEFAULT_PLAYER_NAME = "freeloader";

const createGameSchema = z.object({
  modelId: z.string().min(1),
  playerName: z.string().trim().max(30).optional().default(DEFAULT_PLAYER_NAME),
});

const moveSchema = z.object({
  from: z.string().regex(/^[a-h][1-8]$/),
  promotion: z.enum(["q", "r", "b", "n"]).optional(),
  to: z.string().regex(/^[a-h][1-8]$/),
});

interface DiagnosticsQuery {
  debug?: string;
}

const shouldIncludeDiagnostics = (query: DiagnosticsQuery): boolean =>
  query.debug === "true";

fastify.get("/api/models", () => ({ models: getChessModels() }));

fastify.post("/api/games", (request, reply) => {
  const input = createGameSchema.safeParse(request.body);
  if (!input.success) {
    return reply.code(400).send({ message: "Choose an available model" });
  }

  try {
    return reply
      .code(201)
      .send(
        createGame(
          input.data.playerName || DEFAULT_PLAYER_NAME,
          input.data.modelId
        )
      );
  } catch (error) {
    if (error instanceof InvalidGameMoveError) {
      return reply.code(400).send({ message: error.message });
    }
    throw error;
  }
});

fastify.get<{ Params: { gameId: string }; Querystring: DiagnosticsQuery }>(
  "/api/games/:gameId",
  (request, reply) => {
    try {
      return getGame(
        request.params.gameId,
        shouldIncludeDiagnostics(request.query)
      );
    } catch (error) {
      if (error instanceof GameNotFoundError) {
        return reply.code(404).send({ message: error.message });
      }
      throw error;
    }
  }
);

fastify.post<{
  Params: { gameId: string };
  Querystring: DiagnosticsQuery;
}>("/api/games/:gameId/moves", (request, reply) => {
  const input = moveSchema.safeParse(request.body);
  if (!input.success) {
    return reply.code(400).send({ message: "That move is not valid" });
  }

  try {
    return reply.code(202).send(
      playTurn(
        request.params.gameId,
        {
          ...input.data,
          from: input.data.from as Square,
          to: input.data.to as Square,
        },
        shouldIncludeDiagnostics(request.query)
      )
    );
  } catch (error) {
    if (error instanceof GameNotFoundError) {
      return reply.code(404).send({ message: error.message });
    }
    if (error instanceof InvalidGameMoveError) {
      return reply.code(409).send({ message: error.message });
    }
    if (error instanceof ModelRequestError) {
      request.log.error(error);
      return reply.code(502).send({
        game: getGame(
          request.params.gameId,
          shouldIncludeDiagnostics(request.query)
        ),
        message: error.message,
      });
    }
    throw error;
  }
});

const sendGameActionError = (
  error: unknown,
  gameId: string,
  includeDiagnostics: boolean,
  reply: FastifyReply
) => {
  if (error instanceof GameNotFoundError) {
    return reply.code(404).send({ message: error.message });
  }
  if (error instanceof InvalidGameMoveError) {
    return reply.code(409).send({ message: error.message });
  }
  if (error instanceof ModelRequestError) {
    return reply.code(502).send({
      game: getGame(gameId, includeDiagnostics),
      message: error.message,
    });
  }
  throw error;
};

fastify.post<{
  Params: { gameId: string };
  Querystring: DiagnosticsQuery;
}>("/api/games/:gameId/draw-offer", async (request, reply) => {
  const includeDiagnostics = shouldIncludeDiagnostics(request.query);
  try {
    return await offerDraw(request.params.gameId, includeDiagnostics);
  } catch (error) {
    request.log.error(error);
    return sendGameActionError(
      error,
      request.params.gameId,
      includeDiagnostics,
      reply
    );
  }
});

fastify.post<{
  Params: { gameId: string };
  Querystring: DiagnosticsQuery;
}>("/api/games/:gameId/resign", (request, reply) => {
  const includeDiagnostics = shouldIncludeDiagnostics(request.query);
  try {
    return resignGame(request.params.gameId, includeDiagnostics);
  } catch (error) {
    return sendGameActionError(
      error,
      request.params.gameId,
      includeDiagnostics,
      reply
    );
  }
});

const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be a valid port number");
}

try {
  await fastify.listen({ host: "0.0.0.0", port });
} catch (error) {
  fastify.log.error(error);
  process.exit(1);
}
