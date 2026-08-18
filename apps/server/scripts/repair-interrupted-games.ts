import "dotenv/config";
import { Chess, type Move } from "chess.js";
import { createClient } from "redis";
import { getGameMetrics, type ModelTurnTrace } from "../src/chess-games";
import type { StoredGameRecord, StoredMove } from "../src/tournament-store";

const TARGET_GAME_IDS = [
  "group-game-02",
  "group-game-03",
  "group-game-04",
] as const;
const KEY_PREFIX = "tournament:open-weight-2026:v5";
const shouldApply = process.argv.includes("--apply");

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error("REDIS_URL is required");
}

const getGameKey = (gameId: string): string => `${KEY_PREFIX}:game:${gameId}`;

const getUci = (move: Move): string =>
  `${move.from}${move.to}${move.promotion ?? ""}`;

const selectCanonicalMoves = (
  game: StoredGameRecord,
  chess: Chess
): StoredMove[] => {
  const history = chess.history({ verbose: true });
  const usedMoveIndexes = new Set<number>();
  return history.map((historyMove, index) => {
    const ply = index + 1;
    const moveIndex = game.moves.findIndex(
      (storedMove, storedIndex) =>
        !usedMoveIndexes.has(storedIndex) &&
        storedMove.ply === ply &&
        storedMove.uci === getUci(historyMove) &&
        storedMove.san === historyMove.san
    );
    if (moveIndex === -1) {
      throw new Error(`${game.id} is missing canonical move ${ply}`);
    }
    usedMoveIndexes.add(moveIndex);
    const canonicalMove = game.moves[moveIndex];
    if (!canonicalMove) {
      throw new Error(`${game.id} canonical move ${ply} could not be read`);
    }
    return canonicalMove;
  });
};

const selectCanonicalTurns = (
  game: StoredGameRecord,
  canonicalMoves: StoredMove[]
): ModelTurnTrace[] => {
  const canonicalTurns: ModelTurnTrace[] = [];
  let searchIndex = 0;
  for (const move of canonicalMoves) {
    const relativeIndex = game.modelTurns
      .slice(searchIndex)
      .findIndex(
        (storedTurn) =>
          storedTurn.status === "accepted" &&
          storedTurn.acceptedMove === move.san
      );
    if (relativeIndex === -1) {
      throw new Error(`${game.id} is missing the turn for ply ${move.ply}`);
    }
    const turnIndex = searchIndex + relativeIndex;
    const canonicalTurn = game.modelTurns[turnIndex];
    if (!canonicalTurn) {
      throw new Error(`${game.id} turn ${turnIndex} could not be read`);
    }
    canonicalTurns.push(canonicalTurn);
    searchIndex = turnIndex + 1;
  }
  canonicalTurns.push(
    ...game.modelTurns
      .slice(searchIndex)
      .filter((turn) => turn.status !== "accepted")
  );
  return canonicalTurns;
};

const buildPausedGame = (game: StoredGameRecord): StoredGameRecord => {
  if (
    game.status !== "completed" ||
    game.result !== "draw" ||
    game.terminationReason !== "model_request_error" ||
    !game.error
  ) {
    throw new Error(`${game.id} is not an interrupted infrastructure draw`);
  }
  const chess = new Chess();
  chess.loadPgn(game.pgn);
  const canonicalMoves = selectCanonicalMoves(game, chess);
  const modelTurns = selectCanonicalTurns(game, canonicalMoves);
  const metrics = getGameMetrics(modelTurns);
  return {
    ...game,
    blackNr: 0,
    completedAt: null,
    fen: chess.fen(),
    modelTurns,
    moves: canonicalMoves,
    result: null,
    revision: game.revision + 1,
    runId: null,
    status: "paused",
    terminationReason: null,
    thinkingModelId: null,
    totalCostUsd: metrics.totalCostUsd,
    totalDurationMs: metrics.totalDurationMs,
    totalTokens: metrics.totalTokens,
    whiteNr: 0,
    winnerModelId: null,
  };
};

const client = createClient({ url: redisUrl });
await client.connect();

try {
  const originals = new Map<string, string>();
  const repairedGames = new Map<string, StoredGameRecord>();
  const rawGames = await client.mGet(TARGET_GAME_IDS.map(getGameKey));
  for (const [index, gameId] of TARGET_GAME_IDS.entries()) {
    const rawGame = rawGames[index];
    if (!rawGame) {
      throw new Error(`${gameId} was not found in Redis`);
    }
    const game = JSON.parse(rawGame) as StoredGameRecord;
    const repairedGame = buildPausedGame(game);
    originals.set(gameId, rawGame);
    repairedGames.set(gameId, repairedGame);
    console.info(
      JSON.stringify({
        error: repairedGame.error,
        gameId,
        nextTurn: new Chess(repairedGame.fen).turn(),
        originalMoveCount: game.moves.length,
        repairedMoveCount: repairedGame.moves.length,
        status: shouldApply ? "ready-to-apply" : "dry-run",
      })
    );
  }

  if (shouldApply) {
    const backupLabel = new Date().toISOString().replaceAll(/[:.]/g, "-");
    await Promise.all(
      TARGET_GAME_IDS.map(async (gameId) => {
        const original = originals.get(gameId);
        const repairedGame = repairedGames.get(gameId);
        if (!(original && repairedGame)) {
          throw new Error(`${gameId} repair data is incomplete`);
        }
        const backupKey = `${KEY_PREFIX}:backup:${backupLabel}:game:${gameId}`;
        const didBackUp = await client.set(backupKey, original, { NX: true });
        if (didBackUp !== "OK") {
          throw new Error(`Unable to create backup ${backupKey}`);
        }
      })
    );
    await Promise.all(
      TARGET_GAME_IDS.map(async (gameId) => {
        const original = originals.get(gameId);
        const repairedGame = repairedGames.get(gameId);
        if (!(original && repairedGame)) {
          throw new Error(`${gameId} repair data is incomplete`);
        }
        const didRepair = await client.eval(
          `
          if redis.call("GET", KEYS[1]) == ARGV[1] then
            redis.call("SET", KEYS[1], ARGV[2])
            return 1
          end
          return 0
        `,
          {
            arguments: [original, JSON.stringify(repairedGame)],
            keys: [getGameKey(gameId)],
          }
        );
        if (didRepair !== 1) {
          throw new Error(`${gameId} changed while the repair was running`);
        }
      })
    );
    console.info(`Repair complete. Redis backup label: ${backupLabel}`);
  } else {
    console.info(
      "Dry run complete. Pass --apply to back up and repair records."
    );
  }
} finally {
  await client.close();
}
