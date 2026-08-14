import type { TournamentGroup } from "./tournament-types";

export const TOURNAMENT_ID = "open-weight-2026";
export const TOURNAMENT_NAME = "Open Weight Tournament";
export const TOURNAMENT_GAME_LIMIT = 3;
export const WIN_POINTS = 10;
export const DRAW_POINTS = 5;

export const PRIMARY_MODEL_IDS = [
  "gpt-5.6-luna",
  "minimax-m3",
  "deepseek-v4-flash",
  "qwen3.8-max",
  "glm-5.2",
  "kimi-k3",
  "grok-4.5",
  "qwen3.7-plus",
  "kimi-k2.6",
  "qwen3.7-max",
] as const;

export const GROUP_MODEL_IDS: Record<TournamentGroup, readonly string[]> = {
  A: PRIMARY_MODEL_IDS.slice(0, 5),
  B: PRIMARY_MODEL_IDS.slice(5, 10),
};

export interface ScheduledTournamentGame {
  blackModelId: string;
  group: TournamentGroup;
  id: string;
  sequence: number;
  whiteModelId: string;
}

const getPairKey = (firstModelId: string, secondModelId: string): string =>
  [firstModelId, secondModelId].sort().join(":");

const INITIAL_TEST_PAIR_KEY = getPairKey("gpt-5.6-luna", "deepseek-v4-flash");

export const buildGroupSchedule = (): ScheduledTournamentGame[] => {
  const games: Omit<ScheduledTournamentGame, "id" | "sequence">[] = [];

  for (const group of ["A", "B"] as const) {
    const modelIds = GROUP_MODEL_IDS[group];
    for (let firstIndex = 0; firstIndex < modelIds.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < modelIds.length;
        secondIndex += 1
      ) {
        const firstModelId = modelIds[firstIndex];
        const secondModelId = modelIds[secondIndex];
        if (!(firstModelId && secondModelId)) {
          continue;
        }
        games.push({
          blackModelId: secondModelId,
          group,
          whiteModelId: firstModelId,
        });
        games.push({
          blackModelId: firstModelId,
          group,
          whiteModelId: secondModelId,
        });
      }
    }
  }

  games.sort((firstGame, secondGame) => {
    const firstIsTestPair =
      getPairKey(firstGame.whiteModelId, firstGame.blackModelId) ===
      INITIAL_TEST_PAIR_KEY;
    const secondIsTestPair =
      getPairKey(secondGame.whiteModelId, secondGame.blackModelId) ===
      INITIAL_TEST_PAIR_KEY;
    if (firstIsTestPair !== secondIsTestPair) {
      return firstIsTestPair ? -1 : 1;
    }
    return firstGame.group.localeCompare(secondGame.group);
  });

  return games.map((game, index) => {
    const sequence = index + 1;
    return {
      ...game,
      id: `group-game-${sequence.toString().padStart(2, "0")}`,
      sequence,
    };
  });
};
