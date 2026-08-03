import "dotenv/config";
import fastifyCors from "@fastify/cors";
import type { Square } from "chess.js";
import Fastify from "fastify";
import { z } from "zod";
import {
  createGame,
  GameNotFoundError,
  getChessModels,
  getGame,
  InvalidGameMoveError,
  ModelRequestError,
  playTurn,
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

const createGameSchema = z.object({
  modelId: z.string().min(1),
  playerName: z.string().trim().min(1).max(30),
});

const moveSchema = z.object({
  from: z.string().regex(/^[a-h][1-8]$/),
  promotion: z.enum(["q", "r", "b", "n"]).optional(),
  to: z.string().regex(/^[a-h][1-8]$/),
});

fastify.get("/api/models", () => ({ models: getChessModels() }));

fastify.post("/api/games", (request, reply) => {
  const input = createGameSchema.safeParse(request.body);
  if (!input.success) {
    return reply
      .code(400)
      .send({ message: "Choose a name and an available model" });
  }

  try {
    return reply
      .code(201)
      .send(createGame(input.data.playerName, input.data.modelId));
  } catch (error) {
    if (error instanceof InvalidGameMoveError) {
      return reply.code(400).send({ message: error.message });
    }
    throw error;
  }
});

fastify.get<{ Params: { gameId: string } }>(
  "/api/games/:gameId",
  (request, reply) => {
    try {
      return getGame(request.params.gameId);
    } catch (error) {
      if (error instanceof GameNotFoundError) {
        return reply.code(404).send({ message: error.message });
      }
      throw error;
    }
  }
);

fastify.post<{ Params: { gameId: string } }>(
  "/api/games/:gameId/moves",
  async (request, reply) => {
    const input = moveSchema.safeParse(request.body);
    if (!input.success) {
      return reply.code(400).send({ message: "That move is not valid" });
    }

    try {
      return await playTurn(request.params.gameId, {
        ...input.data,
        from: input.data.from as Square,
        to: input.data.to as Square,
      });
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
          game: getGame(request.params.gameId),
          message: error.message,
        });
      }
      throw error;
    }
  }
);

fastify.listen({ port: 3000 }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info("Server running on port 3000");
});
