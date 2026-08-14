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
  "glm-5.2",
  "kimi-k3",
  "grok-4.5",
  "deepseek-v4-pro",
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

export const randomizeSchedule = <ScheduleItem>(
  items: readonly ScheduleItem[],
  random: () => number = Math.random
): ScheduleItem[] => {
  const randomizedItems = [...items];
  for (let index = randomizedItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const currentItem = randomizedItems[index];
    const swapItem = randomizedItems[swapIndex];
    if (currentItem === undefined || swapItem === undefined) {
      continue;
    }
    randomizedItems[index] = swapItem;
    randomizedItems[swapIndex] = currentItem;
  }
  return randomizedItems;
};

export const buildGroupSchedule = (
  random: () => number = Math.random
): ScheduledTournamentGame[] => {
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

  return randomizeSchedule(games, random).map((game, index) => {
    const sequence = index + 1;
    return {
      ...game,
      id: `group-game-${sequence.toString().padStart(2, "0")}`,
      sequence,
    };
  });
};
