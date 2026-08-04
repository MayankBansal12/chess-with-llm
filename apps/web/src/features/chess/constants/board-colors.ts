export const BOARD_COLORS = {
  checkHighlight: "var(--chess-check)",
  darkSquare: "var(--chess-board-dark)",
  lastMove: "var(--chess-last-move)",
  lightSquare: "var(--chess-board-light)",
  premove: "var(--chess-premove)",
  selectedSquare: "var(--chess-selected)",
  validCapture: "var(--chess-capture)",
  validMoveDot: "var(--chess-legal-move)",
} as const;

export const BOARD_CONFIG = {
  orientation: "white" as const,
} as const;

// TODO: Add sound effects for move, check, checkmate, draw, invalid move
// Sound files should be placed in /public/sounds/ directory
export const SOUND_FILES = {
  check: "/sounds/check.mp3",
  checkmate: "/sounds/checkmate.mp3",
  draw: "/sounds/draw.mp3",
  invalid: "/sounds/invalid.mp3",
  move: "/sounds/move.mp3",
} as const;
