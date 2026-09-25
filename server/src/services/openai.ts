/**
 * server/src/services/openai.ts
 *
 * PURPOSE
 * -------
 * This module is the single point of contact between the Express server and
 * the OpenAI Chat Completions API. It wraps the OpenAI Node.js SDK, defines
 * the assistant's system prompt, and exports a `getCompletion` function that
 * accepts a full conversation history and returns the model's reply as a plain
 * string.
 *
 * ARCHITECTURE PLACEMENT
 * ----------------------
 * This file sits between the route handler and the external OpenAI API:
 *
 *   src/routes/chat.ts        (orchestrates the request — calls this module)
 *       ↓
 *   src/services/openai.ts    ← this file
 *       ↓
 *   OpenAI API (HTTPS POST /v1/chat/completions)
 *
 * The route handler never constructs API payloads or touches the SDK directly.
 * Keeping that logic here means the SDK can be swapped out, the model changed,
 * or retries added without touching any routing code.
 *
 * REQUEST FLOW POSITION — STEP 10
 * --------------------------------
 * The end-to-end request flow is (abbreviated):
 *   1–7.  Client → Vite proxy → Express middleware (CORS, JSON, validation)
 *   8.    getOrCreateHistory — initialise or retrieve the session history
 *   9.    appendMessage — append the user's new message to the history
 *  10. →  getCompletion(history) — THIS FILE sends the API call to OpenAI
 *  11.    appendMessage — append the assistant reply to the history
 *  12.    res.json({ reply }) — route handler returns the reply to the client
 */

import OpenAI from 'openai';
import { Message } from '../types';

// ---------------------------------------------------------------------------
// OpenAI client
// ---------------------------------------------------------------------------

/**
 * The OpenAI SDK client instance.
 *
 * `new OpenAI()` with no arguments automatically reads `OPENAI_API_KEY` from
 * `process.env`. The key is validated at server startup (src/index.ts), so by
 * the time any request reaches this module the key is guaranteed to be present.
 *
 * Common mistake: do NOT pass `apiKey` explicitly here by reading
 * `process.env.OPENAI_API_KEY` yourself — the SDK's auto-read behaviour keeps
 * the key in one place and avoids accidentally logging it if you ever add
 * debug output around the constructor call.
 */
const client = new OpenAI(); // reads OPENAI_API_KEY from process.env automatically

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

/**
 * The system prompt is the first message sent to the OpenAI API in every
 * conversation. It configures the assistant's persona, tone, and behavioural
 * constraints for the entire session.
 *
 * HOW IT WORKS
 * ------------
 * The OpenAI Chat Completions API treats a message with `role: 'system'` as
 * developer-level instructions — it shapes how the model responds to all
 * subsequent `user` and `assistant` messages. It is never shown to the end
 * user in the UI, but it has the strongest influence on the model's behaviour.
 *
 * WHY IT IS EXPORTED
 * ------------------
 * The route handler passes this value to `getOrCreateHistory` (src/store/history.ts)
 * when a new session is created, so the prompt is injected exactly once as the
 * first element of the history array. Exporting it from this module keeps the
 * prompt co-located with the OpenAI integration code, which is the logical
 * place to change it.
 *
 * CUSTOMISATION
 * -------------
 * Edit this string to change the assistant's personality, add domain-specific
 * instructions, enforce output formats (e.g., always respond in bullet points),
 * or restrict topics. Keep prompts concise — every token here is sent with
 * every API call and counts toward the model's context-window limit.
 */
const SYSTEM_PROMPT = `You are a helpful, concise, and friendly AI assistant.
You answer questions clearly and admit when you don't know something.`;

export { SYSTEM_PROMPT };

// ---------------------------------------------------------------------------
// getCompletion
// ---------------------------------------------------------------------------

