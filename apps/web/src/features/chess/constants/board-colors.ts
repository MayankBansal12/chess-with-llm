export const BOARD_COLORS = {
  lightSquare: "var(--chess-board-light)",
  darkSquare: "var(--chess-board-dark)",
  selectedSquare: "var(--chess-selected)",
  lastMove: "var(--chess-last-move)",
  validMoveDot: "var(--chess-legal-move)",
  validCapture: "var(--chess-capture)",
  checkHighlight: "var(--chess-check)",
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
