/**
 * client/src/App.tsx
 *
 * ROOT COMPONENT ROLE
 * --------------------
 * App is the single wiring point for the entire chat UI. It is the only
 * component that calls the session and chat hooks — both pieces of state
 * originate here and are threaded down to child components as props. No
 * child component calls useSession or useChat independently; doing so would
 * create separate, isolated state instances that could not communicate with
 * each other (each hook call produces its own React state, disconnected from
 * every other call).
 *
 * WHY SESSION AND CHAT STATE LIVE HERE
 * --------------------------------------
 * Keeping both hooks at the root achieves three things:
 *
 *   1. SINGLE SOURCE OF TRUTH — the messages array, loading flag, error
 *      string, and session ID are all owned in one place. ChatWindow and
 *      MessageInput never have to reconcile conflicting state from separate
 *      hook calls.
 *
 *   2. PROP THREADING PATTERN — App passes state down to ChatWindow and
 *      MessageInput as explicit props. This makes the data flow visible in
 *      code: you can read App.tsx top-to-bottom and trace exactly which piece
 *      of state each component receives, without hunting through multiple
 *      files. An alternative (e.g., React Context or a state library) would
 *      reduce prop count but add indirection and complexity that is not
 *      justified for this application's size.
 *
 *   3. STABLE SESSION ID — useSession is called once, here at the root, so
 *      the session ID is initialised exactly once per tab lifetime and never
 *      re-generated. If useSession were called inside a component lower in
 *      the tree (e.g., inside a conditional render), React could unmount and
 *      remount that component, triggering a new call to useState's lazy
 *      initialiser and silently generating a fresh session ID mid-conversation.
 *
 * PROP THREADING PATTERN (summary)
 * ----------------------------------
 * App
 *   ├── useSession()          → sessionId
 *   └── useChat(sessionId)    → messages, isLoading, error, sendMessage, messagesEndRef
 *         ↓                         ↓
 *       ChatWindow              MessageInput
 *       (messages, isLoading,   (onSubmit=sendMessage,
 *        messagesEndRef)         isLoading)
 *
 * REQUIREMENTS ADDRESSED
 * -----------------------
 * Requirement 7.8 — error state from useChat is surfaced between ChatWindow
 *                   and MessageInput so failures are always visible without
 *                   crashing the app.
 */

import { useSession } from './hooks/useSession';
import { useChat } from './hooks/useChat';
import ChatWindow from './components/ChatWindow';
import { MessageInput } from './components/MessageInput';

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

/**
 * App — root component; owns all session and conversation state.
 *
 * This component has no props of its own. It mounts once, calls both hooks,
 * and renders the three visual regions of the chat UI: the header, the
 * scrollable message window (with optional error banner), and the input bar.
 */
export default function App() {
  // useSession is called once here at the root so the session ID is stable
  // for the app's entire lifetime. The returned string is a UUID v4 read from
  // (or written to) sessionStorage on first render, then held in React state
  // without ever changing. See src/hooks/useSession.ts for the full rationale
  // on why sessionStorage is used instead of localStorage.
  const sessionId = useSession();

  // useChat orchestrates all conversation state for the UI.
  //
  // PROP THREADING PATTERN — rather than having ChatWindow and MessageInput
  // each call useChat independently (which would create two completely separate
  // state instances with no shared messages array), App calls the hook once and
  // distributes the returned values down as props. This keeps the messages list,
  // loading flag, and error string in one canonical location, so both child
  // components always see exactly the same snapshot of conversation state.
  const { messages, isLoading, error, sendMessage, messagesEndRef } = useChat(sessionId);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        maxWidth: '800px',
        margin: '0 auto',
        // Clip content so ChatWindow's flex: 1 fills the space between the
        // header and the input bar without causing the page itself to scroll.
        overflow: 'hidden',
      }}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <header
        style={{
          padding: '16px',
          borderBottom: '1px solid #e0e0e0',
          backgroundColor: '#ffffff',
          flexShrink: 0,
        }}
      >
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
          Lundi — AI Chatbot
        </h1>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Message list                                                         */}
      {/* ------------------------------------------------------------------ */}
      {/*
        ChatWindow receives the full messages array plus isLoading (for the
        "Thinking…" indicator) and messagesEndRef (for auto-scroll). It has
        no knowledge of sessionId or the sendMessage handler — those are only
        needed by the input layer.
      */}
      <ChatWindow
        messages={messages}
        isLoading={isLoading}
        messagesEndRef={messagesEndRef}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Error banner                                                         */}
      {/*                                                                      */}
      {/* WHY HERE (between ChatWindow and MessageInput)?                      */}
      {/* The banner is rendered at the bottom of the visible viewport, just  */}
      {/* above the input bar. This placement means errors are always visible  */}
      {/* without the user having to scroll up through the message list —     */}
      {/* critical when a long conversation pushes the error above the fold.  */}
      {/*                                                                      */}
      {/* WHY IT DOES NOT CRASH THE APP:                                       */}
      {/* This is a conditional render of a plain <div>. When `error` is null  */}
      {/* (the normal, healthy state) the expression short-circuits and React  */}
      {/* renders nothing. When `error` is a string (set by useChat's catch    */}
      {/* block after any API or network failure), React renders the banner    */}
      {/* and the rest of the tree — including ChatWindow and MessageInput —   */}
      {/* continues to render normally. The app remains fully interactive:    */}
      {/* the user can read the error, type a new message, and try again. The  */}
      {/* error is cleared at the start of the next sendMessage call.          */}
      {/* ------------------------------------------------------------------ */}
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            padding: '8px 16px',
            backgroundColor: '#fee2e2',
            color: '#dc2626',
            fontSize: '13px',
            borderTop: '1px solid #fca5a5',
            flexShrink: 0,
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Input bar                                                            */}
      {/* ------------------------------------------------------------------ */}
      {/*
        MessageInput receives only what it needs: the submit handler and the
        loading flag. It owns its own local text state internally (controlled
        input) and calls onSubmit(text) when the user presses Enter or clicks
        Send. It has no knowledge of the messages array, session ID, or error.
      */}
      <MessageInput onSubmit={sendMessage} isLoading={isLoading} />
    </div>
  );
}
