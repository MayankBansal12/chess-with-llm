import "dotenv/config";
import fastifyCors from "@fastify/cors";
import Fastify from "fastify";

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

fastify.listen({ port: 3000 }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log("Server running on port 3000");
});
