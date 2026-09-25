# Implementation Plan: AI Chatbot

## Overview

Generate the complete full-stack monorepo in a single pass. The project consists of a React + TypeScript + Vite frontend (`client/`, port 5173) and a Node.js + Express + TypeScript backend (`server/`, port 3001) that proxies to the OpenAI Chat Completions API.

Every file must include thorough explanatory comments covering purpose, architecture placement, request flow, design decisions, and improvement hints. Tasks are ordered so each step produces working, integrated code — no orphaned modules.

---

## Tasks

- [x] 1. Scaffold monorepo root — config files and README
  - [x] 1.1 Create root `package.json` with `concurrently` dev script
    - Add `"dev"` script: `concurrently \"npm run dev --prefix server\" \"npm run dev --prefix client\"`
    - Add `"install:all"` script to install deps in both packages
    - Include top-of-file comment block explaining the monorepo layout and the role of this file
    - _Requirements: 1.1_

  - [x] 1.2 Create root `.gitignore`
    - Exclude `.env`, `node_modules/`, `dist/`, `build/`
    - Add inline comment explaining why `.env` is excluded
    - _Requirements: 2.6_

  - [x] 1.3 Write `README.md`
    - Sections: Project Purpose, Prerequisites, Installation, Environment Variable Setup, Development Commands, Project Structure (ASCII tree), Architecture Overview, End-to-End Request Flow, Suggested Learning Extensions
    - Every section should have brief inline explanations of design decisions
    - _Requirements: 1.4_

- [x] 2. Scaffold and configure the `server/` package
  - [x] 2.1 Create `server/package.json`
    - Dependencies: `express`, `cors`, `dotenv`, `openai`
    - Dev dependencies: `typescript`, `ts-node-dev`, `@types/express`, `@types/cors`, `@types/node`
    - Dev dependencies: `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `prettier`
    - Scripts: `"dev": "ts-node-dev --respawn src/index.ts"`, `"build": "tsc"`, `"start": "node dist/index.js"`
    - _Requirements: 1.3_

  - [x] 2.2 Create `server/tsconfig.json`
    - Target `ES2020`, module `commonjs`, `strict: true`, `outDir: dist`, `rootDir: src`
    - Include explanatory comment about each compiler option
    - _Requirements: 1.3_

  - [x] 2.3 Create `server/.eslintrc.cjs` and `server/.prettierrc`
    - ESLint: TypeScript parser, `@typescript-eslint/recommended` rules
    - Prettier: `singleQuote: true`, `semi: true`, `printWidth: 100`
    - Add top-of-file comments explaining the toolchain role
    - _Requirements: 9.1_

  - [x] 2.4 Create `server/.env.example`
    - List `OPENAI_API_KEY`, `OPENAI_MODEL`, `PORT` with inline comments explaining purpose and acceptable values
    - _Requirements: 2.5_

- [x] 3. Implement server types and shared contracts
  - [x] 3.1 Create `server/src/types.ts`
    - Define `Message`, `ChatRequest`, `ChatResponse`, `ErrorResponse` interfaces
    - Top-of-file comment: role in architecture, which modules import it
    - Inline comments on each field explaining its purpose and OpenAI format constraints
    - _Requirements: 3.1, 5.1_

- [x] 4. Implement server infrastructure — history store and validation middleware
  - [x] 4.1 Create `server/src/store/history.ts`
    - Implement `getOrCreateHistory`, `appendMessage`, `clearAllHistories` using `Map<string, Message[]>`
    - Top-of-file comment: why in-memory, what happens on restart, trade-offs vs a database
    - Comment on `clearAllHistories` explaining its testing purpose
    - _Requirements: 5.1, 5.2, 5.4, 5.5_

  - [ ]* 4.2 Write property test for `getOrCreateHistory` — Property 4 (first message initialises system prompt)
    - **Property 4: First message always initialises history with system prompt**
    - **Validates: Requirements 5.2**

  - [ ]* 4.3 Write property test for `appendMessage` — Property 3 (history grows monotonically)
    - **Property 3: Conversation history grows monotonically with each turn**
    - **Validates: Requirements 5.1, 5.3**

  - [x] 4.4 Create `server/src/middleware/validate.ts`
    - Implement `validateMessage` and `validateSessionId` middleware functions
    - UUID v4 regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`
    - Top-of-file comment: why validation is separated from route handler, benefits for testability
    - Inline comments on the regex pattern explaining each segment
    - _Requirements: 3.3, 3.4_

  - [ ]* 4.5 Write property test for `validateMessage` — Property 1 (rejects blank inputs)
    - **Property 1: Message validation rejects blank inputs**
    - **Validates: Requirements 3.3**

  - [ ]* 4.6 Write property test for `validateSessionId` — Property 2 (rejects non-UUID inputs)
    - **Property 2: Session ID validation rejects non-UUID inputs**
    - **Validates: Requirements 3.4**

