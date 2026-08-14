import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  buildGroupSchedule,
  DRAW_POINTS,
  GROUP_MODEL_IDS,
  TOURNAMENT_ID,
  TOURNAMENT_NAME,
  WIN_POINTS,
} from "./tournament-schedule";
import type {
  TournamentGameStatus,
  TournamentGroup,
  TournamentResult,
} from "./tournament-types";

export interface StoredGame {
  blackModelId: string;
  blackNr: number;
  completedAt: number | null;
  error: string | null;
  fen: string;
  group: TournamentGroup | null;
  id: string;
  pgn: string;
  result: TournamentResult | null;
  revision: number;
  sequence: number;
  stage: "final" | "group" | "semifinal";
  startedAt: number | null;
  status: TournamentGameStatus;
  terminationReason: string | null;
  thinkingModelId: string | null;
  totalCostUsd: number;
  totalDurationMs: number;
  totalTokens: number;
  whiteModelId: string;
  whiteNr: number;
  winnerModelId: string | null;
}

export interface StoredMove {
  color: "b" | "w";
  costUsd: number;
  createdAt: number;
  durationMs: number;
  fenAfter: string;
  message: string;
  modelId: string;
  ply: number;
  san: string;
  tokens: number;
  uci: string;
}

export interface StoredStanding {
  draws: number;
  group: TournamentGroup;
  losses: number;
  modelId: string;
  nr: number;
  played: number;
  points: number;
  seed: number;
  wins: number;
}

const RESULT_COLUMNS = {
  draw: "draws",
  loss: "losses",
  win: "wins",
} as const;

const RESULT_POINTS = {
  draw: DRAW_POINTS,
  loss: 0,
  win: WIN_POINTS,
} as const;

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
  stage: StoredGame["stage"];
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

interface StandingRow {
  draws: number;
  group_name: TournamentGroup;
  losses: number;
  model_id: string;
  nr: number;
  played: number;
  points: number;
  seed: number;
  wins: number;
}

const mapGame = (row: GameRow): StoredGame => ({
  blackModelId: row.black_model_id,
  blackNr: row.black_nr,
  completedAt: row.completed_at,
  error: row.error,
  fen: row.fen,
  group: row.group_name,
  id: row.id,
  pgn: row.pgn,
  result: row.result,
  revision: row.revision,
  sequence: row.sequence,
  stage: row.stage,
  startedAt: row.started_at,
  status: row.status,
  terminationReason: row.termination_reason,
  thinkingModelId: row.thinking_model_id,
  totalCostUsd: row.total_cost_usd,
  totalDurationMs: row.total_duration_ms,
  totalTokens: row.total_tokens,
  whiteModelId: row.white_model_id,
  whiteNr: row.white_nr,
  winnerModelId: row.winner_model_id,
});

const mapMove = (row: MoveRow): StoredMove => ({
  color: row.color,
  costUsd: row.cost_usd,
  createdAt: row.created_at,
  durationMs: row.duration_ms,
  fenAfter: row.fen_after,
  message: row.message,
  modelId: row.model_id,
  ply: row.ply,
  san: row.san,
  tokens: row.tokens,
  uci: row.uci,
});

const mapStanding = (row: StandingRow): StoredStanding => ({
  draws: row.draws,
  group: row.group_name,
  losses: row.losses,
  modelId: row.model_id,
  nr: row.nr,
  played: row.played,
  points: row.points,
  seed: row.seed,
  wins: row.wins,
});

export interface CompleteGameInput {
  blackNr: number;
  error: string | null;
  fen: string;
  gameId: string;
  pgn: string;
  result: TournamentResult;
  terminationReason: string;
  whiteNr: number;
  winnerModelId: string | null;
}

