/**
 * client/src/api/chat.ts
 *
 * PURPOSE
 * -------
 * This module is the isolated HTTP layer for the AI Chatbot client. It has
 * zero dependencies on React — no hooks, no components, no JSX. The only
 * things it knows about are the global `fetch` API and the shared type
 * contracts in `../types`. That isolation makes it straightforward to
 * unit-test by mocking global `fetch` without any React test utilities.
 *
 * ARCHITECTURE PLACEMENT
 * ----------------------
 * Step 4 in the end-to-end request flow:
 *
 *   1. User presses Enter / clicks Send
 *   2. MessageInput calls onSubmit(text)
 *   3. useChat builds the optimistic message, sets isLoading, then calls
 *      this module's sendMessage()
 *   4. ← YOU ARE HERE — sendMessage() issues fetch('/api/chat', ...)
 *   5. Vite dev proxy forwards /api → http://localhost:3001
 *   6. Express validates headers and body, calls OpenAI, returns { reply }
 *   7. sendMessage() resolves with the reply string
 *   8. useChat appends the assistant message, clears isLoading
 *
 * PRODUCTION PROXY EQUIVALENCE
 * -----------------------------
 * In development, Vite's `server.proxy` config rewrites `/api` requests to
 * `http://localhost:3001`. In production, a reverse proxy (nginx, AWS ALB,
 * etc.) performs the exact same rewrite for the deployed domain. Because the
 * path is relative (no hostname), this module works identically in both
 * environments without any environment-specific branching.
 */

import { ApiError, ChatResponse, ErrorResponse } from '../types';

/**
 * sendMessage — send a user message to the Express backend and return the
 * assistant's reply string.
 *
 * This is a pure async function: given the same inputs it issues the same
 * HTTP request and returns (or throws) a deterministic result. There is no
 * internal state, no side effects beyond the network call, and no coupling to
 * the React component tree. That purity is what makes it easy to test in
 * isolation — just mock `globalThis.fetch` and assert on the resolved value
 * or the thrown error.
 *
 * @param message   The user's message text. Must be a non-empty string; the
 *                  server returns HTTP 400 if this constraint is violated.
 * @param sessionId A UUID v4 string that identifies the current browser tab's
 *                  conversation. Generated once by useSession.ts and reused
 *                  for the tab's lifetime.
 * @returns         The assistant's reply string extracted from ChatResponse.reply.
 * @throws          ApiError if the server responds with a non-2xx status code.
 * @throws          TypeError (from fetch) if a network-level failure occurs
 *                  (no connection, DNS failure, CORS rejection, etc.).
 */
export async function sendMessage(
  message: string,
  sessionId: string,
): Promise<string> {
  const response = await fetch(
    // The path is relative (no hostname) for two reasons:
    //  1. In development, Vite proxies any request that starts with /api to
    //     http://localhost:3001, so we never need to hardcode the server port.
    //  2. In production, the same relative path is handled by whatever reverse
    //     proxy sits in front of both the static bundle and the API server
    //     (e.g., nginx `proxy_pass`). The module never needs to know the
    //     server's hostname — making it fully environment-agnostic.
    '/api/chat',
    {
      method: 'POST',
      headers: {
        // Required so that Express's `express.json()` middleware recognises
        // the request body as JSON and parses it into req.body. Without this
        // header, express.json() skips the body and req.body is undefined,
        // causing the validateMessage middleware to return a 400.
        'Content-Type': 'application/json',

        // The `X-` prefix is the conventional marker for custom (non-standard)
        // HTTP headers. The server's `validateSessionId` middleware reads
        // exactly this header name — `req.headers['x-session-id']` — to
        // extract the session UUID and look up (or initialise) the
        // conversation history for this browser tab.
        'X-Session-ID': sessionId,
      },
      body: JSON.stringify({ message }),
    },
  );

  // `response.ok` is true for any status code in the 200–299 range and false
  // for everything else. This single check uniformly catches all 4xx client
  // errors (400 bad request, 401 unauthorised, etc.) and all 5xx server
  // errors (500 internal error, 502 bad gateway from a failed OpenAI call).
  // Using `response.ok` is preferred over `response.status === 200` because
  // it correctly handles any 2xx success code, not just 200.
  if (!response.ok) {
    const body: ErrorResponse = await response.json();

    // We throw ApiError (rather than a plain Error) so that callers can use
    // `instanceof ApiError` in catch blocks to distinguish a structured HTTP
    // error from a network-level TypeError thrown by fetch itself.
    //
    // Carrying the status code in ApiError.status matters because callers
    // (e.g., useChat.ts) can inspect it to handle different failure modes
    // differently: a 400 indicates a client-side bug (wrong message format or
    // invalid session ID) worth logging loudly, while a 502 means the OpenAI
    // upstream was unavailable — a transient condition the user can retry.
    //
    // The `?? 'Unknown error'` fallback guards against non-standard error
    // bodies that lack the `error` field (e.g., a raw nginx 502 page that was
    // parsed as `{}` because the Content-Type header was still application/json).
    // Without the fallback, `body.error` would be `undefined` and ApiError
    // would display the unhelpful message "undefined" in the chat UI.
    throw new ApiError(response.status, body.error ?? 'Unknown error');
  }

  const data: ChatResponse = await response.json();
  return data.reply;
}
