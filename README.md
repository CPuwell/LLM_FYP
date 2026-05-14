# LLM Interactive Story Builder

Final Year Project prototype for building and playing branching interactive stories with LLM-assisted scene generation.

The application lets an author design a story graph, configure world-building information, add player attributes and choice conditions, then play through the story in a player view. Gemini is used to generate scene text, player-facing dynamic descriptions, long-term story memory updates, and optional scene images.

## Features

- Node-based story editor built with React Flow.
- Branching choices with labels, requirements, effects, and single-use options.
- Player mode for testing the story from a player perspective.
- World Bible editor for premise, tone, style guide, characters, and locations.
- Gemini-powered story text generation.
- Dynamic player descriptions based on current node, attributes, and memory.
- Optional image generation for story scenes.
- Long-term story memory summarisation from play events.
- Save/load support for story graphs.
- Story graph analysis for unreachable nodes, dead ends, invalid edges, and cycles.
- Evaluation logs for generation and play-session events.
- Self-check script for core parsing, validation, memory, proxy, and attribute logic.

## Tech Stack

- Frontend: React, Vite, React Flow
- Backend: Node.js, Express
- AI provider: Google Gemini via `@google/generative-ai`
- Tooling: ESLint, custom self-check script

## Project Structure

```text
src/                 React frontend components and client utilities
server/              Backend LLM, prompt, validation, memory, and proxy modules
server.js            Express API server and production static file host
scripts/selfcheck.mjs Lightweight regression checks for core logic
tests/Test.json      Demo story data for manual feature testing
generated/           Runtime generated images, ignored by Git
```

## Requirements

- Node.js 20 or newer
- npm
- Gemini API key

## Environment Variables

Copy `.env.example` to `.env` in the project root, then add your own Gemini API key:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

Optional variables:

```env
PORT=3001
GEMINI_IMAGE_MODEL=imagen-4.0-fast-generate-001
AI_DEBUG=0
```

Frontend API override, if needed:

```env
VITE_API_BASE_URL=http://localhost:3001
```

`AI_DEBUG=1` enables additional backend diagnostics such as prompt output and key fingerprint logging. Keep it disabled for normal demos.

Do not commit a real `.env` file or API key. `.env.example` is safe to commit because it contains placeholders only.

## Installation

```bash
npm install
```

## Development

Run the backend API server:

```bash
npm run dev:server
```

In a second terminal, run the Vite frontend:

```bash
npm run dev
```

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

Vite proxies `/api` and `/generated` requests to the backend during development.

## Production Build

```bash
npm run build
npm start
```

`npm start` runs the Express server. If `dist/` exists, the server also serves the built frontend.

## Checks

Run ESLint:

```bash
npm run lint
```

Run the lightweight self-check script:

```bash
node scripts/selfcheck.mjs
```

The self-check covers:

- AI JSON parsing
- request validation
- World Bible snippet construction
- image proxy validation
- long-term memory JSON parsing
- attribute condition evaluation

## Demo Data

`tests/Test.json` contains a small demo story that exercises:

- player attributes
- choice requirements
- choice effects
- single-use choices
- simple branching and return paths

It can be used as a manual test story when demonstrating the editor and player mode.

## Notes

- `.env`, `generated/`, `dist/`, `node_modules/`, `.vercel/`, and Python cache files are ignored by Git.
- `.env.example` is included as a template for local configuration.
- Generated images are stored locally under `generated/` at runtime.
- Gemini debug endpoints are only enabled when `AI_DEBUG=1`.
- API keys can be provided through the backend `.env` file or entered locally in the frontend API key modal.
- For final source-code submission, exclude generated/runtime folders and dissertation files from the archive.

## FYP Focus

This project explores how LLMs can support interactive narrative authoring by combining graph-based story design with dynamic content generation, world-building context, player-state attributes, and long-term memory.
