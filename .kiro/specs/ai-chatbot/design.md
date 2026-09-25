# Design Document

## AI Chatbot — Full-Stack Architecture

---

## Overview

The AI Chatbot is a full-stack monorepo application. A React + TypeScript + Vite frontend (`client/`, port 5173) communicates with a Node.js + Express + TypeScript backend (`server/`, port 3001), which proxies requests to the OpenAI Chat Completions API and maintains per-session conversation history in process memory.

The design prioritises clarity and learnability: every architectural boundary is explicit, the request path is linear and traceable, and all side effects are isolated to a small set of well-named modules.

---

## Architecture

```
Browser (port 5173)
  │
  │  Vite dev proxy  /api → http://localhost:3001
  │
  ▼
React Client
  ├── src/api/chat.ts          (HTTP layer — isolated API module)
  ├── src/hooks/useSession.ts  (session ID lifecycle)
  ├── src/hooks/useChat.ts     (conversation state + request orchestration)
  └── src/components/
        ├── ChatWindow.tsx     (message list + auto-scroll)
        ├── MessageBubble.tsx  (single message, role-aware styling)
        └── MessageInput.tsx   (input + send button, loading state)

        │  HTTP POST /api/chat  {message}  X-Session-ID: <uuid>
        ▼

Express Server (port 3001)
  ├── src/index.ts             (app bootstrap, env validation, server start)
  ├── src/app.ts               (Express app factory — CORS, JSON, routes)
  ├── src/routes/chat.ts       (route handler — validates, orchestrates)
  ├── src/services/openai.ts   (OpenAI SDK wrapper)
  └── src/store/history.ts     (in-memory Map<sessionId, Message[]>)

        │  HTTPS  POST /v1/chat/completions
        ▼

OpenAI API (gpt-3.5-turbo)
```

---

## Monorepo Structure

```
/
├── package.json            ← root: concurrently scripts
├── .gitignore
├── README.md
├── client/
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts      ← port 5173, /api proxy
│   ├── .eslintrc.cjs
│   ├── .prettierrc
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/
│       │   └── chat.ts
│       ├── hooks/
│       │   ├── useSession.ts
│       │   └── useChat.ts
│       ├── components/
│       │   ├── ChatWindow.tsx
│       │   ├── MessageBubble.tsx
│       │   └── MessageInput.tsx
│       └── types.ts
└── server/
    ├── package.json
    ├── tsconfig.json
    ├── .eslintrc.cjs
    ├── .prettierrc
    ├── .env.example
    └── src/
        ├── index.ts
        ├── app.ts
        ├── routes/
        │   ├── chat.ts
        │   └── health.ts
        ├── services/
        │   └── openai.ts
        ├── store/
        │   └── history.ts
        ├── middleware/
        │   └── validate.ts
        └── types.ts
```

---

## Components and Interfaces

### Shared Types (`server/src/types.ts`, `client/src/types.ts`)

```typescript
// Mirrors the OpenAI ChatCompletionMessageParam shape
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Client-side chat message (includes a local id for React keys)
export interface ChatMessage {
  id: string;           // crypto.randomUUID() — client-side only
  role: 'user' | 'assistant';
  content: string;
}

// POST /api/chat request body
export interface ChatRequest {
  message: string;
}

// POST /api/chat success response
export interface ChatResponse {
  reply: string;
}

// POST /api/chat error response (and all error responses)
export interface ErrorResponse {
  error: string;
}

// Typed error thrown by the API module on non-2xx responses
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
```

---

### Server: `src/index.ts` — Bootstrap

Responsibilities:
- Load `.env` with `dotenv/config`
- Validate `OPENAI_API_KEY` — exit with code `1` and a descriptive message if absent
- Read `PORT` (default `3001`) and `OPENAI_MODEL` (default `gpt-3.5-turbo`)
- Import and start the Express app

```typescript
import 'dotenv/config';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('FATAL: OPENAI_API_KEY is not set. Add it to server/.env');
  process.exit(1);
}

const PORT = process.env.PORT ?? '3001';
const app = createApp();
app.listen(Number(PORT), () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
```

---

### Server: `src/app.ts` — Express App Factory

Responsibilities:
- Apply `cors` middleware (origin `http://localhost:5173`, allowed headers and methods)
- Apply `express.json()` body parser
- Mount `/api/chat` and `/health` routers
- Export the app instance (enables testing without starting the network listener)

