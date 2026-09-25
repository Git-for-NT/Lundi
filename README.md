# Lundi — AI Chatbot

A full-stack AI chatbot built with React + TypeScript on the frontend and Node.js + Express + TypeScript on the backend. It proxies messages to the OpenAI Chat Completions API and maintains per-session conversation history in server memory.

This project is designed as a **learning project** for experienced engineers exploring AI development. Every file is thoroughly commented to explain not just *what* the code does but *why* it's structured that way — the architectural decisions, the request flow, common mistakes to avoid, and natural next steps.

---

## Table of Contents

1. [Project Purpose](#project-purpose)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Environment Variable Setup](#environment-variable-setup)
5. [Development Commands](#development-commands)
6. [Project Structure](#project-structure)
7. [Architecture Overview](#architecture-overview)
8. [End-to-End Request Flow](#end-to-end-request-flow)
9. [Suggested Learning Extensions](#suggested-learning-extensions)

---

## Project Purpose

Lundi gives you a working, production-quality skeleton for an AI-powered chat application. It covers the full surface area you encounter in real AI integrations:

- **API key management** — keeping secrets out of source control via `.env`
- **Stateful conversations** — accumulating message history so the model has context across turns
- **Session isolation** — multiple browser tabs each get their own independent conversation
- **Typed HTTP contracts** — shared interfaces between client and server prevent drift
- **Error resilience** — every failure mode (bad input, OpenAI errors, network failures) is handled gracefully

The project is intentionally small. Each module does one thing, every boundary is explicit, and the request path from browser keystroke to re-render is linear and traceable. That makes it a good base to extend, experiment with, and break.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 18 or later | Required for the native `crypto.randomUUID()` API and modern ESM support |
| npm | 9 or later | Comes bundled with Node 18+ |
| OpenAI API key | — | Obtain from [platform.openai.com/api-keys](https://platform.openai.com/api-keys). A free-tier account works fine for development. |

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-username/lundi.git
cd lundi

# 2. Install root-level dependencies (provides the `concurrently` script)
npm install

# 3. Install server dependencies
cd server
npm install
cd ..

# 4. Install client dependencies
cd client
npm install
cd ..

# 5. Create your server environment file from the example
cp server/.env.example server/.env
```

Then open `server/.env` and fill in your OpenAI API key (see [Environment Variable Setup](#environment-variable-setup) below).

---

## Environment Variable Setup

All environment variables live in `server/.env`. The file is excluded from source control by `.gitignore` — never commit it.

A template with explanatory comments is provided at `server/.env.example`:

```dotenv
# Required — obtain from https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-...

# Optional — the OpenAI chat model to use (default: gpt-3.5-turbo)
OPENAI_MODEL=gpt-3.5-turbo

# Optional — port the Express server listens on (default: 3001)
PORT=3001
```

### Variable reference

| Variable | Package | Required | Default | Description |
|---|---|---|---|---|
| `OPENAI_API_KEY` | server | **Yes** | — | Secret key that authenticates requests to the OpenAI API. The server will refuse to start if this is absent. |
| `OPENAI_MODEL` | server | No | `gpt-3.5-turbo` | The OpenAI chat model used for completions. Swap in `gpt-4o` or any other Chat Completions-compatible model. |
| `PORT` | server | No | `3001` | The port the Express server listens on. Must match the proxy target in `client/vite.config.ts` if you change it. |

> **Design note:** The server validates `OPENAI_API_KEY` at startup and exits immediately with a clear error message if it's missing. This "fail fast" pattern is preferable to a confusing runtime error the first time a user sends a message.

---

## Development Commands

### Start everything at once (recommended)

```bash
# From the repo root — starts both server and client concurrently
npm run dev
```

This uses [`concurrently`](https://github.com/open-cli-tools/concurrently) to run both processes in the same terminal with colour-coded output. The client is available at `http://localhost:5173`.

### Start individually

```bash
# Server only (port 3001, auto-reloads on file changes via ts-node-dev)
cd server && npm run dev

# Client only (port 5173, Vite HMR)
cd client && npm run dev
```

### Other useful commands

```bash
# Type-check both packages without emitting output
cd server && npm run typecheck
cd client && npm run typecheck

# Lint both packages
cd server && npm run lint
cd client && npm run lint

# Format both packages with Prettier
cd server && npm run format
cd client && npm run format

# Build the server for production
cd server && npm run build

# Build the client for production (outputs to client/dist)
cd client && npm run build
```

---

## Project Structure

```
/
├── package.json                ← Root: concurrently dev script
├── .gitignore                  ← Excludes .env, node_modules, dist
├── README.md                   ← This file
│
├── client/                     ← React + TypeScript + Vite frontend
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json      ← Separate config for Vite config file
│   ├── vite.config.ts          ← Port 5173, /api proxy → localhost:3001
│   ├── .eslintrc.cjs
│   ├── .prettierrc
│   └── src/
│       ├── main.tsx            ← React entry point
│       ├── App.tsx             ← Root component, wires hooks to UI
│       ├── types.ts            ← Shared client-side types (ChatMessage, ApiError, etc.)
│       ├── api/
│       │   └── chat.ts         ← Isolated HTTP layer: fetch + typed error handling
│       ├── hooks/
│       │   ├── useSession.ts   ← Session ID lifecycle (sessionStorage)
│       │   └── useChat.ts      ← Conversation state + request orchestration
│       └── components/
│           ├── ChatWindow.tsx  ← Scrollable message list + loading indicator
│           ├── MessageBubble.tsx ← Single message, role-aware styling
│           └── MessageInput.tsx  ← Text input + send button, disabled while loading
│
└── server/                     ← Node.js + Express + TypeScript backend
    ├── package.json
    ├── tsconfig.json
    ├── .eslintrc.cjs
    ├── .prettierrc
    ├── .env.example            ← Template — copy to .env and fill in secrets
    └── src/
        ├── index.ts            ← Bootstrap: dotenv, env validation, app.listen
        ├── app.ts              ← Express app factory: CORS, JSON, routes
        ├── types.ts            ← Shared server-side types (Message, ChatRequest, etc.)
        ├── routes/
        │   ├── chat.ts         ← POST /api/chat handler
        │   └── health.ts       ← GET /health handler
        ├── services/
        │   └── openai.ts       ← OpenAI SDK wrapper + system prompt
        ├── store/
        │   └── history.ts      ← In-memory Map<sessionId, Message[]>
        └── middleware/
            └── validate.ts     ← validateMessage + validateSessionId middleware
```

---

## Architecture Overview

```
Browser (port 5173)
  │
  │  Vite dev proxy  /api → http://localhost:3001
  │
  ▼
React Client
  ├── src/api/chat.ts           HTTP layer — isolated, no React deps
  ├── src/hooks/useSession.ts   Session ID stored in sessionStorage
  ├── src/hooks/useChat.ts      Conversation state + request orchestration
  └── src/components/
        ├── ChatWindow.tsx      Scrollable message list, auto-scroll
        ├── MessageBubble.tsx   Role-aware bubble styling
        └── MessageInput.tsx    Controlled input, disabled while loading

        │  HTTP POST /api/chat
        │  Body:    { message: "Hello" }
        │  Headers: Content-Type: application/json
        │           X-Session-ID: <uuid v4>
        ▼

Express Server (port 3001)
  ├── src/middleware/validate.ts  Rejects bad input early (400)
  ├── src/store/history.ts        Map<sessionId, Message[]> — in memory
  ├── src/services/openai.ts      OpenAI SDK wrapper
  └── src/routes/chat.ts          Orchestrates: validate → history → OpenAI → respond

        │  HTTPS POST /v1/chat/completions
        │  Body: { model, messages: [system, ...history, userMsg] }
        ▼

OpenAI API (gpt-3.5-turbo by default)
```

### Key design decisions

**Vite proxy instead of a hardcoded API URL**
The client calls `/api/chat` (a relative path). During development Vite proxies that to `http://localhost:3001`. In production a reverse proxy (nginx, an AWS ALB, etc.) can do the same thing. The API module never needs to know the hostname.

**In-memory conversation history**
The server stores message history in a plain `Map`. This is intentionally simple — no database, no serialisation, no migrations. History is lost when the server restarts, which is fine for a learning project. The `history.ts` module is the only place that touches this Map, so swapping in Redis or a database later is a one-file change.

**`sessionStorage` for the session ID**
`sessionStorage` is scoped to a single browser tab and cleared when the tab closes. This mirrors the server's in-memory history: close the tab, lose the conversation. `localStorage` would persist the session ID across tabs and browser restarts, which could cause surprising behaviour when the server has already discarded that session's history.

**Separate `client` and `server` packages**
Each package has its own `package.json`, `tsconfig.json`, ESLint config, and scripts. This keeps dependency trees separate (you don't want React on the server) and means you can develop, lint, build, and deploy each side independently.

**Validation middleware**
Input validation (`validateMessage`, `validateSessionId`) is extracted into its own middleware file rather than living inside the route handler. Each piece is small, independently testable, and easy to extend.

---

## End-to-End Request Flow

```
1.  User types "Hello" and presses Enter
2.  MessageInput calls onSubmit("Hello")
3.  useChat.sendMessage("Hello"):
      a. Appends { id, role: 'user', content: 'Hello' } to messages state
         → ChatWindow re-renders immediately (optimistic update)
      b. Sets isLoading = true  → input + button disabled
      c. Sets error = null
      d. Calls api/chat.sendMessage("Hello", sessionId)

4.  api/chat.ts:
      fetch POST /api/chat
        body:    { "message": "Hello" }
        headers: Content-Type: application/json
                 X-Session-ID: 550e8400-e29b-41d4-a716-446655440000

5.  Vite dev proxy forwards the request to http://localhost:3001/api/chat

6.  Express: validateSessionId middleware
      → Checks X-Session-ID is a valid UUID v4
      → Passes (or returns 400 if invalid)

7.  Express: validateMessage middleware
      → Checks body.message is a non-empty string
      → Passes (or returns 400 if invalid)

8.  chat route handler: getOrCreateHistory(sessionId, SYSTEM_PROMPT)
      → First call for this session:
        initialises history = [{ role: 'system', content: SYSTEM_PROMPT }]

9.  history.appendMessage(sessionId, { role: 'user', content: 'Hello' })
      → history = [{ system }, { user: 'Hello' }]

10. openai.getCompletion(history)
      → POST https://api.openai.com/v1/chat/completions
        { model: "gpt-3.5-turbo", messages: [system, user] }
      → OpenAI returns "Hi! How can I help you today?"

11. history.appendMessage(sessionId, { role: 'assistant', content: 'Hi! ...' })
      → history = [{ system }, { user }, { assistant }]

12. Server responds: 200 { "reply": "Hi! How can I help you today?" }

13. api/chat.ts resolves with "Hi! How can I help you today?"

14. useChat:
      a. Appends { id, role: 'assistant', content: 'Hi! ...' } to messages state
      b. Sets isLoading = false  → input + button re-enabled

15. ChatWindow re-renders with both messages, scrolls to the bottom
```

**On the second message**, step 8 finds the existing history in the Map and returns it — so the OpenAI call receives `[system, user1, assistant1, user2]`, giving the model full context of the conversation.

---

## Suggested Learning Extensions

The codebase is designed to be extended. Here are natural next steps, roughly in order of complexity:

### Streaming responses
Instead of waiting for the full completion, stream tokens back as they're generated using the OpenAI SDK's streaming API. On the server, switch to `stream: true` and pipe the response using Server-Sent Events or `Transfer-Encoding: chunked`. On the client, consume the stream and append tokens to the message bubble in real time. This is how ChatGPT's typing effect works.

### Conversation persistence
Replace the in-memory `Map` in `store/history.ts` with a database (SQLite via `better-sqlite3` is a good starting point — no separate server process). Add a migration to create a `messages` table and update `getOrCreateHistory` and `appendMessage` to read/write from it. History will now survive server restarts.

### Authentication
Add a login flow (start with a hardcoded username/password, then graduate to JWT). Gate the `POST /api/chat` endpoint behind an auth middleware that verifies the token. This also lets you scope conversation history to a user account rather than a browser session.

### Multiple models / model picker
Expose the `OPENAI_MODEL` value (or a list of allowed models) via a `GET /api/config` endpoint. Add a dropdown to the client that lets the user switch models mid-conversation. Note that switching models doesn't change history format — the same `messages` array works with any Chat Completions-compatible model.

### System prompt customisation
Add a settings panel that lets the user write a custom system prompt. Pass it to `getOrCreateHistory` instead of the hardcoded default. Store the custom prompt in `sessionStorage` so it persists across page refreshes.

### Message regeneration
Add a "Regenerate" button on the last assistant message. On click, remove the last assistant message from history, re-send the request, and append the new response. This is a good exercise in immutable state updates and understanding how history length affects OpenAI context.

### Token counting and limits
The OpenAI API has a context window limit (128k tokens for GPT-4o, 16k for GPT-3.5-turbo-16k). Add token counting using the `tiktoken` library and implement a sliding window: when history exceeds a threshold, drop the oldest non-system messages. Always keep the system prompt at index 0.

### Rate limiting
Add the `express-rate-limit` middleware to cap the number of requests per IP per minute. This prevents runaway API costs during development and is a good habit to build before deploying anything publicly.

### Testing
The architecture is already set up for testing. The Express app is exported from `app.ts` as a factory function (no side effects at import time), so you can pass it to `supertest` without starting a real server. The `clearAllHistories()` export from `store/history.ts` lets you reset state between test cases. The `api/chat.ts` module is a pure async function — straightforward to test with a mocked `fetch`.
