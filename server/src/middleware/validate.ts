/**
 * server/src/middleware/validate.ts
 *
 * PURPOSE
 * -------
 * Express middleware functions that validate incoming request data before it
 * reaches the route handler. Validation is extracted into this dedicated
 * middleware module rather than living inside the route handler for three
 * reasons:
 *
 *   1. SINGLE RESPONSIBILITY — The route handler's job is to orchestrate
 *      business logic (fetch history, call OpenAI, return a reply). Mixing
 *      input validation into that same function blurs responsibilities and
 *      makes the code harder to follow.
 *
 *   2. TESTABILITY — Middleware functions have a minimal, well-defined
 *      signature: (req, res, next). They can be exercised in isolation with
 *      a mock req/res/next without spinning up a full Express app or touching
 *      the database, history store, or OpenAI service. This makes unit tests
 *      fast, focused, and deterministic.
 *
 *   3. REUSABILITY — If a second route ever needs the same validation (e.g.,
 *      a future PATCH /api/chat/:id that still requires a valid session ID),
 *      the middleware can be composed in without duplicating logic.
 *
 * ARCHITECTURE PLACEMENT
 * ----------------------
 * This file sits between the Express router and the route handler in the
 * request pipeline:
 *
 *   src/app.ts
 *     → src/routes/chat.ts
 *         → validateSessionId  (this file)
 *         → validateMessage    (this file)
 *         → chatHandler        (src/routes/chat.ts)
 *
 * REQUEST FLOW
 * ------------
 * POST /api/chat
 *   1. validateSessionId — reads X-Session-ID header, checks UUID v4 format
 *      ├── invalid → 400 { error: "X-Session-ID header is required and must be a valid UUID v4" }
 *      └── valid   → next()
 *   2. validateMessage — reads req.body.message, checks non-empty string
 *      ├── invalid → 400 { error: "message is required and must be a non-empty string" }
 *      └── valid   → next()
 *   3. chatHandler — runs business logic
 */

import { Request, Response, NextFunction } from 'express';
import { ErrorResponse } from '../types';

// ---------------------------------------------------------------------------
// UUID v4 Regex
// ---------------------------------------------------------------------------

/**
 * Regular expression that matches a canonically-formatted UUID version 4.
 *
 * UUID v4 format:  xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 *
 * Breakdown of each segment:
 *
 *   ^                   — start of string (no leading characters allowed)
 *   [0-9a-f]{8}         — 8 hex digits  (time_low field, random in v4)
 *   -                   — literal hyphen separator
 *   [0-9a-f]{4}         — 4 hex digits  (time_mid field, random in v4)
 *   -                   — literal hyphen separator
 *   4[0-9a-f]{3}        — '4' followed by 3 hex digits: the version nibble
 *                          is hardcoded to '4', identifying this as UUID v4
 *   -                   — literal hyphen separator
 *   [89ab][0-9a-f]{3}   — variant nibble must be 8, 9, a, or b (RFC 4122
 *                          variant), followed by 3 hex digits
 *   -                   — literal hyphen separator
 *   [0-9a-f]{12}        — 12 hex digits (node field, random in v4)
 *   $                   — end of string (no trailing characters allowed)
 *
 * The /i flag makes the match case-insensitive so both uppercase (A-F) and
 * lowercase (a-f) hex digits are accepted — crypto.randomUUID() produces
 * lowercase, but some clients may send uppercase.
 *
 * Common mistake: omitting the ^ and $ anchors. Without them the regex
 * matches UUID-like substrings embedded in larger strings, allowing inputs
 * like "not-a-uuid-00000000-0000-4000-8000-000000000000-trailing" to pass.
 */
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// validateMessage
// ---------------------------------------------------------------------------