- [x] 5. Implement the OpenAI service
  - [x] 5.1 Create `server/src/services/openai.ts`
    - Instantiate `new OpenAI()` (auto-reads `OPENAI_API_KEY` from env)
    - Define and export `SYSTEM_PROMPT` constant
    - Implement `getCompletion(messages: Message[]): Promise<string>`
    - Top-of-file comment: role in architecture, where the API call sits in the request flow
    - Comments explaining: the `messages` array format, role of the system prompt, streaming vs non-streaming trade-off, why we throw on an empty response
    - Comment on `process.env.OPENAI_MODEL ?? 'gpt-3.5-turbo'` explaining the default fallback
    - _Requirements: 2.3, 3.5, 3.6, 3.7, 5.3, 9.5_

  - [ ]* 5.2 Write property test for `getCompletion` — Property 5 (full history passed to every call)
    - **Property 5: Full history is passed to every OpenAI API call**
    - **Validates: Requirements 5.3**
    - Mock the OpenAI SDK; assert the `messages` argument equals the full history array

- [x] 6. Implement the Express app and routes
  - [x] 6.1 Create `server/src/routes/health.ts`
    - `GET /health` → `200 { status: 'ok' }`
    - Top-of-file comment: liveness check purpose, how it fits in the app
    - _Requirements: 3.9_

  - [x] 6.2 Create `server/src/routes/chat.ts`
    - Apply `validateSessionId` and `validateMessage` middleware
    - Orchestrate: `getOrCreateHistory` → `appendMessage` (user) → `getCompletion` → `appendMessage` (assistant) → `200 { reply }`
    - Error handling: catch OpenAI errors → `502`; catch-all → `500`
    - Top-of-file comment: full request flow numbered list matching the design document
    - Inline comments on each orchestration step explaining the ordering decision (user message appended before API call)
    - _Requirements: 3.1–3.8, 5.2, 5.3_

  - [x] 6.3 Create `server/src/app.ts`
    - `createApp()` factory: apply `cors` (origin, allowed headers, methods), `express.json()`, mount routers
    - Top-of-file comment: why a factory function is used instead of a singleton (testability)
    - Inline comments on each CORS option explaining its necessity
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 6.4 Create `server/src/index.ts`
    - Import `dotenv/config`, validate `OPENAI_API_KEY`, read `PORT`, call `createApp()`, call `app.listen()`
    - Top-of-file comment: bootstrap sequence, why env validation happens here before anything else
    - Inline comment on `process.exit(1)` explaining the exit code convention
    - _Requirements: 2.1, 2.2, 2.4, 1.6_

- [ ] 7. Checkpoint — server builds and health endpoint responds
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Scaffold and configure the `client/` package
  - [x] 8.1 Create `client/package.json`
    - Dependencies: `react`, `react-dom`
    - Dev dependencies: `typescript`, `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`
    - Dev dependencies: `eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `prettier`
    - Scripts: `"dev": "vite"`, `"build": "tsc && vite build"`, `"preview": "vite preview"`
    - _Requirements: 1.2_

  - [x] 8.2 Create `client/tsconfig.json` and `client/tsconfig.node.json`
    - `tsconfig.json`: target `ES2020`, `lib: ["ES2020","DOM","DOM.Iterable"]`, `jsx: react-jsx`, `strict: true`
    - `tsconfig.node.json`: for Vite config file compilation
    - Inline comments on key options (`jsx`, `useDefineForClassFields`, etc.)
    - _Requirements: 1.2_

  - [x] 8.3 Create `client/.eslintrc.cjs` and `client/.prettierrc`
    - ESLint: TypeScript parser, `react/recommended`, `react-hooks/recommended`
    - Prettier: matching server config (`singleQuote: true`, `semi: true`, `printWidth: 100`)
    - Add top-of-file comments
    - _Requirements: 9.1_

  - [x] 8.4 Create `client/vite.config.ts`
    - Set `server.port: 5173`, configure `/api` proxy to `http://localhost:3001` with `changeOrigin: true`
    - Top-of-file comment: why the proxy is used, how it avoids hardcoded hostnames, production equivalence
    - Inline comment on `changeOrigin` explaining its effect
    - _Requirements: 1.5, 8.4_

  - [x] 8.5 Create `client/index.html`
    - Standard Vite HTML entry point with `<div id="root">` and script tag pointing to `src/main.tsx`
    - _Requirements: 1.2_

