import type {
  ChessModel,
  GameSnapshot,
  MoveInput,
} from "@/features/chess/types";

const serverUrl = (
  import.meta.env.VITE_SERVER_URL as string | undefined
)?.replace(/\/$/, "");
const apiUrl = (path: string): string => `${serverUrl ?? ""}${path}`;

const getErrorMessage = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string") {
      return body.message;
    }
  } catch {
    // Fall through to a status-based message for non-JSON responses.
  }
  return `Request failed (${response.status})`;
};

const request = async <ResponseBody>(
  path: string,
  options?: RequestInit
): Promise<ResponseBody> => {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }
  return (await response.json()) as ResponseBody;
};

export const getModels = async (): Promise<ChessModel[]> => {
  const response = await request<{ models: ChessModel[] }>("/api/models");
  return response.models;
};

export const createGame = async (
  playerName: string,
  modelId: string
): Promise<GameSnapshot> =>
  request<GameSnapshot>("/api/games", {
    body: JSON.stringify({ modelId, playerName }),
    method: "POST",
  });

export const getGame = async (gameId: string): Promise<GameSnapshot> =>
  request<GameSnapshot>(`/api/games/${encodeURIComponent(gameId)}`);

export const playMove = async (
  gameId: string,
  move: MoveInput
): Promise<GameSnapshot> =>
  request<GameSnapshot>(`/api/games/${encodeURIComponent(gameId)}/moves`, {
    body: JSON.stringify(move),
    method: "POST",
  });
