/**
 * server/src/routes/chat.ts
 *
 * PURPOSE
 * -------
 * This module defines the POST /api/chat route handler — the heart of the
 * server. It wires together validation, history management, and the OpenAI
 * service into a single, linear request pipeline and enforces consistent
 * error handling for every failure mode.
 *
 * ARCHITECTURE PLACEMENT
 * ----------------------
 * This file sits at the centre of the server's dependency graph:
 *
 *   src/app.ts
 *     → src/routes/chat.ts  ← this file
 *         → src/middleware/validate.ts  (validateSessionId, validateMessage)
 *         → src/store/history.ts        (getOrCreateHistory, appendMessage)
 *         → src/services/openai.ts      (getCompletion, SYSTEM_PROMPT)
 *
 * REQUEST FLOW — END TO END
 * -------------------------
 * 1. validateSessionId middleware runs first — reads X-Session-ID header and
 *    checks it against the UUID v4 regex. Responds 400 if invalid, otherwise
 *    passes control to the next middleware via next().
 *
 * 2. validateMessage middleware runs second — reads req.body.message and
 *    checks it is a non-empty, non-whitespace-only string. Responds 400 if
 *    invalid, otherwise passes control to the route handler via next().
 *
 * 3. getOrCreateHistory(sessionId, SYSTEM_PROMPT) — retrieves the existing
 *    conversation history array for this session, or creates a new one seeded
 *    with the system prompt if this is the session's first message.
 *
 * 4. appendMessage(sessionId, { role: 'user', content: message }) — appends
 *    the user's new message to the history BEFORE calling OpenAI. This is
 *    intentional: see the inline comment on this step for the full reasoning.
 *
 * 5. getCompletion(history) — sends the full conversation history (including
 *    the just-appended user message) to the OpenAI Chat Completions API and
 *    awaits the assistant's reply string.
 *    ├── OpenAI error → log + 502 { error: "Failed to get a response from the AI service" }
 *    └── success      → appendMessage(sessionId, { role: 'assistant', content: reply })
 *                        → 200 { reply }
 *
 * 6. Unexpected error (outer catch-all) → log + 500 { error: "An unexpected error occurred" }
 */

import { Router, Request, Response } from 'express';
import { validateMessage, validateSessionId } from '../middleware/validate';
import { getOrCreateHistory, appendMessage } from '../store/history';
import { getCompletion, SYSTEM_PROMPT } from '../services/openai';
import { ChatRequest, ChatResponse, ErrorResponse } from '../types';

const router = Router();

/**
 * POST /api/chat
 *
 * The route handler is intentionally kept thin: it does nothing except
 * coordinate calls to purpose-built modules in the correct order. All input
 * validation is delegated to middleware, all state management is delegated to
 * the history store, and all OpenAI communication is delegated to the service
 * layer. The handler's only job is to sequence these calls and map outcomes
 * to the correct HTTP responses.
 */
router.post(
  '/chat',
  validateSessionId, // Step 1: reject requests with missing or malformed session IDs
  validateMessage,   // Step 2: reject requests with missing or blank message bodies
  async (req: Request, res: Response): Promise<void> => {
    // Both middleware guards have already run by this point. It is safe to
    // cast these values: validateSessionId guarantees a string UUID v4 in the
    // header, and validateMessage guarantees a non-empty string in req.body.message.
    const sessionId = req.headers['x-session-id'] as string;
    const { message } = req.body as ChatRequest;

    // Step 3: Retrieve (or initialise) the conversation history for this session.
    // On the very first message for a new sessionId this creates the history array
    // and seeds it with the system prompt, satisfying Requirement 5.2.
    const history = getOrCreateHistory(sessionId, SYSTEM_PROMPT);

    // Step 4: Append the user message to history BEFORE calling OpenAI.
    //
    // WHY PRE-APPEND? Two reasons:
    //
    //   a) CORRECTNESS (Requirement 3.5): The OpenAI API receives the full
    //      conversation context including the new user message. If we appended
    //      after the API call we would be sending history that is one message
    //      short, causing the model to respond without seeing what the user
    //      just said.
    //
    //   b) CRASH SAFETY: If the process crashes mid-call (e.g. an OOM kill
    //      between the API response and the append), the user message is already
    //      in history. This prevents a "ghost turn" where the assistant replied
    //      but the user message was lost, which would corrupt all subsequent
    //      OpenAI calls for this session by introducing an orphaned assistant
    //      message with no preceding user message.
    //
    //   The trade-off: if the process crashes after the user append but before
    //   the assistant append, history will contain an unanswered user message.
    //   This is the lesser evil — the conversation is recoverable by the user
    //   simply sending another message.
    appendMessage(sessionId, { role: 'user', content: message });

    // Step 5 (OpenAI call) is wrapped in its own try/catch to distinguish
    // OpenAI / service errors (502) from unexpected programmer errors (500).
    // Using nested try/catch blocks is the clearest way to express "these two
    // failure modes require different HTTP status codes". A single flat
    // try/catch with an error-type inspection would work but obscures intent.
    try {
      let reply: string;

      try {
        // Step 5: Send the full history (system prompt + all prior turns +
        // the user message appended in step 4) to the OpenAI API.
        // getCompletion returns the assistant's reply as a plain string.
        reply = await getCompletion(history);
      } catch (openAiError) {
        // OpenAI errors: network failures, authentication errors, rate limits,
        // model errors, or an empty response (thrown by getCompletion itself).
        // Log the detail server-side, but send a generic message to the client
        // to avoid leaking API internals or sensitive error detail.
        console.error('[chat] OpenAI API error:', openAiError);
        const body: ErrorResponse = {
          error: 'Failed to get a response from the AI service',
        };
        res.status(502).json(body);
        return;
      }

      // Step 5 (success branch): Append the assistant's reply to the history
      // so that subsequent turns include this exchange as context for the
      // next OpenAI API call (Requirement 5.3).
      appendMessage(sessionId, { role: 'assistant', content: reply });

      // Respond to the client with the assistant's reply (Requirement 3.6).
      const body: ChatResponse = { reply };
      res.status(200).json(body);
    } catch (unexpectedError) {
      // Step 6: Catch-all for errors that should never occur in normal
      // operation: bugs in orchestration logic, unexpected throws from the
      // history store, etc. Log with full detail server-side and return a
      // deliberately vague message to the client so implementation internals
      // are not exposed (Requirement 3.8).
      console.error('[chat] Unexpected error:', unexpectedError);
      const body: ErrorResponse = {
        error: 'An unexpected error occurred',
      };
      res.status(500).json(body);
    }
  },
);

export default router;
