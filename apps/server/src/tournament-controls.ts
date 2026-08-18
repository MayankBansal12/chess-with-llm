const LOCAL_HOSTNAMES = new Set([
  "0.0.0.0",
  "127.0.0.1",
  "::1",
  "[::1]",
  "localhost",
]);

export const areTournamentControlsEnabled = (
  nodeEnvironment: string | undefined,
  corsOrigin: string
): boolean =>
  nodeEnvironment === "development" &&
  LOCAL_HOSTNAMES.has(new URL(corsOrigin).hostname);