```typescript
export function createApp(): Express {
  const app = express();
  app.use(cors({
    origin: 'http://localhost:5173',
    allowedHeaders: ['Content-Type', 'X-Session-ID'],
    methods: ['GET', 'POST'],
  }));
  app.use(express.json());
  app.use('/api', chatRouter);
  app.use(healthRouter);
  return app;
}
```

---

### Server: `src/middleware/validate.ts` — Request Validation

Two middleware functions used by the chat route:

- `validateMessage(req, res, next)` — checks `req.body.message` is a non-empty string, returns `400` if not
- `validateSessionId(req, res, next)` — checks `req.headers['x-session-id']` is a valid UUID v4 (regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`), returns `400` if not

Separating validation from the route handler keeps each piece small and independently testable.

---

### Server: `src/store/history.ts` — Conversation History

```typescript
// The single source of truth for all session histories.
// Keyed by Session ID (UUID v4 string).
const histories = new Map<string, Message[]>();

export function getOrCreateHistory(sessionId: string, systemPrompt: string): Message[] {
  if (!histories.has(sessionId)) {
    histories.set(sessionId, [{ role: 'system', content: systemPrompt }]);
  }
  return histories.get(sessionId)!;
}

export function appendMessage(sessionId: string, message: Message): void {
  histories.get(sessionId)?.push(message);
}

// Exported for testing — allows resetting state between test runs
export function clearAllHistories(): void {
  histories.clear();
}
```

The system prompt is injected when the history is first created, ensuring it is always the first message in any OpenAI API call for that session.

---

### Server: `src/services/openai.ts` — OpenAI Integration

```typescript
import OpenAI from 'openai';

const client = new OpenAI(); // reads OPENAI_API_KEY from process.env automatically

const SYSTEM_PROMPT = `You are a helpful, concise, and friendly AI assistant.
You answer questions clearly and admit when you don't know something.`;

export { SYSTEM_PROMPT };

export async function getCompletion(messages: Message[]): Promise<string> {
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-3.5-turbo',
    messages,
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI');
  return content;
}
```

The function receives the full `messages` array (history + new user message) and returns just the assistant's reply string. Throwing on an empty response ensures the route handler always has a defined string to work with.

---

### Server: `src/routes/chat.ts` — Route Handler

```
POST /api/chat
  1. validateSessionId middleware → 400 if invalid
  2. validateMessage middleware   → 400 if invalid
  3. getOrCreateHistory(sessionId, SYSTEM_PROMPT)
  4. appendMessage(sessionId, { role: 'user', content: message })
  5. getCompletion(history)
     ├── OpenAI error  → log + 502 { error: "Failed to get a response from the AI service" }
     └── success       → appendMessage(sessionId, { role: 'assistant', content: reply })
                          → 200 { reply }
  6. Unexpected error (catch-all) → log + 500 { error: "An unexpected error occurred" }
```

Appending the user message to history *before* calling OpenAI satisfies Requirement 3.5 and ensures the context is correct even if the process crashes mid-call.

---

### Client: `src/hooks/useSession.ts` — Session ID Lifecycle

```typescript
// Called once at app mount.
export function useSession(): string {
  const [sessionId] = useState<string>(() => {
    const stored = sessionStorage.getItem('chatSessionId');
    if (stored) return stored;
    const id = crypto.randomUUID();
    sessionStorage.setItem('chatSessionId', id);
    return id;
  });
  return sessionId;
}
```

`sessionStorage` (not `localStorage`) is intentional: the ID is scoped to the browser tab and cleared when the tab closes, giving each new tab a fresh conversation — mirroring the server's in-memory history which is also tab-scoped from the user's perspective.

---

### Client: `src/api/chat.ts` — Isolated API Module

```typescript
export async function sendMessage(
  message: string,
  sessionId: string,
): Promise<string> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-ID': sessionId,
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    const body: ErrorResponse = await response.json();
    throw new ApiError(response.status, body.error ?? 'Unknown error');
  }

  const data: ChatResponse = await response.json();
  return data.reply;
}
```

The module has no dependency on React state; it is a pure async function. This makes it straightforward to unit-test with a mocked `fetch`.

The `/api/chat` path (no hostname) works in development because Vite proxies `/api` to `http://localhost:3001`. In a production build the same path would be served by whatever reverse proxy sits in front of both the static assets and the API server.

