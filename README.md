# chess-with-llm
Play chess with LLM models

## Features

- **TypeScript** - For type safety and improved developer experience
- **React Router** - Declarative routing for React
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **shadcn/ui** - Reusable UI components
- **Fastify** - Fast, low-overhead web framework
- **Bun** - Runtime environment
- **Biome** - Linting and formatting
- **Husky** - Git hooks for code quality
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
pnpm install
```

Then, run the development server:

```bash
pnpm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).

The server expects the following values in `apps/server/.env`:

```bash
OPENCODE_API_KEY=your_opencode_go_key
CORS_ORIGIN=http://localhost:5173
```

Each match is held in a one-hour in-memory server session. Every model turn
creates a fresh Pi agent session and sends the FEN, full PGN, ASCII board, and
the exact legal UCI moves to the selected OpenCode Go model. The move endpoint
returns the accepted player position immediately while model generation
continues in the server; the browser polls for the completed move. A model that
returns three moves outside the supplied legal list forfeits the match.

## Project Structure

```
chess-with-llm/
├── apps/
│   ├── web/         # Frontend application (React + React Router)
│   └── server/      # Backend API (Fastify)
├── packages/
│   ├── api/         # API layer / business logic
```

## Available Scripts

- `pnpm run dev`: Start all applications in development mode
- `pnpm run build`: Build all applications
- `pnpm run dev:web`: Start only the web application
- `pnpm run dev:server`: Start only the server
- `pnpm run check-types`: Check TypeScript types across all apps
- `pnpm run check`: Run Biome formatting and linting
