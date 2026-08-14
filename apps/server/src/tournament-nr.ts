import type { Chess } from "chess.js";
import type { TournamentResult } from "./tournament-types";

const PIECE_VALUES = {
  b: 3,
  k: 0,
  n: 3,
  p: 1,
  q: 9,
  r: 5,
} as const;
const TOTAL_STARTING_MATERIAL = 39;
const NR_PRECISION = 1000;

export interface TournamentNr {
  blackNr: number;
  whiteNr: number;
}

const roundNr = (value: number): number => {
  const rounded = Math.round(value * NR_PRECISION);
  return rounded === 0 ? 0 : rounded / NR_PRECISION;
};

const getWhiteMaterialAdvantage = (chess: Chess): number => {
  let advantage = 0;
  for (const rank of chess.board()) {
    for (const piece of rank) {
      if (piece) {
        const value = PIECE_VALUES[piece.type];
        advantage += piece.color === "w" ? value : -value;
      }
    }
  }
  return advantage;
};

export const calculateTournamentNr = (
  chess: Chess,
  result: TournamentResult,
  isInfrastructureDraw = false
): TournamentNr => {
  if (isInfrastructureDraw) {
    return { blackNr: 0, whiteNr: 0 };
  }
  const whiteAdvantage = getWhiteMaterialAdvantage(chess);
  if (result === "draw") {
    const whiteNr = roundNr(-whiteAdvantage / (TOTAL_STARTING_MATERIAL * 2));
    return { blackNr: -whiteNr, whiteNr };
  }
  if (result === "white") {
    const nr = roundNr(
      1 + Math.max(0, whiteAdvantage) / TOTAL_STARTING_MATERIAL
    );
    return { blackNr: -nr, whiteNr: nr };
  }
  const nr = roundNr(
    1 + Math.max(0, -whiteAdvantage) / TOTAL_STARTING_MATERIAL
  );
  return { blackNr: nr, whiteNr: -nr };
};
