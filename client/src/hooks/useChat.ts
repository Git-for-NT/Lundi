/**
 * client/src/hooks/useChat.ts
 *
 * PURPOSE — CONVERSATION STATE OWNERSHIP
 * ----------------------------------------
 * This hook is the single owner of all conversation state for the chat UI.
 * It holds the authoritative `messages` array that gets rendered, the
 * `isLoading` flag that governs input availability, and the `error` value
 * that surfaces failure information to the user. No component manages this
 * state directly — they receive it as props or via this hook's return value.
 *
 * DATA FLOW TO COMPONENTS
 * ------------------------
 * App.tsx
 *   └── useSession()            → sessionId (from useSession.ts)
 *   └── useChat(sessionId)      ← this file
 *         ↓ messages, isLoading, error, sendMessage, messagesEndRef
 *       ChatWindow              (renders messages, triggers auto-scroll)
 *       MessageInput            (calls sendMessage, disabled while isLoading)
 *
 * Components are purely presentational with respect to conversation data.
 * They receive state from this hook and call `sendMessage` to trigger
 * updates. This makes each component independently testable and keeps
 * side-effectful logic (API calls, state mutations) in one place.
 *
 * REQUEST ORCHESTRATION ROLE
 * ---------------------------
 * `sendMessage` is the orchestrator for the full user-turn lifecycle:
 *   1. Append the user message optimistically (instant UI feedback)
 *   2. Set isLoading = true (blocks duplicate submissions)
 *   3. Clear any previous error
 *   4. Call the API module (src/api/chat.ts)
 *   5a. On success: append assistant message, set isLoading = false
 *   5b. On error:   set error string, set isLoading = false
 *                   (user message is kept — see inline comment below)
 *
 * The hook does NOT own the sessionId — that lifecycle is handled by
 * useSession.ts and injected here as a parameter. This separation means
 * the session ID strategy (sessionStorage scope, UUID generation) can
 * change without touching this file.
 */

import { useState, useRef } from 'react';
import { sendMessage as sendMessageApi } from '../api/chat';
import { ChatMessage, ApiError } from '../types';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useChat — manage conversation state and orchestrate API requests.
 *
 * @param sessionId A UUID v4 string from useSession(). Passed unchanged to
 *                  the API module and attached to every POST /api/chat request
 *                  as the X-Session-ID header.
 *
 * @returns An object containing:
 *   - messages        The ordered list of ChatMessages to render.
 *   - isLoading       True while a request is in flight.
 *   - error           A human-readable error string, or null when healthy.
 *   - sendMessage     The submission handler called by MessageInput.
 *   - messagesEndRef  A ref to pass to ChatWindow's sentinel <div> for scroll.
 */
export function useChat(sessionId: string): {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  messagesEndRef: React.RefObject<HTMLDivElement>;
} {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // messagesEndRef — a ref to a sentinel <div> rendered at the bottom of the
  // message list inside ChatWindow. ChatWindow's useEffect calls
  // messagesEndRef.current.scrollIntoView({ behavior: 'smooth' }) whenever
  // the messages array grows, keeping the latest message in view without any
  // manual scroll management in this hook. The ref is passed as a prop so
  // ChatWindow can position the sentinel element precisely at the list's end.
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /**
   * sendMessage — the full user-turn lifecycle handler.
   *
   * Called by MessageInput when the user submits text. The function is async
   * so that MessageInput can optionally await it, but in practice the component
   * does not await — it fires and forgets, relying on state updates to reflect
   * progress.
   *
   * Common mistake to avoid: do NOT call sendMessage when isLoading is true.
   * MessageInput guards against this by disabling the input/button, but if you
   * wire sendMessage to a custom control, add a guard: `if (isLoading) return`.
   */
  const sendMessage = async (text: string): Promise<void> => {
    // Guard: do not allow submission while a request is already in flight.
    // isLoading: true causes MessageInput to disable the input and send button,
    // preventing the user from submitting again. This guard is a belt-and-
    // suspenders check for programmatic callers that bypass the UI controls.
    if (isLoading) return;

    // --- OPTIMISTIC APPEND ---------------------------------------------------
    // Append the user's message to the display list BEFORE the API call
    // resolves. This gives the UI instant perceived responsiveness — the user
    // sees their message appear in the chat bubble list immediately, without
    // waiting for the server round-trip (which may take 1–3 seconds for an
    // OpenAI completion). The conversation feels natural rather than frozen.
    //
    // crypto.randomUUID() produces a stable UUID v4 string used as the React
    // list key. A stable key is important: using array index as a key causes
    // React to misidentify elements when the list changes, leading to subtle
    // animation and focus bugs. A UUID generated once at message creation is
    // guaranteed unique and never changes for the lifetime of that message.
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);

    // isLoading: true disables the MessageInput's input field and send button
    // via their `disabled` and `aria-disabled` attributes. This prevents the
    // user from submitting duplicate messages while the current request is
    // in flight — important because each submission mutates server-side history,
    // and duplicates would pollute the conversation context sent to OpenAI.
    setIsLoading(true);

    // Clear any error from a previous failed attempt so the error banner
    // disappears as soon as the user tries again.
    setError(null);

    try {
      const reply = await sendMessageApi(text, sessionId);

      // On success: append the assistant's reply as a new ChatMessage.
      // A new UUID is generated here for the same reason as the user message —
      // stable, unique React list key.
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: reply,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      // --- ERROR MESSAGE EXTRACTION ------------------------------------------
      // Two distinct error classes can be caught here:
      //
      //   1. ApiError (thrown by src/api/chat.ts on any non-2xx HTTP response)
      //      — has a structured `.message` property set from the server's
      //      `{ error: "..." }` JSON body. Use it directly: it is already
      //      human-readable (e.g., "Failed to get a response from the AI service").
      //
      //   2. TypeError (thrown by the global `fetch` when the network request
      //      itself fails — no connection, DNS failure, CORS rejection, request
      //      aborted). The `.message` on a fetch TypeError is typically a low-
      //      level string like "Failed to fetch" that is already user-friendly
      //      enough for display, but we gate it behind a string check just in
      //      case. For any other unexpected error shape, we fall back to a
      //      generic string so the UI always has something to display.
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message || 'A network error occurred. Please try again.');
      } else {
        setError('An unexpected error occurred. Please try again.');
      }

      // --- USER MESSAGE KEPT ON ERROR ----------------------------------------
      // The user's optimistically-appended message is intentionally NOT removed
      // from the messages array when the request fails. Removing it would be
      // confusing: the user typed something, saw it appear, and then watched
      // it silently vanish — they would not know whether their message was sent
      // or lost. By keeping it visible, the user can see exactly what they
      // tried to send, decide whether to rephrase, and submit again. The error
      // banner below the chat provides the failure context. This matches the
      // behaviour of most production chat applications (Slack, iMessage, etc.)
      // which show a "failed to send" indicator on the message rather than
      // removing it entirely.
    } finally {
      // Always clear the loading state whether the request succeeded or failed.
      // Leaving isLoading = true on error would permanently disable the input,
      // making the chat interface completely unusable after any failure.
      setIsLoading(false);
    }
  };

  return { messages, isLoading, error, sendMessage, messagesEndRef };
}
