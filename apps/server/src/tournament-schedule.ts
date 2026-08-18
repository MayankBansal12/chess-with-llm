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
type TournamentRound = readonly ModelPairing[];

const ROUND_GROUP_ORDERS: readonly (readonly TournamentGroup[])[] = [
  ["A", "B", "B", "A"],
  ["B", "A", "A", "B"],
  ["A", "A", "B", "B"],
  ["A", "B", "A", "B"],
  ["A", "B", "B", "A"],
  ["B", "A", "B", "A"],
];

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

const buildRoundFixtures = (
  round: TournamentRound,
  groupOrder: readonly TournamentGroup[],
  shouldReverseColors: boolean
): Omit<ScheduledTournamentGame, "id" | "sequence">[] => {
  const nextPairingIndex: Record<TournamentGroup, number> = { A: 0, B: 0 };
  return groupOrder.map((group) => {
    const pairing = round[nextPairingIndex[group]];
    nextPairingIndex[group] += 1;
    if (!pairing) {
      throw new Error(`Unable to find the next Group ${group} pairing`);
    }
    return buildFixture(group, pairing, shouldReverseColors);
  });
};

export const buildGroupSchedule = (): ScheduledTournamentGame[] => {
  const games = [false, true].flatMap((shouldReverseColors, legIndex) =>
    ROUND_PAIRINGS.flatMap((round, roundIndex) => {
      const groupOrderIndex = legIndex * ROUND_PAIRINGS.length + roundIndex;
      const groupOrder = ROUND_GROUP_ORDERS[groupOrderIndex];
      if (!groupOrder) {
        throw new Error("Unable to find the tournament round order");
      }
      return buildRoundFixtures(round, groupOrder, shouldReverseColors);
    })
  );

  return games.map((game, index) => {
    const sequence = index + 1;
    return {
      ...game,
      id: `group-game-${sequence.toString().padStart(2, "0")}`,
      sequence,
    };
  });
};
