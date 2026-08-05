import type {
  ChessModel,
  GameSnapshot,
  MoveInput,
} from "@/features/chess/types";

const serverUrl = (
  import.meta.env.VITE_SERVER_URL as string | undefined
)?.replace(/\/$/, "");
const apiUrl = (path: string): string => `${serverUrl ?? ""}${path}`;
const withDiagnosticsQuery = (
  path: string,
  includeDiagnostics: boolean
): string => (includeDiagnostics ? `${path}?debug=true` : path);

export class ApiRequestError extends Error {
  game?: GameSnapshot;
  status?: number;

  constructor(message: string, game?: GameSnapshot, status?: number) {
    super(message);
    this.name = "ApiRequestError";
    this.game = game;
    this.status = status;
  }
}

const getRequestError = async (
  response: Response
): Promise<ApiRequestError> => {
  try {
    const body = (await response.json()) as {
      game?: GameSnapshot;
      message?: unknown;
    };
    if (typeof body.message === "string") {
      return new ApiRequestError(body.message, body.game, response.status);
    }
  } catch {
    // Fall through to a status-based message for non-JSON responses.
  }
  return new ApiRequestError(
    `Request failed (${response.status})`,
    undefined,
    response.status
  );
};

const request = async <ResponseBody>(
  path: string,
  options?: RequestInit
): Promise<ResponseBody> => {
  const headers = new Headers(options?.headers);
  if (options?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(apiUrl(path), {
    ...options,
    headers,
  });
  if (!response.ok) {
    throw await getRequestError(response);
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

export const getGame = async (
  gameId: string,
  includeDiagnostics = false
): Promise<GameSnapshot> =>
  request<GameSnapshot>(
    withDiagnosticsQuery(
      `/api/games/${encodeURIComponent(gameId)}`,
      includeDiagnostics
    )
  );

export const playMove = async (
  gameId: string,
  move: MoveInput,
  includeDiagnostics = false
): Promise<GameSnapshot> =>
  request<GameSnapshot>(
    withDiagnosticsQuery(
      `/api/games/${encodeURIComponent(gameId)}/moves`,
      includeDiagnostics
    ),
    {
      body: JSON.stringify(move),
      method: "POST",
    }
  );

export const offerDraw = async (
  gameId: string,
  includeDiagnostics = false
): Promise<GameSnapshot> =>
  request<GameSnapshot>(
    withDiagnosticsQuery(
      `/api/games/${encodeURIComponent(gameId)}/draw-offer`,
      includeDiagnostics
    ),
    { method: "POST" }
  );

export const resignGame = async (
  gameId: string,
  includeDiagnostics = false
): Promise<GameSnapshot> =>
  request<GameSnapshot>(
    withDiagnosticsQuery(
      `/api/games/${encodeURIComponent(gameId)}/resign`,
      includeDiagnostics
    ),
    { method: "POST" }
  );
