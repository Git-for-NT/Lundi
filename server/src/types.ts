/**
 * server/src/types.ts
 *
 * PURPOSE
 * -------
 * Central type contract for the Express server. Every data shape that crosses
 * a module boundary — HTTP request bodies, HTTP response bodies, and the
 * conversation message objects passed to the OpenAI API — is defined here as
 * a TypeScript interface. Keeping all shared types in one file makes it easy
 * to audit the API surface, spot inconsistencies between modules, and keep
 * the client-facing contract in sync with the server implementation.
 *
 * ARCHITECTURE PLACEMENT
 * ----------------------
 * This file sits at the bottom of the server's dependency graph. It has NO
 * imports of its own, which means any module can import from it without risk
 * of creating circular dependencies.
 *
 *   src/types.ts          ← this file (no dependencies)
 *       ↑
 *   src/store/history.ts  (imports Message)
 *   src/services/openai.ts (imports Message)
 *   src/routes/chat.ts    (imports ChatRequest, ChatResponse, ErrorResponse)
 *   src/middleware/validate.ts (imports ErrorResponse)
 *
 * REQUEST FLOW
 * ------------
 * 1. Client sends   POST /api/chat  { message: string }        → ChatRequest
 *    with header    X-Session-ID: <uuid v4>
 * 2. Route handler reads ChatRequest.message and builds a Message object
 *    { role: 'user', content: message } to append to the history store.
 * 3. The history store holds Message[] and passes it to the OpenAI service.
 * 4. On success the route handler returns                       → ChatResponse
 * 5. On any error the route handler returns                     → ErrorResponse
 */

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

/**
 * Represents a single turn in a conversation in the format required by the
 * OpenAI Chat Completions API.
 *
 * This interface mirrors the OpenAI SDK's `ChatCompletionMessageParam` shape
 * so that `Message[]` can be passed directly to `client.chat.completions.create`
 * without any transformation.
 *
 * Used by:
 *  - src/store/history.ts — stored in the in-memory Map<sessionId, Message[]>
 *  - src/services/openai.ts — passed as the `messages` parameter to the OpenAI API
 *  - src/routes/chat.ts — constructed from the incoming request body
 */
export interface Message {
  /**
   * The speaker of this message.
   *
   * OpenAI recognises exactly three roles:
   *   'system'    — Configuration message sent by the developer, always the
   *                 first element in the messages array. Sets the assistant's
   *                 persona and behavioural constraints. Never shown to the user.
   *   'user'      — A message authored by the human end-user.
   *   'assistant' — A reply authored by the language model in a previous turn.
   *
   * The union type enforces this constraint at compile time, preventing typos
   * like 'bot' or 'human' that the OpenAI API would reject at runtime.
   */
  role: 'system' | 'user' | 'assistant';

  /**
   * The text content of the message.
   *
   * For the OpenAI API this must be a non-empty string. The API supports
   * structured content arrays (e.g., for images with vision-capable models),
   * but this application uses plain text completions only, so a simple string
   * covers all cases.
   *
   * Common mistake: passing `null` or `undefined` here will cause the OpenAI
   * API to return a 400 error. The validate middleware guards against empty
   * user messages before they reach the history store.
   */
  content: string;
}

// ---------------------------------------------------------------------------
// ChatRequest
// ---------------------------------------------------------------------------

/**
 * The expected JSON body of a POST /api/chat request.
 *
 * The client sends only the latest user message. The server is responsible
 * for reconstructing the full conversation context by prepending the stored
 * history before forwarding to OpenAI. Keeping the request body minimal
 * reduces payload size and keeps the API contract simple.
 *
 * Used by:
 *  - src/routes/chat.ts — typed as `req.body` after the JSON middleware parses it
 *  - src/middleware/validate.ts — checks that `message` is a non-empty string
 */
export interface ChatRequest {
  /**
   * The user's new message text.
   *
   * Must be a non-empty string. Whitespace-only strings are also rejected by
   * the validateMessage middleware (Requirement 3.3) because they would produce
   * confusing empty-looking bubbles in the UI and waste an OpenAI API call.
   *
   * Maximum length is not enforced server-side; it is implicitly bounded by
   * OpenAI's context-window limits for the configured model.
   */
  message: string;
}

// ---------------------------------------------------------------------------
// ChatResponse
// ---------------------------------------------------------------------------

/**
 * The JSON body returned on a successful POST /api/chat response (HTTP 200).
 *
 * The server returns only the latest assistant reply. The client appends it
 * to its own display list; the full history lives exclusively on the server.
 * This design keeps the HTTP response compact and avoids leaking the system
 * prompt or prior turns to the browser's network inspector.
 *
 * Used by:
 *  - src/routes/chat.ts — constructed and sent with res.json()
 */
export interface ChatResponse {
  /**
   * The assistant's reply text, extracted from the first choice returned by
   * the OpenAI Chat Completions API.
   *
   * The OpenAI response shape is:
   *   response.choices[0].message.content
   *
   * The openai.ts service layer extracts this string and throws if it is
   * empty or null, so this field is always a non-empty string when present.
   */
  reply: string;
}

// ---------------------------------------------------------------------------
// ErrorResponse
// ---------------------------------------------------------------------------

/**
 * The JSON body returned for all error responses from this server:
 *   - HTTP 400 (validation errors from middleware)
 *   - HTTP 502 (OpenAI API errors)
 *   - HTTP 500 (unexpected server errors)
 *
 * Using a consistent error shape across all failure modes means the client
 * can handle every error case with a single code path: parse the body, read
 * the `error` field, display it to the user.
 *
 * Used by:
 *  - src/routes/chat.ts — returned on OpenAI errors and unexpected errors
 *  - src/middleware/validate.ts — returned on validation failures
 */
export interface ErrorResponse {
  /**
   * A human-readable description of what went wrong.
   *
   * For validation errors this is the exact string specified in the
   * requirements (e.g., "message is required and must be a non-empty string")
   * so that the client can display it directly.
   *
   * For upstream or internal errors the message is deliberately vague
   * ("Failed to get a response from the AI service", "An unexpected error
   * occurred") to avoid leaking implementation details or sensitive data to
   * the browser. Full error details are logged server-side instead.
   */
  error: string;
}
