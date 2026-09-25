/**
 * client/src/components/ChatWindow.tsx
 *
 * RENDERING RESPONSIBILITIES
 * ---------------------------
 * This component owns the scrollable message list. Its responsibilities are:
 *
 *   1. RENDER THE LIST — map over the `messages` array and render one
 *      <MessageBubble> per message, delegating all per-bubble styling and
 *      accessibility markup to MessageBubble.
 *
 *   2. AUTO-SCROLL — trigger a smooth scroll to the bottom of the list
 *      whenever a new message is added, so the user always sees the most
 *      recent exchange without manually scrolling.
 *
 *   3. LOADING INDICATOR — render a transient "Thinking…" bubble after the
 *      last message while `isLoading` is true, giving the user immediate
 *      visual feedback that a reply is on its way.
 *
 * WHAT THIS COMPONENT DOES NOT DO
 * ---------------------------------
 * ChatWindow holds no state of its own and makes no API calls. It is a
 * purely presentational component with a single side effect (scroll). All
 * conversation state lives in useChat (src/hooks/useChat.ts), which passes
 * data down through App.tsx as props.
 *
 * WHERE IT FITS (data flow)
 * --------------------------
 * App.tsx
 *   └── useChat(sessionId)  → messages, isLoading, messagesEndRef
 *         ↓ props
 *       ChatWindow                   ← this file
 *         └── messages.map(msg => <MessageBubble ... />)
 *         └── {isLoading && <MessageBubble content="Thinking…" />}
 *         └── <div ref={messagesEndRef} />   ← scroll sentinel
 *
 * REQUIREMENTS ADDRESSED
 * -----------------------
 * Requirement 7.1 — renders a scrollable message list for the whole session
 * Requirement 7.6 — shows a loading indicator while a request is in flight
 * Requirement 7.7 — auto-scrolls to the most recent message on list growth
 */

import React, { useEffect } from 'react';
import { ChatMessage } from '../types';
import MessageBubble from './MessageBubble';

// ---------------------------------------------------------------------------
// Props interface
// ---------------------------------------------------------------------------

interface ChatWindowProps {
  /** The ordered list of messages to display. Comes from useChat's state. */
  messages: ChatMessage[];

  /**
   * True while POST /api/chat is in flight. Controls whether the "Thinking…"
   * indicator is rendered.
   */
  isLoading: boolean;

