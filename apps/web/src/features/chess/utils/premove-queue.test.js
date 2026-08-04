import { describe, expect, it } from "bun:test";
import { Chess } from "chess.js";
import {
  applySimulatedPremove,
  buildPremovePosition,
  getPremoveTargets,
} from "./premove-queue.ts";

const CONDITIONAL_RECAPTURE_FEN = "4k3/8/8/8/3P4/5N2/8/4K3 b - - 0 1";

describe("premove queue", () => {
  it("allows a premove onto a square occupied by the player's own piece", () => {
    const position = buildPremovePosition(
      new Chess(CONDITIONAL_RECAPTURE_FEN),
      []
    );

    expect(getPremoveTargets(position, "f3")).toContain("d4");

    const simulated = applySimulatedPremove(position, {
      from: "f3",
      to: "d4",
    });

    expect(simulated?.get("d4")).toEqual({ color: "w", type: "n" });
    expect(simulated?.get("f3")).toBeUndefined();
  });

  it("builds multiple premoves from the result of the previous premove", () => {
    const simulated = buildPremovePosition(
      new Chess(CONDITIONAL_RECAPTURE_FEN),
      [
        { from: "f3", to: "d4" },
        { from: "d4", to: "f5" },
      ]
    );

    expect(simulated.get("f5")).toEqual({ color: "w", type: "n" });
    expect(simulated.get("d4")).toBeUndefined();
  });
});
