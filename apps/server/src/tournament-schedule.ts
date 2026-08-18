import type { TournamentGroup } from "./tournament-types";

export const TOURNAMENT_ID = "open-weight-2026";
export const TOURNAMENT_NAME = "Open Weight Tournament";
export const WIN_POINTS = 10;
export const DRAW_POINTS = 5;

export const PRIMARY_MODEL_IDS = [
  "gpt-5.6-luna",
  "minimax-m3",
  "deepseek-v4-flash",
  "qwen3.8-max",
  "kimi-k3",
  "grok-4.5",
  "deepseek-v4-pro",
  "glm-5.3",
] as const;

export const GROUP_MODEL_IDS: Record<TournamentGroup, readonly string[]> = {
  A: PRIMARY_MODEL_IDS.slice(0, 4),
  B: PRIMARY_MODEL_IDS.slice(4, 8),
};

export interface ScheduledTournamentGame {
  blackModelId: string;
  group: TournamentGroup;
  id: string;
  sequence: number;
  whiteModelId: string;
}

const ROUND_PAIRINGS = [
  [
    [0, 3],
    [2, 1],
  ],
  [
    [2, 0],
    [3, 1],
  ],
  [
    [0, 1],
    [3, 2],
  ],
] as const;

type ModelPairing = readonly [number, number];

const buildFixture = (
  group: TournamentGroup,
  [whiteIndex, blackIndex]: ModelPairing,
  shouldReverseColors: boolean
): Omit<ScheduledTournamentGame, "id" | "sequence"> => {
  const modelIds = GROUP_MODEL_IDS[group];
  const scheduledWhiteIndex = shouldReverseColors ? blackIndex : whiteIndex;
  const scheduledBlackIndex = shouldReverseColors ? whiteIndex : blackIndex;
  const whiteModelId = modelIds[scheduledWhiteIndex];
  const blackModelId = modelIds[scheduledBlackIndex];
  if (!(whiteModelId && blackModelId)) {
    throw new Error(`Unable to build the Group ${group} schedule`);
  }
  return { blackModelId, group, whiteModelId };
};

export const buildGroupSchedule = (): ScheduledTournamentGame[] => {
  const games: Omit<ScheduledTournamentGame, "id" | "sequence">[] = [];

  for (const shouldReverseColors of [false, true]) {
    for (const round of ROUND_PAIRINGS) {
      for (const pairing of round) {
        for (const group of ["A", "B"] as const) {
          games.push(buildFixture(group, pairing, shouldReverseColors));
        }
      }
    }
  }

  return games.map((game, index) => {
    const sequence = index + 1;
    return {
      ...game,
      id: `group-game-${sequence.toString().padStart(2, "0")}`,
      sequence,
    };
  });
};