export class TournamentStore {
  private readonly database: Database;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }
    this.database = new Database(databasePath, { create: true });
    this.database.exec("PRAGMA journal_mode = WAL;");
    this.database.exec("PRAGMA foreign_keys = ON;");
    this.createSchema();
    this.migrateSchema();
    this.seedTournament();
  }

  close(): void {
    this.database.close();
  }

  private createSchema(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS tournaments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS standings (
        tournament_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        group_name TEXT NOT NULL CHECK(group_name IN ('A', 'B')),
        seed INTEGER NOT NULL,
        played INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0,
        draws INTEGER NOT NULL DEFAULT 0,
        losses INTEGER NOT NULL DEFAULT 0,
        points INTEGER NOT NULL DEFAULT 0,
        nr REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (tournament_id, model_id),
        FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
      );
      CREATE TABLE IF NOT EXISTS tournament_games (
        id TEXT PRIMARY KEY,
        tournament_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        stage TEXT NOT NULL,
        group_name TEXT,
        white_model_id TEXT NOT NULL,
        black_model_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'scheduled',
        result TEXT,
        winner_model_id TEXT,
        termination_reason TEXT,
        pgn TEXT NOT NULL DEFAULT '',
        fen TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0,
        thinking_model_id TEXT,
        started_at INTEGER,
        completed_at INTEGER,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        total_cost_usd REAL NOT NULL DEFAULT 0,
        total_duration_ms INTEGER NOT NULL DEFAULT 0,
        white_nr REAL NOT NULL DEFAULT 0,
        black_nr REAL NOT NULL DEFAULT 0,
        error TEXT,
        FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
      );
      CREATE TABLE IF NOT EXISTS tournament_moves (
        game_id TEXT NOT NULL,
        ply INTEGER NOT NULL,
        model_id TEXT NOT NULL,
        color TEXT NOT NULL,
        uci TEXT NOT NULL,
        san TEXT NOT NULL,
        message TEXT NOT NULL,
        fen_after TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        tokens INTEGER NOT NULL,
        cost_usd REAL NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (game_id, ply),
        FOREIGN KEY (game_id) REFERENCES tournament_games(id)
      );
      CREATE INDEX IF NOT EXISTS tournament_games_status_sequence
        ON tournament_games (tournament_id, status, sequence);
      CREATE TRIGGER IF NOT EXISTS tournament_moves_require_active_game
        BEFORE INSERT ON tournament_moves
        WHEN NOT EXISTS (
          SELECT 1 FROM tournament_games
          WHERE id = NEW.game_id AND status = 'active'
        )
        BEGIN
          SELECT RAISE(ABORT, 'Tournament game is no longer active');
        END;
    `);
  }

  private migrateSchema(): void {
    const standingColumns = this.database
      .query<{ name: string }, []>("PRAGMA table_info(standings)")
      .all();
    if (!standingColumns.some(({ name }) => name === "nr")) {
      this.database.exec(
        "ALTER TABLE standings ADD COLUMN nr REAL NOT NULL DEFAULT 0"
      );
    }
    const gameColumns = this.database
      .query<{ name: string }, []>("PRAGMA table_info(tournament_games)")
      .all();
    if (!gameColumns.some(({ name }) => name === "white_nr")) {
      this.database.exec(
        "ALTER TABLE tournament_games ADD COLUMN white_nr REAL NOT NULL DEFAULT 0"
      );
    }
    if (!gameColumns.some(({ name }) => name === "black_nr")) {
      this.database.exec(
        "ALTER TABLE tournament_games ADD COLUMN black_nr REAL NOT NULL DEFAULT 0"
      );
    }
  }

  private seedTournament(): void {
    const insertTournament = this.database.prepare(
      "INSERT OR IGNORE INTO tournaments (id, name, created_at) VALUES (?, ?, ?)"
    );
    const insertStanding = this.database.prepare(`
      INSERT OR IGNORE INTO standings
        (tournament_id, model_id, group_name, seed)
      VALUES (?, ?, ?, ?)
    `);
    const insertGame = this.database.prepare(`
      INSERT OR IGNORE INTO tournament_games
        (id, tournament_id, sequence, stage, group_name, white_model_id, black_model_id, fen)
      VALUES (?, ?, ?, 'group', ?, ?, ?, 'start')
    `);

    const seed = this.database.transaction(() => {
      insertTournament.run(TOURNAMENT_ID, TOURNAMENT_NAME, Date.now());
      for (const group of ["A", "B"] as const) {
        const modelIds = GROUP_MODEL_IDS[group];
        for (const [index, modelId] of modelIds.entries()) {
          insertStanding.run(TOURNAMENT_ID, modelId, group, index + 1);
        }
      }
      for (const game of buildGroupSchedule()) {
        insertGame.run(
          game.id,
          TOURNAMENT_ID,
          game.sequence,
          game.group,
          game.whiteModelId,
          game.blackModelId
        );
      }
    });
    seed();
  }

  getGames(): StoredGame[] {
    const rows = this.database
      .query<GameRow, [string]>(
        "SELECT * FROM tournament_games WHERE tournament_id = ? ORDER BY sequence"
      )
      .all(TOURNAMENT_ID);
    return rows.map(mapGame);
  }

  getGame(gameId: string): StoredGame | null {
    const row = this.database
      .query<GameRow, [string]>("SELECT * FROM tournament_games WHERE id = ?")
      .get(gameId);
    return row ? mapGame(row) : null;
  }

  getMoves(gameId: string): StoredMove[] {
    const rows = this.database
      .query<MoveRow, [string]>(
        "SELECT * FROM tournament_moves WHERE game_id = ? ORDER BY ply"
      )
      .all(gameId);
    return rows.map(mapMove);
  }

  getStandings(): StoredStanding[] {
    const rows = this.database
      .query<StandingRow, [string]>(
        "SELECT * FROM standings WHERE tournament_id = ? ORDER BY group_name, points DESC, nr DESC, wins DESC, seed"
      )
      .all(TOURNAMENT_ID);
    return rows.map(mapStanding);
  }

  startNextGame(): StoredGame {
    const start = this.database.transaction(() => {
      const activeGame = this.database
        .query<{ id: string }, [string]>(
          "SELECT id FROM tournament_games WHERE tournament_id = ? AND status = 'active' LIMIT 1"
        )
        .get(TOURNAMENT_ID);
      if (activeGame) {
        throw new Error("A tournament game is already running");
      }

      const nextGame = this.database
        .query<{ id: string }, [string]>(
          "SELECT id FROM tournament_games WHERE tournament_id = ? AND status = 'scheduled' ORDER BY sequence LIMIT 1"
        )
        .get(TOURNAMENT_ID);
      if (!nextGame) {
        throw new Error("No scheduled tournament games remain");
      }
      this.database
        .query(
          "UPDATE tournament_games SET status = 'active', started_at = ?, revision = revision + 1 WHERE id = ?"
        )
        .run(Date.now(), nextGame.id);
      return nextGame.id;
    });

    const gameId = start();
    const game = this.getGame(gameId);
    if (!game) {
      throw new Error("The next tournament game could not be loaded");
    }
    return game;
  }

  setThinkingModel(gameId: string, modelId: string | null): void {
    this.database
      .query(
        "UPDATE tournament_games SET thinking_model_id = ?, revision = revision + 1 WHERE id = ? AND status = 'active'"
      )
      .run(modelId, gameId);
  }

  recordMove(gameId: string, move: StoredMove, pgn: string, fen: string): void {
    const record = this.database.transaction(() => {
      const activeGame = this.database
        .query<{ id: string }, [string]>(
          "SELECT id FROM tournament_games WHERE id = ? AND status = 'active'"
        )
        .get(gameId);
      if (!activeGame) {
        throw new Error("Tournament game is no longer active");
      }
      this.database
        .query(`
          INSERT INTO tournament_moves
            (game_id, ply, model_id, color, uci, san, message, fen_after, duration_ms, tokens, cost_usd, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          gameId,
          move.ply,
          move.modelId,
          move.color,
          move.uci,
          move.san,
          move.message,
          move.fenAfter,
          move.durationMs,
          move.tokens,
          move.costUsd,
          move.createdAt
        );
      this.database
        .query(`
          UPDATE tournament_games
          SET pgn = ?, fen = ?, thinking_model_id = NULL,
              total_tokens = total_tokens + ?,
              total_cost_usd = total_cost_usd + ?,
              total_duration_ms = total_duration_ms + ?,
              revision = revision + 1
          WHERE id = ? AND status = 'active'
        `)
        .run(pgn, fen, move.tokens, move.costUsd, move.durationMs, gameId);
    });
    record();
  }

  recordUsage(
    gameId: string,
    metrics: {
      totalCostUsd: number;
      totalDurationMs: number;
      totalTokens: number;
    }
  ): void {
    this.database
      .query(`
        UPDATE tournament_games
        SET total_tokens = total_tokens + ?,
            total_cost_usd = total_cost_usd + ?,
            total_duration_ms = total_duration_ms + ?,
            revision = revision + 1
        WHERE id = ? AND status = 'active'
      `)
      .run(
        metrics.totalTokens,
        metrics.totalCostUsd,
        metrics.totalDurationMs,
        gameId
      );
  }

  completeGame(input: CompleteGameInput): void {
    const complete = this.database.transaction(() => {
      const game = this.getGame(input.gameId);
      if (!game || game.status === "completed") {
        return;
      }
      this.database
        .query(`
          UPDATE tournament_games
          SET status = 'completed', result = ?, winner_model_id = ?,
              termination_reason = ?, pgn = ?, fen = ?, thinking_model_id = NULL,
              completed_at = ?, error = ?, white_nr = ?, black_nr = ?,
              revision = revision + 1
          WHERE id = ?
        `)
        .run(
          input.result,
          input.winnerModelId,
          input.terminationReason,
          input.pgn,
          input.fen,
          Date.now(),
          input.error,
          input.whiteNr,
          input.blackNr,
          input.gameId
        );

      if (input.result === "draw") {
        this.applyStandingResult(game.whiteModelId, "draw", input.whiteNr);
        this.applyStandingResult(game.blackModelId, "draw", input.blackNr);
        return;
      }
      const winnerModelId =
        input.result === "white" ? game.whiteModelId : game.blackModelId;
      const loserModelId =
        input.result === "white" ? game.blackModelId : game.whiteModelId;
      this.applyStandingResult(
        winnerModelId,
        "win",
        winnerModelId === game.whiteModelId ? input.whiteNr : input.blackNr
      );
      this.applyStandingResult(
        loserModelId,
        "loss",
        loserModelId === game.whiteModelId ? input.whiteNr : input.blackNr
      );
    });
    complete();
  }

  private applyStandingResult(
    modelId: string,
    result: "draw" | "loss" | "win",
    nr: number
  ): void {
    const points = RESULT_POINTS[result];
    const column = RESULT_COLUMNS[result];
    this.database
      .query(`
        UPDATE standings
        SET played = played + 1, ${column} = ${column} + 1,
            points = points + ?, nr = nr + ?
        WHERE tournament_id = ? AND model_id = ?
      `)
      .run(points, nr, TOURNAMENT_ID, modelId);
  }
}