  /**
   * A ref to the sentinel <div> at the bottom of the message list.
   *
   * WHY IS THIS A PROP RATHER THAN CREATED HERE?
   * ---------------------------------------------
   * The ref is created in useChat (src/hooks/useChat.ts) rather than here
   * because the hook needs to coordinate scroll behaviour with its own state
   * updates. Specifically, the ref must already exist when the hook's
   * useEffect fires after setMessages() — if ChatWindow created the ref
   * internally, the hook would have no handle to it and would need to expose
   * an imperative `scrollToBottom()` function instead.
   *
   * Passing the ref as a prop keeps the contract simple: useChat owns the
   * scroll target; ChatWindow positions it precisely at the end of the list.
   */
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

/**
 * WHY INLINE STYLES?
 * ------------------
 * Consistent with MessageBubble.tsx, inline styles keep the component
 * entirely self-contained — no separate CSS file to locate or import.
 * All layout decisions are visible next to the JSX they affect, making the
 * component easy to read as a complete unit.
 */

/** The outer scrollable container that fills all available vertical space. */
const containerStyle: React.CSSProperties = {
  // flex: 1 causes this container to expand and fill the remaining height
  // between the header (if any) and the MessageInput at the bottom. Without
  // this, the container would collapse to the height of its content and the
  // chat UI would not look like a chat UI.
  flex: 1,

  // overflowY: 'auto' adds a vertical scrollbar only when the content height
  // exceeds the container height. This is what makes the list "scrollable"
  // without forcing a permanent scrollbar gutter when the conversation is short.
  overflowY: 'auto',

  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ChatWindow
 *
 * Renders the scrollable message list with automatic scroll-to-bottom
 * behaviour and a transient "Thinking…" indicator during loading.
 *
 * ACCESSIBILITY
 * -------------
 * The container is given `role="log"` and `aria-live="polite"` so that
 * screen readers announce new messages as they arrive without interrupting
 * the user mid-sentence. `aria-label` provides a descriptive name for the
 * landmark region so users navigating by landmark can identify it.
 *
 * `aria-live="polite"` (rather than "assertive") is the right choice here:
 * the assistant's replies are informational and should not interrupt the user.
 * Only critical alerts (errors, system messages) warrant "assertive".
 */
const ChatWindow: React.FC<ChatWindowProps> = ({
  messages,
  isLoading,
  messagesEndRef,
}) => {
  /**
   * Auto-scroll effect — fires whenever a new message is appended.
   *
   * DEPENDENCY ARRAY: [messages.length]
   * -------------------------------------
   * We depend on `messages.length` rather than the `messages` array itself.
   *
   * In React, every render produces a new array reference even if the array's
   * contents are identical — because `[...prev, newMsg]` in useChat always
   * creates a fresh array object. If we listed `messages` in the dependency
   * array, this effect would run on every render that produced a new array
   * reference, including re-renders caused by unrelated state changes (e.g.,
   * `isLoading` toggling). That would fire redundant scroll attempts.
   *
   * `messages.length` is a primitive (number). It only changes when a message
   * is actually added or removed, which is the exact condition under which we
   * want to scroll. This makes the effect precise and efficient.
   */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);
  // Note: messagesEndRef is intentionally omitted from the dependency array.
  // Refs are stable objects (React guarantees .current is mutable but the ref
  // object itself never changes identity), so including it would have no
  // effect on when the effect fires. ESLint's exhaustive-deps rule does not
  // flag refs for this reason.

  return (
    <div
      style={containerStyle}
      role="log"
      aria-live="polite"
      aria-label="Chat conversation"
    >
      {/* Render one MessageBubble per message in the conversation.
          msg.id is a client-generated UUID (see types.ts) — a stable, unique
          React key that prevents keying issues when the list updates. */}
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          role={msg.role}
          content={msg.content}
        />
      ))}

      {/*
        LOADING INDICATOR ("Thinking…")
        ---------------------------------
        This bubble is a transient UI element that appears ONLY while
        `isLoading` is true — i.e., from the moment the POST /api/chat request
        is dispatched until the server responds (or an error is thrown).

        It gives immediate visual feedback that the request is in flight and
        the assistant is formulating a reply. Without it, the user might think
        their message went unheard and try to submit again.

        Using <MessageBubble role="assistant"> is intentional: the indicator
        appears on the assistant's side of the conversation, aligned left with
        a grey background, exactly where the real reply will appear once it
        arrives. This makes the transition from "Thinking…" to the actual
        reply feel seamless.

        The bubble is NOT added to the `messages` state array — it is rendered
        conditionally here. This keeps the state array a pure record of real
        messages sent and received, with no transient UI artefacts mixed in.
      */}
      {isLoading && (
        <MessageBubble
          role="assistant"
          content="Thinking…"
        />
      )}

      {/*
        SCROLL SENTINEL
        ----------------
        This zero-height, zero-width <div> sits at the very bottom of the
        message list. The useEffect above calls .scrollIntoView() on it
        whenever messages.length changes, snapping the viewport to the
        bottom of the conversation.

        WHY A SENTINEL ELEMENT RATHER THAN SCROLLING THE CONTAINER DIRECTLY?
        ----------------------------------------------------------------------
        The alternative would be to get a ref to the container <div> above and
        set `containerRef.current.scrollTop = containerRef.current.scrollHeight`.
        That approach requires manually computing the scroll position and can be
        off by one pixel in some browsers depending on rounding.

        `scrollIntoView` on a zero-height element at the bottom of the list is
        simpler, more reliable, and is the idiom recommended by the React docs:
        the sentinel acts as an invisible scroll target that the browser knows
        exactly how to reveal. No arithmetic needed.

        WHY IS THE REF PASSED IN AS A PROP?
        -------------------------------------
        See the `messagesEndRef` prop comment above — the ref is created by
        useChat so the hook can coordinate scroll triggers with state updates.
      */}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatWindow;
