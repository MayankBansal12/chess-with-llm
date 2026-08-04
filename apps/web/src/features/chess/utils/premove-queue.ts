import { Chess, type Square } from "chess.js";
import type { MoveInput } from "../types";

const BOARD_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const BOARD_RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

const chessForPremove = (chess: Chess): Chess => {
  const fenParts = chess.fen().split(" ");
  fenParts[1] = "w";
  fenParts[3] = "-";
  try {
    return new Chess(fenParts.join(" "));
  } catch {
    return chess;
  }
};

export const applySimulatedPremove = (
  board: Chess,
  moveInput: MoveInput
): Chess | null => {
  if (moveInput.from === moveInput.to) {
    return null;
  }
  const candidateBoard = new Chess(board.fen());
  const sourcePiece = candidateBoard.get(moveInput.from);
  if (sourcePiece?.color !== "w") {
    return null;
  }

  const targetPiece = candidateBoard.get(moveInput.to);
  if (targetPiece?.color === "w") {
    candidateBoard.remove(moveInput.to);
  }
  const isPawnDiagonalMove =
    sourcePiece.type === "p" && moveInput.from[0] !== moveInput.to[0];
  if (isPawnDiagonalMove && !candidateBoard.get(moveInput.to)) {
    candidateBoard.put({ color: "b", type: "n" }, moveInput.to);
  }

  try {
    candidateBoard.move({
      ...moveInput,
      promotion:
        moveInput.promotion ??
        (sourcePiece.type === "p" && moveInput.to[1] === "8" ? "q" : undefined),
    });
    return chessForPremove(candidateBoard);
  } catch {
    return null;
  }
};

export const buildPremovePosition = (
  position: Chess,
  premoves: MoveInput[]
): Chess => {
  let simulatedPosition = chessForPremove(position);
  for (const premove of premoves) {
    const nextPosition = applySimulatedPremove(simulatedPosition, premove);
    if (!nextPosition) {
      break;
    }
    simulatedPosition = nextPosition;
  }
  return simulatedPosition;
};

export const getPremoveTargets = (
  board: Chess,
  sourceSquare: Square
): Square[] => {
  const targets: Square[] = [];
  for (const rank of BOARD_RANKS) {
    for (const file of BOARD_FILES) {
      const targetSquare = `${file}${rank}` as Square;
      if (
        applySimulatedPremove(board, {
          from: sourceSquare,
          to: targetSquare,
        })
      ) {
        targets.push(targetSquare);
      }
    }
  }
  return targets;
};
