/**
 * vite.config.ts — Vite development server configuration
 *
 * This file configures two things:
 *   1. The dev server port (5173) so it is explicit and matches the CORS
 *      origin whitelist defined in server/src/app.ts.
 *   2. A request proxy that forwards all `/api` paths to the Express server.
 *
 * WHY THE PROXY?
 * The API module (src/api/chat.ts) calls `fetch('/api/chat')` using a
 * relative URL — there is no hardcoded `http://localhost:3001` anywhere in
 * the client source. The proxy is the only place that hostname appears,
 * making it trivial to change the backend address without touching
 * application code.
 *
 * PRODUCTION EQUIVALENCE
 * In a production deployment the same relative `/api` path continues to work
 * unchanged: a reverse proxy (nginx, Caddy, an AWS ALB, etc.) sits in front
 * of both the static asset bundle and the API server and routes `/api`
 * requests to the Express process. The client code never needs to know which
 * environment it is running in.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Vite's default port is 5173; kept explicit here so the value is obvious
    // and always matches the CORS `origin` whitelist in server/src/app.ts.
    port: 5173,
    proxy: {
      // All requests whose path starts with /api are forwarded to the Express
      // server. For example, the client's fetch('/api/chat') is transparently
      // rewritten to http://localhost:3001/api/chat before it leaves the
      // machine — the browser never makes a cross-origin request.
      '/api': {
        // Must match the PORT in server/.env (default 3001).
        target: 'http://localhost:3001',
        // Rewrites the Host header of the proxied request to match the target
        // (localhost:3001) instead of the originating dev server
        // (localhost:5173). Without this, some HTTP servers reject requests
        // whose Host header does not match their configured hostname.
        changeOrigin: true,
      },
    },
  },
});
