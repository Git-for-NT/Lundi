/**
 * server/src/routes/health.ts
 *
 * PURPOSE — LIVENESS CHECK ENDPOINT
 * -----------------------------------
 * This file implements a health check endpoint: a lightweight route whose only
 * job is to confirm that the server process is alive and able to handle HTTP
 * requests. It contains no business logic and no side effects.
 *
 * WHO POLLS THIS ENDPOINT?
 * ------------------------
 * - Load balancers (e.g., AWS ALB, nginx upstream health checks): they poll
 *   /health periodically and stop routing traffic to an instance if it returns
 *   a non-2xx status or stops responding entirely.
 * - Container orchestrators (e.g., Kubernetes liveness probes): Kubernetes
 *   restarts a pod automatically if its liveness probe fails, preventing
 *   silent stuck processes from serving traffic indefinitely.
 * - Monitoring/alerting tools (e.g., UptimeRobot, Datadog Synthetics): they
 *   alert on-call engineers the moment the service goes down.
 *
 * HOW IT FITS INTO THIS APP
 * -------------------------
 * The router exported here is mounted in src/app.ts at the root path:
 *
 *   app.use(healthRouter);   // mounts GET /health at the application root
 *
 * Unlike the chat routes (mounted under /api), the health endpoint lives at
 * the root level so that load balancers can reach it without any path prefix.
 * It requires no authentication — if the process can respond at all, it should
 * return 200. Adding auth here would defeat the purpose: a misconfigured auth
 * layer would cause every liveness check to fail and trigger unnecessary
 * restarts or traffic removal.
 *
 * Satisfies: Requirement 3.9
 */

import { Router, Request, Response } from 'express';

const router = Router();

// No middleware on this router — intentional.
// Session validation and body parsing are only meaningful for routes that
// carry user data. A liveness check carries no payload and identifies no
// user, so applying validateSessionId or express.json() here would add
// overhead with zero benefit and could cause false failures if the middleware
// itself had a bug.

/**
 * GET /health
 *
 * Returns a simple JSON body confirming the process is alive.
 *
 * WHY { status: 'ok' }?
 * ----------------------
 * The shape { status: 'ok' } is a widely adopted convention — simple enough
 * that any monitoring tool can parse it without configuration, and explicit
 * enough that a human reading the response body immediately understands it.
 *
 * Common mistake: returning HTTP 200 with an empty body. An empty 200 is
 * technically valid, but many load balancers and monitoring tools check the
 * response body in addition to the status code. A JSON body makes the intent
 * unambiguous and gives future engineers a place to add richer fields (e.g.,
 * { status: 'ok', uptime: process.uptime(), version: '1.0.0' }) without
 * changing the endpoint contract.
 *
 * This handler is synchronous — there is nothing to await. If this handler
 * ever fails to respond, it indicates a fundamental problem with the Express
 * event loop itself, which is exactly the kind of condition a liveness probe
 * is designed to detect.
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

export default router;
