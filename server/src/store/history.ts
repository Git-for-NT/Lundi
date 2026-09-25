/**
 * server/src/store/history.ts
 *
 * PURPOSE
 * -------
 * This module is the single source of truth for all per-session conversation
 * histories. It exposes three functions that the route handler uses to
 * initialise, grow, and (in tests) reset conversation state.
 *
 * WHY IN-MEMORY STORAGE?
 * ----------------------
 * A plain JavaScript `Map` is used instead of a database because:
 *  1. Zero dependencies — no connection string, no schema, no migrations.
 *  2. Zero latency — reads and writes are synchronous and sub-microsecond.
 *  3. The spec explicitly calls for in-memory storage (Requirement 5.4).
 *
 * For a learning project this is the right trade-off: it keeps the data layer
 * trivially simple so the interesting parts (OpenAI integration, session
 * management, request validation) get all the attention.
 *
 * WHAT HAPPENS ON SERVER RESTART?
 * --------------------------------
 * Because the Map lives in Node.js process memory, every server restart wipes
 * all conversation histories (Requirement 5.5). From the user's perspective
 * this means the chatbot "forgets" everything when the server is restarted.
 * The client's sessionStorage ID is still valid, but the server will treat it
 * as a brand-new session and re-initialise the history with the system prompt.
 *
 * TRADE-OFFS VS A DATABASE
 * ------------------------
 * | Concern          | In-memory Map          | Database (e.g. PostgreSQL)  |
 * |------------------|------------------------|-----------------------------|
 * | Persistence      | Lost on restart        | Survives restarts           |
 * | Scalability      | Single process only    | Multiple server instances   |
 * | Memory growth    | Unbounded (no eviction)| Bounded by disk             |
 * | Complexity       | ~20 lines of code      | Schema, ORM, connection pool|
 * | Latency          | ~0 µs                  | ~1–10 ms per query          |
 *
 * If this application were to grow toward production, the natural next step
 * would be to replace this module with a Redis-backed store, keeping the same
 * three-function interface so no other module needs to change.
 *
 * ARCHITECTURE PLACEMENT
 * ----------------------
 * This file sits one level above types.ts in the dependency graph:
 *
 *   src/types.ts          ← imports Message from here
 *       ↑
 *   src/store/history.ts  ← this file
 *       ↑
 *   src/routes/chat.ts    ← calls getOrCreateHistory and appendMessage
 */

import { Message } from '../types';

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/**
 * The single Map that holds every active session's conversation history.
 *
 * Key:   Session ID (UUID v4 string), supplied by the client via X-Session-ID.
 * Value: Ordered array of Message objects, always starting with a system prompt.
 *
 * This variable is module-private. External code interacts with it exclusively
 * through the three exported functions below, which keeps mutation paths
 * predictable and easy to audit.
 */
const histories = new Map<string, Message[]>();

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Returns the conversation history for the given session ID, creating it if
 * it does not yet exist.
 *
 * WHY: The route handler needs the full history array before appending the new
 * user message. Using a "get or create" pattern means the caller never has to
 * check whether the session is new — the initialisation concern is encapsulated
 * here.
 *
 * IMPLEMENTATION: On first call for a given sessionId, a new array is seeded
 * with a single system-role message containing the provided systemPrompt. This
 * guarantees that the system prompt is always the first element in every OpenAI
 * API call for this session (Requirement 5.2), regardless of how many turns
 * have passed.
 *
 * COMMON MISTAKE: Do not call `histories.get(sessionId)` directly from the
 * route handler — it returns `undefined` for new sessions, which would cause
 * `appendMessage` to silently drop messages. Always go through this function.
 *
 * POSSIBLE IMPROVEMENT: Accept a TTL (time-to-live) parameter and schedule
 * automatic cleanup of inactive sessions to prevent the Map from growing
 * without bound in long-running deployments.
 *
 * @param sessionId    The UUID v4 identifying the client's browser session.
 * @param systemPrompt The developer-authored prompt that configures the
 *                     assistant's persona. Injected only when the history is
 *                     first created.
 * @returns            The mutable Message array for this session.
 */
export function getOrCreateHistory(sessionId: string, systemPrompt: string): Message[] {
  if (!histories.has(sessionId)) {
    // Seed with the system prompt so it is always the first message sent to
    // OpenAI, establishing the assistant's persona from the very first turn.
    histories.set(sessionId, [{ role: 'system', content: systemPrompt }]);
  }
  // The non-null assertion (!) is safe here: we just guaranteed the key exists.
  return histories.get(sessionId)!;
}

/**
 * Appends a single message to the end of the specified session's history.
 *
 * WHY: Keeping append logic here (rather than inlining `history.push()` in the
 * route handler) means all mutation of history state flows through this module.
 * If we ever need to add side effects on append — logging, length capping,
 * persistence — there is exactly one place to do it.
 *
 * IMPLEMENTATION: Uses optional chaining (`?.`) to call `push` only when the
 * session already exists in the Map. If the sessionId is unknown the call is a
 * safe no-op, which prevents a runtime crash from an unexpected key.
 *
 * COMMON MISTAKE: Always call `getOrCreateHistory` before `appendMessage`.
 * If `appendMessage` is called for a session that was never initialised (e.g.,
 * because the route handler skipped `getOrCreateHistory`), the message will be
 * silently discarded because the Map has no entry for that key.
 *
 * @param sessionId The UUID v4 identifying the client's browser session.
 * @param message   The Message object to append (role + content).
 */
export function appendMessage(sessionId: string, message: Message): void {
  histories.get(sessionId)?.push(message);
}

/**
 * Removes all session histories from the Map, resetting the store to its
 * initial empty state.
 *
 * TESTING PURPOSE: This function exists exclusively to support test isolation.
 * Without it, state from one test would leak into subsequent tests because the
 * `histories` Map persists for the lifetime of the Node.js process. Call this
 * in an `afterEach` or `beforeEach` hook to ensure each test starts with a
 * clean slate.
 *
 * WHY EXPORTED: The Map itself is module-private (not exported), so test code
 * cannot call `histories.clear()` directly. Exporting this thin wrapper gives
 * tests the reset capability they need without exposing the raw Map.
 *
 * COMMON MISTAKE: Do not call this function in production code paths. It
 * destroys the conversation context for every active user simultaneously.
 * It should only ever appear in `*.test.ts` files or test setup/teardown hooks.
 */
export function clearAllHistories(): void {
  histories.clear();
}
