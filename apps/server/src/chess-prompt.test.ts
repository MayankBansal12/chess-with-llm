import { describe, expect, test } from "bun:test";
import { Chess } from "chess.js";
import { buildModelPrompt, getModelPosition } from "./chess-prompt";

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
      "You are Black and it is your move. Choose the best move in this position."
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
    expect(position.asciiBoard).toContain("5 | .  .  p  .  .  .  .  . |");
    expect(position.asciiBoard).toContain("4 | .  .  .  .  P  .  .  . |");
    expect(position.asciiBoard).toContain("3 | .  .  .  .  .  N  .  . |");
    expect(prompt).toContain(position.pgn);
    expect(prompt).toContain(position.asciiBoard);
    expect(prompt).not.toContain("Legal moves");
  });

  test("includes the rejected candidate in retry requests", () => {
    const position = getModelPosition(new Chess());

    expect(buildModelPrompt(position, "e7e4")).toContain(
      'previous response produced the illegal move "e7e4"'
    );
  });
});