---

### Client: `src/hooks/useChat.ts` — Conversation State

State shape:
```typescript
interface UseChatState {
  messages: ChatMessage[];   // display list
  isLoading: boolean;        // true while awaiting reply
  error: string | null;      // last error message, null otherwise
}
```

Key behaviours:
- `sendMessage(text)` appends the user message to `messages` immediately (optimistic), sets `isLoading: true`, clears `error`
- On success: appends assistant message, sets `isLoading: false`
- On error: sets `error` to a human-readable string, sets `isLoading: false` (the user's message remains in the list so context is not lost)
- Uses `useRef<HTMLDivElement>` passed down to `ChatWindow` for auto-scroll

---

### Client: Components

**`ChatWindow.tsx`**
- Renders a scrollable `<div>` containing a `<MessageBubble>` for each message
- Calls `listEndRef.current.scrollIntoView({ behavior: 'smooth' })` in a `useEffect` triggered by `messages.length`
- Renders a "Thinking…" indicator bubble when `isLoading` is true

**`MessageBubble.tsx`**
- Accepts `{ role, content }`
- User messages: right-aligned, blue background
- Assistant messages: left-aligned, grey background
- Role label (`You` / `Assistant`) shown above each bubble

**`MessageInput.tsx`**
- Controlled input bound to local `value` state
- Submit on Enter (`onKeyDown`) or button click
- `disabled` and `aria-disabled` set to `true` while `isLoading`
- Calls `onSubmit(value)` then clears local state

---

## Data Models

### Conversation History (Server)

```
Map<sessionId: string, Message[]>

Message = { role: 'system' | 'user' | 'assistant', content: string }

Example after 2 user turns:
[
  { role: 'system',    content: 'You are a helpful...' },
  { role: 'user',      content: 'Hello!' },
  { role: 'assistant', content: 'Hi! How can I help?' },
  { role: 'user',      content: 'What is TypeScript?' },
  { role: 'assistant', content: 'TypeScript is...' },
]
```

The full array is passed as `messages` to every OpenAI API call, giving the model complete context of the conversation.

### Session ID

- Format: UUID v4 (`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`)
- Generated by: `crypto.randomUUID()` (Web Crypto API, available in all modern browsers)
- Stored in: `sessionStorage` under key `chatSessionId`
- Transmitted via: `X-Session-ID` HTTP header on every `POST /api/chat` request

---

## Request Flow (End to End)

```
1. User types "Hello" and presses Enter
2. MessageInput calls onSubmit("Hello")
3. useChat.sendMessage("Hello"):
     a. Appends { id, role: 'user', content: 'Hello' } to messages state
     b. Sets isLoading = true, error = null
     c. Calls api/chat.sendMessage("Hello", sessionId)
4. api/chat.ts:
     a. fetch POST /api/chat  body: { message: "Hello" }
                              headers: Content-Type, X-Session-ID
5. Vite proxy forwards to http://localhost:3001/api/chat
6. Express validates X-Session-ID header (UUID v4 check)
7. Express validates message body (non-empty string check)
8. history.getOrCreateHistory(sessionId, SYSTEM_PROMPT)
     → first call: initialises [ { role:'system', content: SYSTEM_PROMPT } ]
9. history.appendMessage(sessionId, { role:'user', content:'Hello' })
10. openai.getCompletion(history)
     → POST https://api.openai.com/v1/chat/completions
     → returns "Hi! How can I help you?"
11. history.appendMessage(sessionId, { role:'assistant', content:'Hi! ...' })
12. Server responds 200 { reply: "Hi! How can I help you?" }
13. api/chat.ts resolves with "Hi! How can I help you?"
14. useChat: appends assistant message, sets isLoading = false
15. ChatWindow re-renders, scrolls to bottom
```

---

## Error Handling

| Scenario | Server Response | Client Behaviour |
|---|---|---|
| Missing or empty `message` | 400 `{ error: "message is required..." }` | `ApiError(400, ...)` caught, `error` state set, displayed in chat |
| Invalid `X-Session-ID` | 400 `{ error: "X-Session-ID header..." }` | `ApiError(400, ...)` caught, displayed |
| OpenAI API error | 502 `{ error: "Failed to get a response from the AI service" }` | `ApiError(502, ...)` caught, displayed |
| Unexpected server error | 500 `{ error: "An unexpected error occurred" }` | `ApiError(500, ...)` caught, displayed |
| Network failure (no response) | — | `fetch` rejects, caught in `useChat`, generic error displayed |

The client never crashes on error — `useChat` wraps every call in `try/catch` and updates `error` state rather than propagating the exception.

---

## Environment Variables

| Variable | Package | Required | Default | Purpose |
|---|---|---|---|---|
| `OPENAI_API_KEY` | server | Yes | — | Authenticates requests to the OpenAI API |
| `OPENAI_MODEL` | server | No | `gpt-3.5-turbo` | Selects the OpenAI chat model |
| `PORT` | server | No | `3001` | Port the Express server listens on |

---

## Configuration Files

### `client/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forward all /api requests to the Express server.
      // This avoids hardcoding http://localhost:3001 in the API module
      // and means the same relative paths work in production with a reverse proxy.
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

### `server/.env.example`

```dotenv
# Required — obtain from https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-...

# Optional — the OpenAI chat model to use (default: gpt-3.5-turbo)
OPENAI_MODEL=gpt-3.5-turbo

# Optional — port the Express server listens on (default: 3001)
PORT=3001
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

---

### Property 1: Message validation rejects blank inputs

*For any* string that is empty or composed entirely of whitespace characters (or is absent), the `POST /api/chat` endpoint SHALL respond with HTTP `400` and a JSON body containing the required error message.

**Validates: Requirements 3.3**

---

### Property 2: Session ID validation rejects non-UUID inputs

*For any* string that is not a valid UUID v4 (including empty strings, random alphanumeric strings, UUIDs of other versions, and absent headers), the `POST /api/chat` endpoint SHALL respond with HTTP `400` and a JSON body containing the required error message.

**Validates: Requirements 3.4**

---

### Property 3: Conversation history grows monotonically with each turn

*For any* session ID and any sequence of N valid user messages sent to that session, the conversation history for that session SHALL contain exactly `1 (system) + 2N` messages (one user + one assistant message per turn), and the messages SHALL appear in the order they were sent.

**Validates: Requirements 5.1, 5.3**

---

### Property 4: First message always initialises history with system prompt

*For any* new session ID (one not previously seen by the server), after the first valid message is processed, the first element of that session's conversation history SHALL be a message with `role: 'system'` and the configured system prompt content.

**Validates: Requirements 5.2**

---

### Property 5: Full history is passed to every OpenAI API call

*For any* session with an existing conversation history of N messages, when a new user message is sent, the OpenAI API call for that request SHALL include all N prior messages plus the new user message — never a subset.

**Validates: Requirements 5.3**

---

### Property 6: Client always generates a valid UUID v4 for new sessions

*For any* fresh browser session (no `chatSessionId` in `sessionStorage`), the session ID generated by `useSession` SHALL be a string that matches the UUID v4 format regex and SHALL be stored in `sessionStorage` under the key `chatSessionId`.

**Validates: Requirements 6.1, 6.2**

---

### Property 7: Every API request carries the session ID header

*For any* message string and session ID, a call to `sendMessage` in `src/api/chat.ts` SHALL produce a `fetch` request that includes the `X-Session-ID` header with a value exactly equal to the provided session ID, and the `Content-Type: application/json` header.

**Validates: Requirements 6.3, 8.2**

---

### Property 8: API module throws a typed error for all non-2xx responses

*For any* HTTP response status code in the range 400–599, the `sendMessage` function SHALL throw an `ApiError` instance whose `status` property equals the response status code and whose `message` property reflects the error body returned by the server.

**Validates: Requirements 8.3**

---

### Property 9: Input is cleared after any successful message submission

*For any* non-empty input string that is successfully submitted via `MessageInput`, the input field value SHALL be the empty string immediately after the submission handler returns.

**Validates: Requirements 7.5**

---

### Property 10: Loading state prevents duplicate submissions

*For any* in-progress request (i.e., `isLoading` is `true`), the send button and input field SHALL both have their `disabled` attribute set to `true`, meaning no additional submit events can be fired by the user.

**Validates: Requirements 7.6**

---

### Property 11: Error responses are displayed without crashing the application

*For any* error response from the server (any 4xx or 5xx status) or any network-level failure, the chat application SHALL display a human-readable error message within the chat interface AND the root component SHALL remain mounted and fully functional for subsequent interactions.

**Validates: Requirements 7.8**
