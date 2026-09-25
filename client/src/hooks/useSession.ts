/**
 * client/src/hooks/useSession.ts
 *
 * PURPOSE
 * -------
 * Manages the browser-tab-scoped session ID that ties the client's conversation
 * to the server's in-memory history. This hook generates a UUID v4 on first
 * render, persists it to sessionStorage, and returns the same stable value on
 * every subsequent render for the lifetime of the tab.
 *
 * ARCHITECTURE PLACEMENT
 * ----------------------
 * This hook sits at the top of the client's session lifecycle and is called
 * exactly once — in App.tsx at app mount. The session ID it returns flows
 * downward into useChat and from there into src/api/chat.ts, where it is
 * attached to every POST /api/chat request as the X-Session-ID header.
 *
 *   App.tsx
 *     └── useSession()          ← this file (called once, at mount)
 *           ↓ sessionId: string
 *         useChat(sessionId)    ← src/hooks/useChat.ts
 *           ↓
 *         api/chat.sendMessage  ← src/api/chat.ts (sets X-Session-ID header)
 *           ↓
 *         POST /api/chat        ← Express server
 *
 * WHY sessionStorage AND NOT localStorage?
 * -----------------------------------------
 * sessionStorage is scoped to a single browser tab and is automatically
 * cleared when that tab is closed. This is intentional and mirrors the
 * server's own storage model:
 *
 *   • The server keeps conversation history in a plain JavaScript Map in
 *     process memory. That Map is gone the moment the server process exits
 *     or restarts. Storing the session ID in localStorage would persist it
 *     across browser restarts, meaning a returning user could present a
 *     session ID that the server no longer recognises — the server would
 *     silently start a new history for that ID, making the client think it is
 *     resuming a conversation that the server has already forgotten.
 *
 *   • sessionStorage provides the right lifetime guarantee: one tab, one
 *     session. Opening a new tab always yields a fresh session ID and a fresh
 *     conversation, which is both predictable for the user and consistent with
 *     the server's ephemeral storage.
 *
 * WHAT HAPPENS WHEN THE TAB IS CLOSED?
 * --------------------------------------
 * sessionStorage is wiped when the tab closes. The next time the user opens
 * the app (in a new tab or after reopening the browser), sessionStorage will
 * be empty, this hook will generate a brand-new UUID, and a fresh conversation
 * will begin — exactly as expected.
 *
 * WHAT HAPPENS WHEN THE SERVER RESTARTS?
 * ----------------------------------------
 * The server discards all in-memory history on restart. If the client still
 * has a session ID in sessionStorage (i.e., the tab remained open across a
 * server restart), the server will simply not find that session ID in its Map
 * and will initialise a new history entry for it, prepending the system prompt
 * as if it were the very first message. The conversation effectively resets
 * from the server's perspective, even though the client sends the same ID.
 * This is acceptable behaviour for a development/learning project; a
 * production system might detect this by versioning session state or using
 * a persistent store.
 */

import { useState } from 'react';

/**
 * Returns a stable UUID v4 session ID for the current browser tab.
 *
 * Called once at app mount (in App.tsx). The returned string is constant for
 * the entire lifetime of the tab — useState with a lazy initialiser guarantees
 * the setup logic runs only once, on mount, regardless of re-renders.
 *
 * Common mistake to avoid: do NOT call this hook inside a component that
 * unmounts and remounts (e.g., inside a conditional render). If the component
 * tree that holds this hook is torn down and recreated, React discards the
 * state and the initialiser re-runs, potentially generating a new session ID
 * mid-conversation. Keep useSession at the root (App.tsx) to prevent this.
 */
export function useSession(): string {
  const [sessionId] = useState<string>(() => {
    // WHY A FUNCTION (LAZY INITIALISER) RATHER THAN A DIRECT VALUE?
    //
    // If we wrote:  useState(sessionStorage.getItem('chatSessionId') ?? ...)
    // React would evaluate that expression on EVERY render and pass the result
    // to useState, which would then ignore it after the first render anyway.
    // That is wasteful and could cause subtle issues with tools that track
    // expression evaluation.
    //
    // By passing a function, React calls it exactly once — on the initial
    // render — and caches the result. Subsequent renders skip the function
    // entirely. This is the idiomatic React pattern for expensive or
    // side-effectful initialisers.
    const stored = sessionStorage.getItem('chatSessionId');
    if (stored) return stored;

    // crypto.randomUUID() is part of the Web Crypto API, available in all
    // modern browsers (Chrome 92+, Firefox 95+, Safari 15.4+) without any
    // import or polyfill. It produces a UUID v4 string in the canonical
    // xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx format, which matches the UUID v4
    // validation regex used by the server's validateSessionId middleware:
    //   /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    const id = crypto.randomUUID();
    sessionStorage.setItem('chatSessionId', id);
    return id;
  });

  return sessionId;
}