/**
 * Sends the full conversation history to the OpenAI Chat Completions API and
 * returns the assistant's reply as a plain string.
 *
 * @param messages - The complete conversation history for the session.
 *
 *   THE MESSAGES ARRAY FORMAT
 *   -------------------------
 *   This array contains the *entire* conversation context in chronological
 *   order — not just the latest message. The OpenAI API is stateless: it has
 *   no memory of previous calls, so every request must re-send the full
 *   history so the model can produce a coherent, contextually aware reply.
 *
 *   A typical array for a session after two user turns looks like this:
 *
 *     [
 *       { role: 'system',    content: 'You are a helpful...' },  // always index 0
 *       { role: 'user',      content: 'Hello!' },
 *       { role: 'assistant', content: 'Hi! How can I help?' },
 *       { role: 'user',      content: 'What is TypeScript?' },   // ← latest message
 *     ]
 *
 *   The system prompt is always first. Prior assistant turns are included so
 *   the model can reference them. The newest user message is last.
 *
 *   This array is built by src/store/history.ts and src/routes/chat.ts before
 *   this function is called (steps 8–9 of the request flow).
 *
 * @returns The assistant's reply text (non-empty, ready to send to the client).
 * @throws  {Error} If the OpenAI API returns an empty or missing `content` field.
 * @throws  Propagates any network or API-level error thrown by the SDK.
 *
 * STREAMING vs NON-STREAMING
 * --------------------------
 * This implementation uses the non-streaming Chat Completions API:
 *   - Non-streaming: the server waits for the model to finish generating the
 *     entire reply before responding. Simpler to implement — one `await`, one
 *     string. The client sees the full response appear at once.
 *   - Streaming: the API sends tokens as they are generated (Server-Sent Events
 *     or chunked transfer). The client can render words as they arrive, giving
 *     a "typewriter" effect with dramatically better perceived responsiveness,
 *     especially for long answers. However, it requires a streaming-aware route
 *     handler, changes to the HTTP response lifecycle, and more complex client
 *     rendering logic.
 *
 * For a learning project non-streaming is the right starting point. Streaming
 * is a natural next extension once the core flow is working.
 */
export async function getCompletion(messages: Message[]): Promise<string> {
  const response = await client.chat.completions.create({
    /**
     * MODEL SELECTION WITH DEFAULT FALLBACK
     * --------------------------------------
     * `process.env.OPENAI_MODEL` lets you swap the model at runtime without
     * changing code. For example, set `OPENAI_MODEL=gpt-4o` in server/.env to
     * use GPT-4o instead.
     *
     * The `?? 'gpt-3.5-turbo'` nullish-coalescing fallback activates when the
     * variable is absent or undefined (but NOT when it is an empty string — use
     * `|| 'gpt-3.5-turbo'` if you also want to guard against an empty string).
     * The default makes the server runnable out of the box with just an API key,
     * without requiring the developer to set every optional environment variable.
     */
    model: process.env.OPENAI_MODEL ?? 'gpt-3.5-turbo',

    // Pass the full conversation history — system prompt + all prior turns +
    // the new user message. The OpenAI API expects this exact shape.
    messages,
  });

  /**
   * RESPONSE SHAPE
   * --------------
   * The OpenAI Chat Completions API returns an object with a `choices` array.
   * Each element represents one independently generated completion. Because this
   * call does not set `n` (number of completions), the API always returns exactly
   * one choice, so index 0 is the only element we need.
   *
   * Full path to the reply text:
   *   response.choices[0].message.content
   *
   * Optional chaining (`?.`) is used defensively: if `choices` were somehow
   * empty (which the API should never return, but TypeScript cannot verify), the
   * expression evaluates to `undefined` instead of throwing a TypeError, and the
   * guard below catches it cleanly.
   */
  const content = response.choices[0]?.message?.content;

  /**
   * WHY WE THROW ON EMPTY CONTENT
   * ------------------------------
   * The route handler (src/routes/chat.ts) always expects `getCompletion` to
   * resolve with a non-empty string — it passes the result directly into
   * `appendMessage` and `res.json({ reply })`. If `content` were `null` or
   * `undefined`, silently returning it would produce a broken response body
   * (`{ reply: null }`) that the client cannot render, and the null would be
   * stored in conversation history, corrupting all future API calls for that
   * session.
   *
   * Throwing here converts the unexpected state into an explicit error that
   * the route handler's try/catch will catch and convert into a proper HTTP 502
   * response — the same path followed for all other OpenAI API failures.
   */
  if (!content) throw new Error('Empty response from OpenAI');

  return content;
}
