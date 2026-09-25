/**
 * server/src/index.ts
 *
 * PURPOSE — BOOTSTRAP SEQUENCE (entry point)
 * ------------------------------------------
 * This is the application entry point. It runs through the following sequence
 * in order before the server accepts any connections:
 *
 *   1. Load .env into process.env (dotenv — must happen first, see below)
 *   2. Validate required environment variables (OPENAI_API_KEY)
 *   3. Read optional environment variables (PORT)
 *   4. Construct the Express application (createApp)
 *   5. Bind the network listener (app.listen)
 *
 * WHY ENV VALIDATION LIVES HERE AND NOT IN app.ts
 * ------------------------------------------------
 * app.ts is imported by test suites to create isolated Express instances for
 * supertest. If app.ts called process.exit() when OPENAI_API_KEY was absent,
 * every test run in a CI environment without a real key would terminate the
 * process immediately — tests would never execute.
 *
 * By keeping the exit-or-die guard here in index.ts (which is never imported
 * by tests), the validation only runs when the real server starts. app.ts stays
 * a pure, side-effect-free factory that test suites can safely import.
 *
 * Satisfies: Requirements 2.1, 2.2, 2.4, 1.6
 */

// Must be the very first import so that environment variables are populated
// before any other module reads them. In particular, services/openai.ts
// instantiates the OpenAI client at module-load time and reads OPENAI_API_KEY
// during that instantiation. If dotenv ran after that import, the client would
// be constructed with an undefined key even when a valid .env file is present.
import 'dotenv/config';

import { createApp } from './app';

// ─── ENVIRONMENT VALIDATION ───────────────────────────────────────────────────

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('FATAL: OPENAI_API_KEY is not set. Add it to server/.env');

  // Exit code convention:
  //   0  = success (normal termination)
  //   1  = general error (non-zero codes signal failure to the OS and to any
  //        process manager wrapping this process)
  //
  // Process managers such as pm2, Docker's restart policies, and Kubernetes
  // liveness probes inspect the exit code to decide whether to restart the
  // process. A non-zero exit on startup signals a configuration error. In
  // practice most managers will retry anyway, which is why the descriptive
  // error message above is more actionable than the code itself — it tells the
  // operator exactly what is missing and where to fix it.
  process.exit(1); // eslint-disable-line no-process-exit
}

// ─── CONFIGURATION ────────────────────────────────────────────────────────────

// Default of '3001' must match the Vite dev server proxy target configured in
// client/vite.config.ts (`target: 'http://localhost:3001'`). If these two values
// drift out of sync, every API request from the client will receive a "connection
// refused" error because the Vite proxy will forward to the wrong port.
const PORT = process.env.PORT ?? '3001';

// ─── APPLICATION BOOTSTRAP ────────────────────────────────────────────────────

const app = createApp();

// app.listen expects a numeric port. process.env values are always strings, so
// Number() converts '3001' → 3001. Passing the string directly would cause
// Node to coerce it internally, but being explicit avoids subtle bugs if PORT
// is ever set to a value that doesn't coerce cleanly (e.g., '3001abc').
app.listen(Number(PORT), () => {
  // This callback fires once the TCP socket is bound and the server is ready
  // to accept incoming connections. Logging here (rather than before listen())
  // guarantees the message only appears when the server is truly up — not
  // speculatively before the bind succeeds.
  console.log(`Server listening on http://localhost:${PORT}`);
});
