/**
 * client/src/types.ts
 *
 * PURPOSE
 * -------
 * Client-side type contracts for the AI Chatbot frontend. This file defines
 * every data shape used by the React components, hooks, and API module: the
 * display-ready chat message, the HTTP request/response bodies for
 * POST /api/chat, and the typed error class thrown on non-2xx responses.
 *
 * ARCHITECTURE PLACEMENT
 * ----------------------
 * Like its server counterpart, this file sits at the bottom of the client
 * dependency graph — it has NO imports of its own, so any module can import
 * from it without risk of circular dependencies.
 *
 *   src/types.ts           ← this file (no dependencies)
 *       ↑
 *   src/api/chat.ts        (imports ChatRequest, ChatResponse, ErrorResponse, ApiError)
 *   src/hooks/useChat.ts   (imports ChatMessage)
 *   src/components/...     (imports ChatMessage indirectly via useChat)
 *
 * RELATIONSHIP TO server/src/types.ts
 * ------------------------------------
 * The client and server type files are intentionally separate rather than
 * shared via a monorepo workspace package. Most shapes are mirrors of their
 * server equivalents (ChatRequest, ChatResponse, ErrorResponse are identical),
 * but there is one deliberate difference:
 *
 *   • ChatMessage (client-only) adds an `id` field that does not exist on the
 *     server's Message interface. The server never assigns IDs to messages —
 *     it stores only { role, content } tuples for the OpenAI API. The client
 *     generates IDs locally for React's list-rendering machinery.
 *
 *   • ChatMessage omits the 'system' role. System messages configure the
 *     assistant's persona on the server but are never surfaced in the UI, so
 *     the union type is narrower here: 'user' | 'assistant' only.
 *
 * REQUEST FLOW (client perspective)
 * -----------------------------------
 * 1. User submits text → useChat builds a ChatMessage and appends it to state.
 * 2. useChat calls api/chat.ts with a ChatRequest body.
 * 3. On HTTP 200 the API module parses a ChatResponse and returns the reply.
 * 4. On non-2xx the API module throws an ApiError; useChat catches it and
 *    sets error state for display.
 */

// ---------------------------------------------------------------------------
// ChatMessage
// ---------------------------------------------------------------------------

/**
 * A single message as it is stored and rendered in the client's conversation
 * list. This is the client-only display model — it is NOT sent over the wire.
 *
 * Used by:
 *  - src/hooks/useChat.ts  — held in the `messages: ChatMessage[]` state array
 *  - src/components/ChatWindow.tsx    — iterates over messages to render bubbles
 *  - src/components/MessageBubble.tsx — receives role + content as props
 */
export interface ChatMessage {
  /**
   * A locally-generated UUID v4 string produced by `crypto.randomUUID()`.
   *
   * Why a client-side ID rather than a server-assigned one?
   *
   *  1. OPTIMISTIC UI: The user's message is appended to the list immediately
   *     — before the server responds. At that point no server-assigned ID
   *     exists yet. Generating the ID on the client lets us render the bubble
   *     instantly without waiting for a round-trip.
   *
   *  2. REACT LIST KEYS: React requires a stable, unique `key` prop for every
   *     element in a list. Using the array index as a key causes subtle bugs
   *     when items are inserted or reordered. A UUID is guaranteed unique and
   *     stable for the lifetime of the message in the state array.
   *
   * The server's in-memory history store holds { role, content } tuples
   * without IDs, so this field is purely a client-side concern.
   */
  id: string;

  /**
   * The author of this message.
   *
   * Intentionally narrower than the server's Message.role union
   * ('system' | 'user' | 'assistant'). System messages configure the
   * assistant's persona but are never shown to the user, so they are
   * filtered out at the server boundary and do not appear in the client's
   * display list. Encoding that invariant in the type prevents accidentally
   * rendering a system prompt as a chat bubble.
   */
  role: 'user' | 'assistant';

  /**
   * The text content of the message to be displayed in the chat bubble.
   *
   * For user messages this is the raw input string. For assistant messages
   * this is the reply string extracted from the ChatResponse.reply field.
   */
  content: string;
}

// ---------------------------------------------------------------------------
// ChatRequest
// ---------------------------------------------------------------------------

