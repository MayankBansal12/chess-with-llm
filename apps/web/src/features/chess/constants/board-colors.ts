export const BOARD_COLORS = {
  lightSquare: "#f0d9b5",
  darkSquare: "#b58863",
  selectedSquare: "#fef08a",
  lastMove: "#bfdbfe",
  validMoveDot: "rgba(0, 0, 0, 0.2)",
} as const;

export const BOARD_CONFIG = {
  maxBoardWidth: 600,
  orientation: "white" as const,
} as const;

// TODO: Add sound effects for move, check, checkmate, draw, invalid move
// Sound files should be placed in /public/sounds/ directory
export const SOUND_FILES = {
  move: "/sounds/move.mp3",
  check: "/sounds/check.mp3",
  checkmate: "/sounds/checkmate.mp3",
  draw: "/sounds/draw.mp3",
  invalid: "/sounds/invalid.mp3",
} as const;
