import { describe, expect, test } from "bun:test";
import { areTournamentControlsEnabled } from "./tournament-controls";

describe("tournament controls", () => {
  test("allows controls for a local development server", () => {
    expect(
      areTournamentControlsEnabled("development", "http://localhost:5173")
    ).toBe(true);
    expect(
      areTournamentControlsEnabled("development", "http://127.0.0.1:5173")
    ).toBe(true);
  });

  test("denies controls outside development", () => {
    expect(
      areTournamentControlsEnabled("production", "http://localhost:5173")
    ).toBe(false);
    expect(
      areTournamentControlsEnabled(undefined, "http://localhost:5173")
    ).toBe(false);
  });

  test("denies controls for a non-local client origin", () => {
    expect(
      areTournamentControlsEnabled("development", "https://chess.example.com")
    ).toBe(false);
  });
});