/**
 * The JSON body sent in the POST /api/chat request.
 *
 * Mirrors server/src/types.ts ChatRequest exactly. The client sends only the
 * latest user message; the server is responsible for reconstructing the full
 * conversation context by prepending the stored history before forwarding to
 * the OpenAI API.
 *
 * Used by:
 *  - src/api/chat.ts — serialised with JSON.stringify() into the fetch body
 */
export interface ChatRequest {
  /**
   * The user's new message text.
   *
   * Must be a non-empty string. The UI layer (MessageInput) prevents
   * submission of empty strings, but the server also validates and returns
   * a 400 if this constraint is violated.
   */
  message: string;
}

// ---------------------------------------------------------------------------
// ChatResponse
// ---------------------------------------------------------------------------

/**
 * The JSON body of a successful (HTTP 200) POST /api/chat response.
 *
 * Mirrors server/src/types.ts ChatResponse exactly. The server returns only
 * the latest assistant reply; the full conversation history lives exclusively
 * on the server. The client appends this reply to its local display list.
 *
 * Used by:
 *  - src/api/chat.ts — parsed from response.json() on a 2xx status
 */
export interface ChatResponse {
  /**
   * The assistant's reply text, extracted server-side from the first choice
   * returned by the OpenAI Chat Completions API.
   *
   * Always a non-empty string when the server responds with HTTP 200 — the
   * server throws before responding if the OpenAI content is empty or null.
   */
  reply: string;
}

// ---------------------------------------------------------------------------
// ErrorResponse
// ---------------------------------------------------------------------------

/**
 * The JSON body returned by the server for all error responses:
 *   - HTTP 400 (validation errors)
 *   - HTTP 502 (OpenAI API errors)
 *   - HTTP 500 (unexpected server errors)
 *
 * Mirrors server/src/types.ts ErrorResponse exactly. The consistent shape
 * means the API module can handle every error case with a single code path:
 * parse the body, read the `error` field, pass it to ApiError.
 *
 * Used by:
 *  - src/api/chat.ts — parsed from response.json() on a non-2xx status
 */
export interface ErrorResponse {
  /**
   * A human-readable description of what went wrong, suitable for display
   * in the chat interface.
   *
   * For validation errors this is the exact message from the server spec
   * (e.g., "message is required and must be a non-empty string"). For
   * upstream or internal errors it is deliberately vague to avoid leaking
   * server implementation details to the browser.
   */
  error: string;
}

// ---------------------------------------------------------------------------
// ApiError
// ---------------------------------------------------------------------------

/**
 * A typed error thrown by src/api/chat.ts whenever the server responds with
 * a non-2xx HTTP status code.
 *
 * WHY A CLASS AND NOT AN INTERFACE?
 *
 * TypeScript interfaces describe object shapes but cannot be used as values —
 * they are erased at runtime. This means you cannot write:
 *
 *   catch (err) {
 *     if (err instanceof SomeInterface) { ... }  // ❌ compile error
 *   }
 *
 * By making ApiError a class that extends the built-in Error, we get:
 *
 *  1. `instanceof` checks in catch blocks — the primary reason. useChat.ts
 *     uses `err instanceof ApiError` to distinguish network/fetch errors
 *     (plain Error or TypeError) from structured HTTP errors (ApiError),
 *     allowing different handling or display strategies.
 *
 *  2. A proper stack trace — extending Error ensures the JS runtime captures
 *     the call stack at the point of construction, which aids debugging.
 *
 *  3. `error.name` set to 'ApiError' — makes the class identifiable in log
 *     output even when instanceof is not available (e.g., across iframes or
 *     serialised error objects).
 *
 * Common mistake: forgetting to call `super(message)` before accessing
 * `this` in the constructor. The call to super() is what makes the instance
 * a proper Error with a populated `.message` property and stack trace.
 */
export class ApiError extends Error {
  /**
   * The HTTP status code returned by the server (e.g., 400, 502, 500).
   *
   * Marked `readonly` to prevent accidental mutation after construction.
   * Consumers use this to decide how to surface the error — for example,
   * a 400 might indicate a client bug worth logging differently than a 502.
   */
  public readonly status: number;

  constructor(
    status: number,
    message: string,
  ) {
    // Must call super() before accessing `this`. Passes the message string
    // to the built-in Error constructor, populating this.message and
    // capturing a stack trace.
    super(message);

    this.status = status;

    // Explicitly set the name so that error.toString() and log output show
    // "ApiError: ..." rather than the generic "Error: ...".
    this.name = 'ApiError';
  }
}