/**
 * Express middleware that validates the `message` field in the JSON request body.
 *
 * WHAT IT DOES
 * Reads `req.body.message` and verifies that it is a string with at least one
 * non-whitespace character. If the check fails the middleware short-circuits
 * the pipeline by responding with HTTP 400 and an ErrorResponse JSON body. If
 * the check passes it hands control to the next middleware or route handler by
 * calling `next()`.
 *
 * WHY IT IS IMPLEMENTED THIS WAY
 * `typeof value === 'string'` is used rather than a truthiness check because
 * a truthiness check would also reject the number 0 or boolean false (not
 * relevant here, but the explicit type guard makes the intent unambiguous).
 * `.trim().length > 0` rejects whitespace-only strings ("   ") which would
 * otherwise pass a simple length check — sending a blank message to OpenAI
 * wastes an API call and produces a confusing empty bubble in the UI.
 *
 * COMMON MISTAKE TO AVOID
 * Do not check `req.body.message` before `express.json()` has run. If the
 * JSON body-parser middleware is not mounted in `app.ts` before this route,
 * `req.body` will be `undefined` and every request will receive a 400 error
 * regardless of what the client sends. Ensure `app.use(express.json())` is
 * registered first.
 *
 * @param req  - Express Request object; expects `req.body.message` to be set
 *               by the JSON body-parser middleware.
 * @param res  - Express Response object used to send the 400 error if invalid.
 * @param next - Express NextFunction called when validation passes.
 */
export function validateMessage(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const message: unknown = req.body?.message;

  // Reject if message is absent, not a string, or contains only whitespace.
  // Using `typeof` guards against non-string values (numbers, objects, arrays)
  // that would pass a loose truthiness check.
  if (typeof message !== 'string' || message.trim().length === 0) {
    const body: ErrorResponse = {
      error: 'message is required and must be a non-empty string',
    };
    res.status(400).json(body);
    return;
  }

  // Validation passed — pass control to the next middleware or route handler.
  next();
}

// ---------------------------------------------------------------------------
// validateSessionId
// ---------------------------------------------------------------------------

/**
 * Express middleware that validates the `X-Session-ID` request header.
 *
 * WHAT IT DOES
 * Reads `req.headers['x-session-id']` and verifies that it is present and
 * matches the UUID v4 format defined by UUID_V4_REGEX above. Express
 * lower-cases all header names, so `'x-session-id'` is the correct key
 * regardless of how the client capitalises the header. If the check fails the
 * middleware responds with HTTP 400 and an ErrorResponse JSON body. If the
 * check passes it calls `next()`.
 *
 * WHY IT IS IMPLEMENTED THIS WAY
 * The header value is typed as `string | string[] | undefined` by Express
 * because the HTTP spec allows duplicate headers which Express may parse as
 * an array. Using `typeof value === 'string'` (not `Array.isArray`) ensures
 * we only accept a single, unambiguous session identifier. Accepting an array
 * would require an arbitrary tie-breaking rule and is not part of the API
 * contract.
 *
 * The UUID v4 regex is applied as a strict gate: only well-formed identifiers
 * generated by `crypto.randomUUID()` (or equivalent) will pass. This prevents
 * injection of arbitrary strings as session keys into the history store Map.
 *
 * COMMON MISTAKE TO AVOID
 * Do not use `req.get('X-Session-ID')` as a shortcut without understanding
 * that it performs a case-insensitive header lookup and returns `undefined`
 * (not an empty string) when the header is absent. Both approaches work, but
 * the direct `req.headers['x-session-id']` access is more explicit about the
 * lower-cased key that Express stores internally.
 *
 * @param req  - Express Request object; reads `req.headers['x-session-id']`.
 * @param res  - Express Response object used to send the 400 error if invalid.
 * @param next - Express NextFunction called when validation passes.
 */
export function validateSessionId(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const sessionId: string | string[] | undefined =
    req.headers['x-session-id'];

  // Reject if the header is absent, is an array (duplicate header), or does
  // not match the UUID v4 format. The typeof guard also handles the undefined
  // case in one check.
  if (typeof sessionId !== 'string' || !UUID_V4_REGEX.test(sessionId)) {
    const body: ErrorResponse = {
      error: 'X-Session-ID header is required and must be a valid UUID v4',
    };
    res.status(400).json(body);
    return;
  }

  // Validation passed — pass control to the next middleware or route handler.
  next();
}