- [x] 9. Implement client types, session hook, and API module
  - [x] 9.1 Create `client/src/types.ts`
    - Define `ChatMessage`, `ChatRequest`, `ChatResponse`, `ErrorResponse`, `ApiError` class
    - Top-of-file comment: client-side type contracts, relationship to server types
    - Inline comments on `ChatMessage.id` (why a local client ID, not server-assigned), `ApiError` (why a class not an interface)
    - _Requirements: 8.3_

  - [x] 9.2 Create `client/src/hooks/useSession.ts`
    - `useState` initialiser reads `sessionStorage.getItem('chatSessionId')` or generates `crypto.randomUUID()`; persists to `sessionStorage`
    - Top-of-file comment: session lifecycle, where this hook fits in the component tree
    - Comments explaining: why `sessionStorage` over `localStorage`, what happens on tab close, what happens on server restart
    - _Requirements: 6.1, 6.2, 9.6_

  - [ ]* 9.3 Write property test for `useSession` — Property 6 (generates valid UUID v4)
    - **Property 6: Client always generates a valid UUID v4 for new sessions**
    - **Validates: Requirements 6.1, 6.2**
    - Use `renderHook` with a mocked `sessionStorage`; assert UUID format with the v4 regex

  - [x] 9.4 Create `client/src/api/chat.ts`
    - Implement `sendMessage(message: string, sessionId: string): Promise<string>`
    - Use `fetch('/api/chat', ...)` with `Content-Type: application/json` and `X-Session-ID` headers
    - On non-2xx: parse body, throw `ApiError(status, body.error)`
    - Top-of-file comment: isolation purpose, request flow position (step 4 of the end-to-end flow), production proxy equivalence
    - Inline comments on why the path is relative, header naming convention, why `ApiError` carries the status code
    - _Requirements: 8.1, 8.2, 8.3, 6.3_

  - [ ]* 9.5 Write property test for `sendMessage` — Property 7 (every request carries session ID header)
    - **Property 7: Every API request carries the session ID header**
    - **Validates: Requirements 6.3, 8.2**
    - Mock `fetch`; assert `X-Session-ID` header equals the provided session ID for arbitrary inputs

  - [ ]* 9.6 Write property test for `sendMessage` — Property 8 (throws ApiError for all non-2xx)
    - **Property 8: API module throws a typed error for all non-2xx responses**
    - **Validates: Requirements 8.3**
    - Mock `fetch` to return status codes 400–599; assert thrown instance is `ApiError` with matching `status`

- [x] 10. Implement the `useChat` hook
  - [x] 10.1 Create `client/src/hooks/useChat.ts`
    - State: `messages: ChatMessage[]`, `isLoading: boolean`, `error: string | null`
    - `sendMessage(text)`: optimistically append user message, set `isLoading: true`, call `api/chat.sendMessage`, append assistant reply on success, set `error` on failure
    - Expose `messagesEndRef` for auto-scroll
    - Top-of-file comment: conversation state ownership, data flow to components, request orchestration role
    - Inline comments on optimistic append decision, why user message is kept on error, why `isLoading` prevents re-submission
    - _Requirements: 7.1, 7.6, 7.7, 7.8_

  - [ ]* 10.2 Write property test for `useChat` — Property 10 (loading state prevents duplicate submissions)
    - **Property 10: Loading state prevents duplicate submissions**
    - **Validates: Requirements 7.6**
    - Use `renderHook`; assert `isLoading` is `true` while a mocked async `sendMessage` is pending

  - [ ]* 10.3 Write property test for `useChat` — Property 11 (errors displayed without crash)
    - **Property 11: Error responses are displayed without crashing the application**
    - **Validates: Requirements 7.8**
    - Simulate a rejected `sendMessage`; assert `error` is set and `messages` still contains prior entries

