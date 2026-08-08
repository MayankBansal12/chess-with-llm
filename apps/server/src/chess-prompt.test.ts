import { describe, expect, test } from "bun:test";
import { Chess } from "chess.js";
import {
  buildDrawOfferPrompt,
  buildModelPrompt,
  getModelPosition,
  MODEL_SYSTEM_PROMPT,
} from "./chess-prompt";

describe("chess model prompt", () => {
  test("renders the complete starting board in standard orientation", () => {
    const chess = new Chess();
    const position = getModelPosition(chess);

    expect(position.asciiBoard).toBe(`   +------------------------+
 8 | r  n  b  q  k  b  n  r |
 7 | p  p  p  p  p  p  p  p |
 6 | .  .  .  .  .  .  .  . |
 5 | .  .  .  .  .  .  .  . |
 4 | .  .  .  .  .  .  .  . |
 3 | .  .  .  .  .  .  .  . |
 2 | P  P  P  P  P  P  P  P |
 1 | R  N  B  Q  K  B  N  R |
   +------------------------+
     a  b  c  d  e  f  g  h`);
    expect(buildModelPrompt(position)).toContain(
      "Treat the FEN as the authoritative position"
    );
  });

  test("keeps the PGN and ASCII board synchronized after several moves", () => {
    const chess = new Chess();
    chess.move("e4");
    chess.move("c5");
    chess.move("Nf3");
    const position = getModelPosition(chess);
    const prompt = buildModelPrompt(position);

    expect(position.pgn).toContain("1. e4 c5 2. Nf3");
    expect(position.fen).toBe(
      "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2"
    );
    expect(position.legalMoves).toContainEqual({ san: "Nf6", uci: "g8f6" });
    expect(position.asciiBoard).toContain("5 | .  .  p  .  .  .  .  . |");
    expect(position.asciiBoard).toContain("4 | .  .  .  .  P  .  .  . |");
    expect(position.asciiBoard).toContain("3 | .  .  .  .  .  N  .  . |");
    expect(prompt).toContain(position.pgn);
    expect(prompt).toContain(position.fen);
    expect(prompt).toContain(position.asciiBoard);
    expect(prompt).toContain("Legal moves, formatted as UCI (SAN):");
    expect(prompt).toContain("g8f6 (Nf6)");
    expect(prompt).toContain("Last move: Nf3");
    expect(prompt).toContain("Black in check: no");
    expect(prompt).toContain("Material balance: Equal");
  });

  test("includes the rejected candidate in retry requests", () => {
    const position = getModelPosition(new Chess());

    expect(buildModelPrompt(position, "e7e4")).toContain(
      'Rejected response or illegal move: "e7e4"'
    );
    expect(buildModelPrompt(position, "e7e4")).not.toContain(
      "Your last response was:"
    );
  });

  test("defines piece symbols and ownership before the ASCII board", () => {
    const position = getModelPosition(new Chess());
    const prompt = buildModelPrompt(position);
    const legendIndex = prompt.indexOf("Piece symbols:");
    const boardIndex = prompt.indexOf(
      "ASCII board representation for current position:"
    );

    expect(prompt).not.toContain("Your last response was:");
    expect(prompt).toContain("P/p = pawn");
    expect(prompt).toContain("Lowercase pieces are yours (Black)");
    expect(MODEL_SYSTEM_PROMPT).toContain("lowercase pieces are yours (Black)");
    expect(MODEL_SYSTEM_PROMPT).toContain("Analyze privately");
    expect(MODEL_SYSTEM_PROMPT).toContain("concrete purpose");
    expect(prompt).toContain("assume White will find the strongest reply");
    expect(legendIndex).toBeLessThan(boardIndex);
  });

  test("sends the complete position when White offers a draw", () => {
    const chess = new Chess();
    chess.move("e4");
    chess.move("e5");
    const position = getModelPosition(chess);
    const prompt = buildDrawOfferPrompt(position);

    expect(prompt).toContain(position.fen);
    expect(prompt).toContain(position.pgn);
    expect(prompt).toContain(position.asciiBoard);
    expect(prompt).toContain("White offers a draw");
  });
});
