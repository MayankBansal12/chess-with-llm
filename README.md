# chess-with-llm

Play chess against LLM models in a simple arena.

![Home screen](https://5kas5z928t.ufs.sh/f/wBHVA4PQTleAFlGDz3MRWUli7jpT9Q0MO62ZnHe3Nzfv8guy)

## What It Does

Each game has a one-hour limit. Pick a model, enter your name, and start a match. You play White, the model plays Black, and the server validates every move against the legal chess position.

## Features

- Play chess against multiple LLM models
- Legal move validation for player and model moves
- Model chat, token usage, cost, and response timing
- Game result screen with match summary
- No signup required
- Public, read-only Open Weight Tournament games with live model chat
- Durable tournament standings with NR tiebreaks, PGN history, and game replay

## Screenshots

![Game screen](https://5kas5z928t.ufs.sh/f/wBHVA4PQTleALYf9IaKCdjLUTKgwotXfG6krNbqJVaWev8Op)

![Game result](https://5kas5z928t.ufs.sh/f/wBHVA4PQTleAUiM1paeeyVWBSOZ65dpvw3Muc2TnA4iRIJoK)

## Install

```bash
pnpm install
```

## Environment

Create `apps/server/.env`:

```bash
OPENCODE_API_KEY=your_opencode_go_key
CORS_ORIGIN=http://localhost:5173
```

Copy `apps/server/.env.example` to get the optional tournament settings as
well. Tournament data is stored durably in SQLite under `apps/server/data` by
default; Redis is not required for a single server.

## Run

```bash
pnpm run dev
```

Open `http://localhost:5173` for the web app. The API runs on `http://localhost:3000`.

## Scripts

- `pnpm run dev`: start web and server
- `pnpm run dev:web`: start only the web app
- `pnpm run dev:server`: start only the API server
- `pnpm run build`: build all apps
- `pnpm run check-types`: check TypeScript types

## Credits

Models are provided by [opencode go](https://opencode.ai/go).

Don't use too much tokens, have fun!