- [x] 11. Implement client UI components
  - [x] 11.1 Create `client/src/components/MessageBubble.tsx`
    - Props: `{ role: 'user' | 'assistant', content: string }`
    - User messages: right-aligned, blue background; assistant: left-aligned, grey background
    - Role label (`You` / `Assistant`) above each bubble
    - Top-of-file comment: single responsibility, how it relates to the message list
    - Inline comments on the styling approach and accessibility considerations
    - _Requirements: 7.1, 7.2_

  - [ ]* 11.2 Write property test for `MessageBubble` — role-aware rendering
    - Assert that for any `role`/`content` pair, the correct label and alignment class are applied
    - _Requirements: 7.2_

  - [x] 11.3 Create `client/src/components/MessageInput.tsx`
    - Controlled input with local `value` state; submit on Enter or button click
    - `disabled` and `aria-disabled` when `isLoading`; clear input after submit
    - Top-of-file comment: input lifecycle, accessibility rationale
    - Inline comments on Enter key handler, why clearing is done after calling `onSubmit`, `aria-disabled` vs `disabled` trade-off
    - _Requirements: 7.3, 7.4, 7.5, 7.6_

  - [ ]* 11.4 Write property test for `MessageInput` — Property 9 (input cleared after submission)
    - **Property 9: Input is cleared after any successful message submission**
    - **Validates: Requirements 7.5**
    - Render with arbitrary non-empty strings; assert input value is `""` after `onSubmit` fires

  - [x] 11.5 Create `client/src/components/ChatWindow.tsx`
    - Scrollable container rendering `MessageBubble` per message
    - `useEffect` on `messages.length` triggers `scrollIntoView({ behavior: 'smooth' })` via `messagesEndRef`
    - "Thinking…" indicator bubble when `isLoading`
    - Top-of-file comment: rendering responsibilities, scroll behaviour rationale
    - Inline comments on `useEffect` dependency array choice, why a sentinel `<div>` is used for scroll target
    - _Requirements: 7.1, 7.6, 7.7_

- [x] 12. Implement `App.tsx` and `main.tsx` — wire everything together
  - [x] 12.1 Create `client/src/App.tsx`
    - Call `useSession()` and `useChat(sessionId)`
    - Render `<ChatWindow>` and `<MessageInput>` with appropriate props
    - Display `error` state as an error message in the chat interface when present
    - Top-of-file comment: root component role, prop threading pattern, why session and chat state live here
    - Inline comment explaining the error rendering location and why it does not crash the app
    - _Requirements: 7.8_

  - [x] 12.2 Create `client/src/main.tsx`
    - Mount `<App />` to `#root` with `ReactDOM.createRoot`
    - Import global styles (minimal CSS reset)
    - Top-of-file comment: entry point, Vite HMR integration note
    - _Requirements: 1.2_

  - [x] 12.3 Create `client/src/index.css` (or inline styles approach)
    - Minimal global reset and base styles for the chat layout
    - Comments explaining the styling philosophy (clarity over polish for a learning project)
    - _Requirements: 7.1, 7.2_

- [x] 13. Final checkpoint — full stack runs end to end
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP build.
- Every source file must include a top-of-file comment block (Requirement 9.2) — this is part of every implementation task, not a separate pass.
- Every non-trivial function must include an inline comment with purpose, implementation rationale, and a common mistake or improvement hint (Requirement 9.3).
- The design document's "Correctness Properties" section defines 11 properties; property-based test tasks above cover all 11.
- Property tests use `fast-check` (server) and `@fast-check/vitest` or equivalent (client).
- Checkpoints in tasks 7 and 13 are manual validation gates; they are not automated test tasks.
- Status legend: `[x]` = complete, `[-]` = partially done (files created, content incomplete), `[~]` = in progress (implementation started), `[ ]` = not started.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4", "8.1", "8.2", "8.3"] },
    { "id": 2, "tasks": ["3.1", "8.4", "8.5"] },
    { "id": 3, "tasks": ["4.1", "4.4", "9.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.5", "4.6", "5.1", "9.2"] },
    { "id": 5, "tasks": ["5.2", "9.3", "9.4"] },
    { "id": 6, "tasks": ["6.1", "6.2", "9.5", "9.6"] },
    { "id": 7, "tasks": ["6.3", "10.1"] },
    { "id": 8, "tasks": ["6.4", "10.2", "10.3"] },
    { "id": 9, "tasks": ["11.1", "11.3"] },
    { "id": 10, "tasks": ["11.2", "11.4", "11.5"] },
    { "id": 11, "tasks": ["12.1"] },
    { "id": 12, "tasks": ["12.2", "12.3"] }
  ]
}
```
