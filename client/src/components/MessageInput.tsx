/**
 * client/src/components/MessageInput.tsx
 *
 * INPUT LIFECYCLE
 * ---------------
 * 1. User types → each keystroke calls the onChange handler, which updates
 *    the local `value` state via setState. This is a controlled input: React
 *    owns the source of truth for the field's content at all times.
 * 2. User submits (Enter key or button click) → handleSubmit runs:
 *      a. Guards against empty/whitespace-only input (no-op if blank).
 *      b. Calls onSubmit(value.trim()) to hand off the message to the caller.
 *      c. Clears local `value` to '' so the field is ready for the next message.
 * 3. While a request is in progress (isLoading = true), both the input and the
 *    button are disabled so the user cannot trigger a second submission before
 *    the first one resolves.
 *
 * ARCHITECTURE PLACEMENT
 * -----------------------
 * This component is rendered by App.tsx. It receives:
 *   - onSubmit: useChat's `sendMessage` function, passed down via App.tsx.
 *   - isLoading: useChat's `isLoading` flag, passed down via App.tsx.
 *
 * MessageInput owns ONLY local input state. All conversation state
 * (messages array, loading flag, error) lives in useChat — this component is
 * purely concerned with capturing and submitting text.
 *
 * ACCESSIBILITY RATIONALE
 * ------------------------
 * Both `disabled` and `aria-disabled` are set to `isLoading` on the input and
 * button. Using both attributes together is the safest approach for loading
 * states:
 *   - `disabled` prevents interaction and visually signals the unavailable state
 *     to sighted users.
 *   - `aria-disabled` keeps the element in the tab order so screen reader users
 *     can still navigate to it and hear that it is currently disabled — which
 *     is more informative than silently skipping over it.
 * See the inline comment on the button for a deeper explanation of the trade-off.
 */

import { useState, KeyboardEvent } from 'react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MessageInputProps {
  /** Called with the trimmed message text when the user submits. */
  onSubmit: (text: string) => void;
  /** When true, the input and button are disabled to prevent duplicate sends. */
  isLoading: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * MessageInput — controlled text input with submit-on-Enter and send button.
 *
 * Responsibilities:
 *  - Maintain local `value` state for the controlled <input>.
 *  - Submit the message on Enter key press (with IME guard) or button click.
 *  - Clear the input after submitting.
 *  - Disable the input and button while isLoading is true.
 */
export function MessageInput({ onSubmit, isLoading }: MessageInputProps) {
  // Local state for the controlled input. This component owns the raw text
  // the user is typing; it does NOT own the conversation state — that lives
  // in useChat. Keeping input state local avoids unnecessary re-renders of
  // sibling components (like ChatWindow) on every keystroke.
  const [value, setValue] = useState('');

  // ---------------------------------------------------------------------------
  // handleSubmit
  // ---------------------------------------------------------------------------

  /**
   * Core submission logic, shared by the Enter key handler and the button's
   * onClick. Extracted into a named function to avoid duplicating the guard
   * logic and to make the intent explicit.
   */
  const handleSubmit = () => {
    // Guard: reject empty or whitespace-only input at the component level.
    // This matches the server-side validation in `validateMessage` (server/src/
    // middleware/validate.ts), which rejects messages that are absent or not a
    // non-empty string after trimming. Catching it here avoids a round-trip
    // for a request we know will return HTTP 400, and prevents the user from
    // accidentally submitting a blank message by pressing Enter on an empty field.
    if (!value.trim()) return;

    // Call the parent's onSubmit with the trimmed text BEFORE clearing local
    // state. Order matters here: if `setValue('')` were called first, `value`
    // would already be '' by the time `onSubmit` reads it — the handler would
    // receive an empty string instead of the user's message. Clearing AFTER
    // the call ensures the full text is delivered to the hook, which then
    // appends it to the conversation and fires the API request.
    onSubmit(value.trim());

    // Clear the input after handing off the message. The user's text now lives
    // in useChat's state as a ChatMessage; the local copy is no longer needed.
    setValue('');
  };

  // ---------------------------------------------------------------------------
  // onKeyDown — Enter key handler
  // ---------------------------------------------------------------------------

  /**
   * Handles Enter key presses on the input field.
   *
   * WHY THE isComposing CHECK?
   * On operating systems with Input Method Editors (IME) — used for CJK
   * languages (Chinese, Japanese, Korean) where a single character may be
   * assembled from multiple keystrokes — the browser fires a `keydown` event
   * with key === 'Enter' when the user confirms a candidate character from the
   * IME suggestion list. Without the `isComposing` guard, that confirmation
   * keystroke would simultaneously close the IME suggestion and submit the
   * in-progress, not-yet-complete message. The result is an accidental send
   * of a partial word.
   *
   * `event.nativeEvent.isComposing` is `true` while an IME composition session
   * is active (i.e., between compositionstart and compositionend events).
   * Checking `!event.nativeEvent.isComposing` ensures we only submit when the
   * Enter key is pressed outside of an active composition — i.e., when it
   * genuinely means "send this message" in every locale.
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      handleSubmit();
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: '8px',
        padding: '12px 16px',
        borderTop: '1px solid #e0e0e0',
        backgroundColor: '#ffffff',
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message…"
        disabled={isLoading}
        // aria-disabled keeps the element in the tab order for screen readers
        // while signalling it is currently unavailable. Together with `disabled`
        // this covers both sighted users (visual disabled state) and screen reader
        // users (can tab to the element and hear it described as disabled).
        aria-disabled={isLoading}
        aria-label="Message input"
        style={{
          flex: 1,
          padding: '10px 14px',
          fontSize: '14px',
          borderRadius: '6px',
          border: '1px solid #ccc',
          outline: 'none',
          opacity: isLoading ? 0.6 : 1,
          cursor: isLoading ? 'not-allowed' : 'text',
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={isLoading}
        // DISABLED vs ARIA-DISABLED TRADE-OFF
        // `disabled` prevents all pointer and keyboard events and removes the
        // element from the tab order entirely — screen readers skip over it as
        // if it doesn't exist. `aria-disabled` keeps the element focusable and
        // announces it as disabled to assistive technology, giving screen reader
        // users the context that a send button exists but cannot be used right
        // now (rather than wondering whether the button has vanished).
        // Using both together: sighted users see the native disabled visual state;
        // screen reader users can still navigate to the button and hear it's
        // temporarily unavailable. This is the safest approach for interactive
        // controls that are disabled due to transient loading state.
        aria-disabled={isLoading}
        aria-label="Send message"
        style={{
          padding: '10px 20px',
          fontSize: '14px',
          fontWeight: 600,
          borderRadius: '6px',
          border: 'none',
          backgroundColor: isLoading ? '#a0aec0' : '#3b82f6',
          color: '#ffffff',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          flexShrink: 0,
          transition: 'background-color 0.15s ease',
        }}
      >
        Send
      </button>
    </div>
  );
}
