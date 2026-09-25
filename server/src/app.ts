/**
 * server/src/app.ts
 *
 * PURPOSE
 * -------
 * This module constructs and configures the Express application: applying
 * middleware (CORS, JSON body parsing) and mounting the route handlers.
 * It exports a factory function rather than a singleton app instance.
 *
 * ARCHITECTURE PLACEMENT
 * ----------------------
 * This file sits between the entry point and the route layer:
 *
 *   src/index.ts          (loads .env, validates API key, calls createApp(), starts listener)
 *     → src/app.ts        ← this file
 *         → src/routes/chat.ts    (POST /api/chat)
 *         → src/routes/health.ts  (GET /health)
 *
 * WHY A FACTORY FUNCTION INSTEAD OF A SINGLETON?
 * -----------------------------------------------
 * Exporting a pre-constructed `app` singleton would make testing fragile:
 * every test file would import the same shared instance, meaning CORS config,
 * middleware state, and route registrations could bleed between test runs.
 *
 * The factory pattern (`createApp()`) means:
 *   - `src/index.ts` calls `createApp()` once to start the real server.
 *   - Each test file calls `createApp()` independently to get a fresh Express
 *     instance for `supertest`. There is no port binding and no shared state
 *     between test runs — each suite owns its own isolated app.
 *
 * This is the standard pattern recommended by the Express team for testable
 * applications and mirrors how frameworks like Fastify and Hapi work by default.
 *
 * Satisfies: Requirements 4.1, 4.2, 4.3
 */

import express, { Express } from 'express';
import cors from 'cors';
import chatRouter from './routes/chat';
import healthRouter from './routes/health';

/**
 * createApp
 *
 * Constructs a fully configured Express application without starting the
 * network listener. The caller (`src/index.ts`) is responsible for calling
 * `app.listen()`. Keeping construction and listening separate allows test
 * suites to create app instances that are never bound to a port.
 *
 * Common mistake: calling `app.listen()` inside this function. Doing so would
 * prevent tests from controlling the port (or avoiding port binding entirely
 * when using supertest's `request(app)` form, which opens an ephemeral port
 * automatically).
 */
export function createApp(): Express {
  const app = express();

  // ─── CORS ─────────────────────────────────────────────────────────────────
  // Must be applied before any route handler so that preflight (OPTIONS)
  // requests receive the correct headers and are not rejected by the browser
  // before they reach the route layer.
  app.use(
    cors({
      // The client runs on port 5173 in development — Vite's default port.
      // Without an explicit origin whitelist, the browser's same-origin policy
      // blocks every cross-origin request from port 5173 to port 3001.
      // Allowing '*' (all origins) would be simpler but is unsafe in a project
      // that transmits session-scoped data via custom headers.
      origin: 'http://localhost:5173',

      // Browsers send a CORS preflight (OPTIONS) request before any
      // cross-origin request that uses a non-simple header. The server must
      // explicitly whitelist every custom header the client sends; if a header
      // is absent from this list, the browser rejects the request before it
      // ever reaches the route handler — the server never even sees it.
      //
      //   Content-Type  — required for the JSON body parser to be triggered
      //                   (without it the browser treats the body as opaque and
      //                   the server receives no body at all).
      //   X-Session-ID  — the custom header the client uses to identify its
      //                   session; omitting it here would cause every chat
      //                   request to be blocked at the preflight stage.
      allowedHeaders: ['Content-Type', 'X-Session-ID'],

      // Restricts which HTTP methods are permitted cross-origin. Only the two
      // methods actually used by this application are listed:
      //   GET  — for the /health liveness check
      //   POST — for the /api/chat endpoint
      // Explicitly enumerating methods (rather than using the cors default of
      // allowing all methods) is a defence-in-depth measure: it closes off
      // methods like DELETE, PUT, and PATCH that no legitimate client of this
      // API should ever send cross-origin.
      methods: ['GET', 'POST'],
    }),
  );

  // ─── JSON BODY PARSER ─────────────────────────────────────────────────────
  // Parses incoming request bodies with a Content-Type of application/json
  // and populates `req.body` with the parsed object. Must be mounted BEFORE
  // the chat router; if it were mounted after, `req.body` would be `undefined`
  // when `validateMessage` runs inside the chat route handler, causing every
  // POST /api/chat request to be rejected with a spurious 400 error even when
  // the client sent a valid JSON body.
  app.use(express.json());

  // ─── ROUTE MOUNTING ───────────────────────────────────────────────────────
  // chatRouter is mounted under the /api prefix so that the chat endpoint is
  // reachable at POST /api/chat. The /api prefix groups all API routes under a
  // common namespace, making it straightforward to add future endpoints (e.g.,
  // GET /api/sessions) without path collisions with static file serving or the
  // health check.
  app.use('/api', chatRouter);

  // healthRouter is mounted at the root (no prefix) so that GET /health is
  // accessible without any path prefix. Load balancers and container
  // orchestrators (e.g., Kubernetes liveness probes) are typically configured
  // to poll /health directly — adding an /api prefix would require reconfiguring
  // every external health check consumer.
  app.use(healthRouter);

  return app;
}
