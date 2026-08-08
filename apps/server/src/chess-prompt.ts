import type { Chess, Move, PieceSymbol } from "chess.js";

export const MODEL_SYSTEM_PROMPT =
  'You are playing Black in a real chess game. Maximize your chance of winning against the strongest plausible White replies. In the ASCII board, lowercase pieces are yours (Black) and uppercase pieces belong to White. Analyze the supplied position privately: first identify checks and immediate threats; then examine forcing moves (mates, checks, captures, and threats); compare serious candidates by calculating White\'s strongest response; reject moves that allow mate, hang material, leave pieces undefended, or miss a tactical threat; and use king safety, activity, pawn structure, and endgame prospects to break ties. Choose only from the supplied legal moves. Reply with strict JSON in the form {"move":"g8f6","message":"I develop my knight while attacking White\'s central e4 pawn."}. The move must use UCI notation. The message must be one sentence of at most 120 characters and explain the move\'s concrete purpose in the current position. Analyze privately and expose only the JSON, without markdown.';

export const DRAW_SYSTEM_PROMPT =
  'You are playing Black in a real chess game. In the ASCII board, P/p means pawn, N/n knight, B/b bishop, R/r rook, Q/q queen, and K/k king; lowercase pieces are yours (Black), while uppercase pieces belong to your opponent (White). White has offered a draw. Judge the current position and decide whether to accept. Reply with only strict JSON in the form {"decision":"accept","message":"This position looks balanced."} or {"decision":"decline","message":"I still have chances to play for."}. The message must be one sentence of at most 120 characters. Never include markdown or private chain-of-thought.';

const STARTING_POSITION_PGN = "1. (starting position)";

const PIECE_VALUES: Record<Exclude<PieceSymbol, "k">, number> = {
  b: 3,
  n: 3,
  p: 1,
  q: 9,
  r: 5,
};

export interface ModelLegalMove {
  san: string;
  uci: string;
}

export interface ModelPosition {
  asciiBoard: string;
  castlingRights: string;
  drawStatus: string;
  fen: string;
  isCheck: boolean;
  lastMove: string;
  legalMoves: ModelLegalMove[];
  materialBalance: string;
  pgn: string;
}

const getMaterialBalance = (chess: Chess): string => {
  let balance = 0;
  for (const rank of chess.board()) {
    for (const square of rank) {
      if (!square || square.type === "k") {
        continue;
      }
      const value = PIECE_VALUES[square.type];
      balance += square.color === "w" ? value : -value;
    }
  }
  if (balance === 0) {
    return "Equal";
  }
  return balance > 0 ? `White +${balance}` : `Black +${Math.abs(balance)}`;
};

export const getModelPosition = (
  chess: Chess,
  legalMoves: Move[] = chess.moves({ verbose: true })
): ModelPosition => {
  const fen = chess.fen();
  return {
    asciiBoard: chess.ascii(),
    castlingRights: fen.split(" ")[2] ?? "-",
    drawStatus: `threefold repetition: ${chess.isThreefoldRepetition() ? "claimable" : "no"}; fifty-move rule: ${chess.isDrawByFiftyMoves() ? "claimable" : "no"}`,
    fen,
    isCheck: chess.isCheck(),
    lastMove: chess.history().at(-1) ?? "None (starting position)",
    legalMoves: legalMoves.map((move) => ({
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
    })),
    materialBalance: getMaterialBalance(chess),
    pgn: chess.pgn(),
  };
};

export const buildModelPrompt = (
  position: ModelPosition,
  invalidMove?: string | null
): string => {
  const retryInstruction = invalidMove
    ? `\n\nRejected response or illegal move: "${invalidMove}". Do not repeat it; choose an entry from the legal-move list.`
    : "";
  const legalMoves = position.legalMoves
    .map(({ san, uci }) => `${uci} (${san})`)
    .join(", ");

  return `You are Black and it is your move. Treat the FEN as the authoritative position and assume White will find the strongest reply.\n\nCurrent FEN:\n${position.fen}\n\nCurrent game PGN:\n${position.pgn || STARTING_POSITION_PGN}\n\nPosition facts:\n- Last move: ${position.lastMove}\n- Black in check: ${position.isCheck ? "yes" : "no"}\n- Castling rights: ${position.castlingRights}\n- Material balance: ${position.materialBalance}\n- Draw status: ${position.drawStatus}\n\nPiece symbols: P/p = pawn, N/n = knight, B/b = bishop, R/r = rook, Q/q = queen, and K/k = king. Lowercase pieces are yours (Black); uppercase pieces belong to your opponent (White).\n\nASCII board representation for current position:\n${position.asciiBoard}\n\nLegal moves, formatted as UCI (SAN):\n${legalMoves}${retryInstruction}\n\nPrivately compare the strongest candidates and check the chosen move for White's best tactical reply. Return exactly one legal UCI move and a concrete explanation in the required JSON.`;
};

export const buildDrawOfferPrompt = (
  position: ModelPosition,
  invalidResponse?: string | null
): string => {
  const retryInstruction = invalidResponse
    ? `\n\nYour previous response could not be understood: "${invalidResponse}". Return a valid accept or decline decision.`
    : "";

  return `White offers a draw before making their next move. Decide whether to accept the draw in this exact position.\n\nCurrent FEN:\n${position.fen}\n\nCurrent game PGN:\n${position.pgn || STARTING_POSITION_PGN}\n\nASCII board representation for current position (uppercase = White, lowercase = Black):\n${position.asciiBoard}${retryInstruction}\n\nReturn only the required JSON.`;
};
