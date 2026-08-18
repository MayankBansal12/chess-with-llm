import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import type { ModelTurnTrace } from "./chess-games";
import type {
  StoredGameRecord,
  StoredMove,
  TournamentSeed,
} from "./tournament-store";
import type {
  TournamentGameStatus,
  TournamentGroup,
  TournamentResult,
} from "./tournament-types";

interface TournamentRow {
  created_at: number;
}

interface GameRow {
  black_model_id: string;
  black_nr: number;
  completed_at: number | null;
  error: string | null;
  fen: string;
  group_name: TournamentGroup | null;
  id: string;
  pgn: string;
  result: TournamentResult | null;
  revision: number;
  sequence: number;
  stage: StoredGameRecord["stage"];
  started_at: number | null;
  status: TournamentGameStatus;
  termination_reason: string | null;
  thinking_model_id: string | null;
  total_cost_usd: number;
  total_duration_ms: number;
  total_tokens: number;
  white_model_id: string;
  white_nr: number;
  winner_model_id: string | null;
}

interface MoveRow {
  color: "b" | "w";
  cost_usd: number;
  created_at: number;
  duration_ms: number;
  fen_after: string;
  message: string;
  model_id: string;
  ply: number;
  san: string;
  tokens: number;
  uci: string;
}

interface ModelTurnRow {
  trace_json: string;
}

const normalizeModelId = (modelId: string): string =>
  modelId === "qwen3.7-plus" ? "deepseek-v4-pro" : modelId;

const mapMove = (row: MoveRow): StoredMove => ({
  color: row.color,
  costUsd: row.cost_usd,
  createdAt: row.created_at,
  durationMs: row.duration_ms,
  fenAfter: row.fen_after,
  message: row.message,
  modelId: normalizeModelId(row.model_id),
  ply: row.ply,
  san: row.san,
  tokens: row.tokens,
  uci: row.uci,
});

export const loadLegacyTournament = (
  databasePath: string
): TournamentSeed | null => {
  if (!existsSync(databasePath)) {
    return null;
  }
  const database = new Database(databasePath, { readonly: true });
  try {
    const tournament = database
      .query<TournamentRow, []>(
        "SELECT created_at FROM tournaments ORDER BY created_at LIMIT 1"
      )
      .get();
    const gameRows = database
      .query<GameRow, []>("SELECT * FROM tournament_games ORDER BY sequence")
      .all();
    if (gameRows.length === 0) {
      return null;
    }
    const getMoves = database.query<MoveRow, [string]>(
      "SELECT * FROM tournament_moves WHERE game_id = ? ORDER BY ply"
    );
    const getModelTurns = database.query<ModelTurnRow, [string]>(
      "SELECT trace_json FROM tournament_model_turns WHERE game_id = ? ORDER BY turn_number"
    );
    const games: TournamentSeed["games"] = gameRows.map((row) => ({
      blackModelId: normalizeModelId(row.black_model_id),
      blackNr: row.black_nr,
      completedAt: row.completed_at,
      error: row.error,
      fen: row.fen,
      group: row.group_name,
      id: row.id,
      modelTurns: getModelTurns
        .all(row.id)
        .map(
          ({ trace_json: traceJson }) => JSON.parse(traceJson) as ModelTurnTrace
        ),
      moves: getMoves.all(row.id).map(mapMove),
      pgn: row.pgn,
      result: row.result,
      revision: row.revision,
      sequence: row.sequence,
      stage: row.stage,
      startedAt: row.started_at,
      status: row.status,
      terminationReason: row.termination_reason,
      thinkingModelId: row.thinking_model_id
        ? normalizeModelId(row.thinking_model_id)
        : null,
      totalCostUsd: row.total_cost_usd,
      totalDurationMs: row.total_duration_ms,
      totalTokens: row.total_tokens,
      whiteModelId: normalizeModelId(row.white_model_id),
      whiteNr: row.white_nr,
      winnerModelId: row.winner_model_id
        ? normalizeModelId(row.winner_model_id)
        : null,
    }));
    return { createdAt: tournament?.created_at, games };
  } finally {
    database.close();
  }
};
