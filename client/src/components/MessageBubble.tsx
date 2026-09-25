/**
 * client/src/components/MessageBubble.tsx
 *
 * SINGLE RESPONSIBILITY
 * ---------------------
 * This component renders exactly ONE chat message — either a user message or
 * an assistant message. It knows nothing about the conversation as a whole; it
 * only cares about the `role` and `content` of the single message it receives.
 *
 * HOW IT FITS IN ChatWindow
 * -------------------------
 * ChatWindow holds the full list of messages and maps over them, rendering one
 * <MessageBubble> per message. The parent is responsible for layout, scrolling,
 * and the loading indicator; this component is responsible only for the visual
 * presentation of a single bubble.
 *
 *   ChatWindow
 *     └── messages.map(msg => <MessageBubble key={msg.id} role={msg.role} content={msg.content} />)
 *
 * WHY IT'S SEPARATE FROM ChatWindow
 * ----------------------------------
 * Separating the bubble into its own component means:
 *  1. Each concern is independently testable — you can render a MessageBubble
 *     in isolation without mounting the entire conversation list.
 *  2. Styling changes to bubbles don't touch scrolling/layout logic, and vice
 *     versa, keeping diffs small and focused.
 *  3. If the bubble design ever needs to change (e.g., adding avatars, markdown
 *     rendering, timestamps), the change is contained to this file.
 *
 * REQUIREMENTS ADDRESSED
 * ----------------------
 * Requirement 7.1 — renders messages in the scrollable list (via ChatWindow)
 * Requirement 7.2 — visually distinguishes user vs assistant messages
 */

import React from 'react';

// ---------------------------------------------------------------------------
// Props interface
// ---------------------------------------------------------------------------

/**
 * Props for MessageBubble.
 *
 * We use the same `role` union as ChatMessage ('user' | 'assistant') rather
 * than importing the full ChatMessage interface, because this component only
 * needs these two fields. Keeping the prop type narrow avoids an unnecessary
 * coupling to the full ChatMessage shape.
 */
interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

/**
 * WHY INLINE STYLES?
 * ------------------
 * Inline styles are used throughout this component to keep it entirely
 * self-contained. There is no separate CSS file to hunt down — everything
 * that affects the appearance of a bubble lives here, making the component
 * easy to read and understand as a unit.
 *
 * This is a deliberate choice for a learning project: the visual intent is
 * immediately visible next to the JSX, reinforcing the connection between
 * structure and appearance.
 *
 * TRADE-OFFS of inline styles:
 *  - Styles cannot be overridden with CSS class selectors from a parent.
 *  - Media queries and pseudo-classes (`:hover`, `:focus`) are not supported
 *    without additional libraries (e.g., a CSS-in-JS solution like Emotion).
 *  - For a production app with complex theming needs, a CSS module or styled-
 *    component approach would be preferable.
 */

/** Outer wrapper for a single message row — controls horizontal alignment. */
const getWrapperStyle = (role: 'user' | 'assistant'): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  // User messages are pushed to the right; assistant messages to the left.
  alignItems: role === 'user' ? 'flex-end' : 'flex-start',
  marginBottom: '12px',
});

/**
 * The bubble itself — coloured background with rounded corners.
 *
 * MAX-WIDTH EXPLANATION
 * ---------------------
 * Bubbles are capped at 75% of the container width. Without a max-width, a
 * long message would stretch the bubble all the way across the chat window,
 * which looks unnatural and is harder to read. A max-width forces long text to
 * wrap within a reasonably sized bubble, matching the visual convention of
 * every major chat application.
 */
const getBubbleStyle = (role: 'user' | 'assistant'): React.CSSProperties => ({
  maxWidth: '75%',
  padding: '10px 14px',
  borderRadius: role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
  // User: blue background with white text (high contrast, clearly the sender).
  // Assistant: light grey with near-black text (neutral, clearly the responder).
  backgroundColor: role === 'user' ? '#007bff' : '#e9ecef',
  color: role === 'user' ? '#ffffff' : '#212529',
  fontSize: '15px',
  lineHeight: '1.5',
  wordBreak: 'break-word', // prevents long URLs or words from overflowing
});

/** Small label shown above each bubble to identify the sender. */
const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#6c757d',
  marginBottom: '4px',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * MessageBubble
 *
 * Renders a single chat message with:
 *  - A role label above the bubble (`You` or `Assistant`)
 *  - A coloured, rounded bubble containing the message text
 *  - Appropriate alignment (right for user, left for assistant)
 *
 * ACCESSIBILITY
 * -------------
 * Each bubble is wrapped in a <div> with `role="article"` so screen readers
 * treat it as a discrete, self-contained piece of content within the message
 * list — similar to how individual posts are marked up in a feed.
 *
 * The `aria-label` on that element includes the sender name (e.g., "Message
 * from You" or "Message from Assistant"), giving screen reader users an
 * audible cue about who sent the message before the content is read aloud.
 * This mirrors the visual role label above the bubble, satisfying the
 * principle of equivalent experience for assistive technology users.
 *
 * ROLE LABEL (`You` / `Assistant`)
 * ----------------------------------
 * The small text label above each bubble helps users orient themselves in
 * the conversation at a glance — especially important when messages are
 * close together or the colour contrast alone is not sufficient (e.g., for
 * users with certain colour vision deficiencies). It acts as a redundant
 * visual cue alongside alignment and colour.
 */
const MessageBubble: React.FC<MessageBubbleProps> = ({ role, content }) => {
  // Map the role value to a human-readable display name.
  const label = role === 'user' ? 'You' : 'Assistant';

  return (
    <div style={getWrapperStyle(role)}>
      {/* Role label — helps users distinguish whose message is whose,
          important for accessibility and for readability when scrolling
          quickly through a long conversation. */}
      <span style={labelStyle} aria-hidden="true">
        {label}
      </span>

      {/* role="article" marks this as a self-contained piece of content.
          aria-label provides a screen-reader-friendly description that
          identifies the sender before the message content is announced. */}
      <div
        role="article"
        aria-label={`Message from ${label}`}
        style={getBubbleStyle(role)}
      >
        {content}
      </div>
    </div>
  );
};

export default MessageBubble;
