import express, { type NextFunction, type Request, type Response } from "express";
import { pinoHttp } from "pino-http";
import { config } from "./config/index.js";
import { logger } from "./shared/logger.js";
import { AppError, sendError, errors } from "./shared/error-envelope.js";
import { identityRouter } from "./modules/identity/identity.routes.js";
import { analyticsRouter } from "./modules/analytics/analytics.routes.js";
import { sessionRouter } from "./modules/session/session.routes.js";
import { contentRouter } from "./modules/content/content.routes.js";
import { pool } from "./db/pool.js";

/**
 * Route registration + module wiring for the modular monolith (architecture §1).
 * As later milestones land, their routers register here (content, search, reputation,
 * grievance, sync, moderation) — one deployable service.
 */
export function createApp() {
  const app = express();

  // SEC-007 depends on this being right. The rate limiters bucket by `req.ip`, and behind
  // a load balancer with `trust proxy` unset every request reports the PROXY's address —
  // so all callers share one bucket and the limiter locks out the entire campus at once.
  // Left unset by default because trusting a forwarded header that no proxy actually
  // rewrites lets a caller spoof `X-Forwarded-For` and get a fresh bucket per request,
  // which is the opposite failure. Set TRUST_PROXY to match the real deployment.
  if (config.trustProxy) {
    const hops = Number(config.trustProxy);
    app.set("trust proxy", Number.isFinite(hops) ? hops : config.trustProxy);
  }

  app.use(express.json({ limit: "256kb" }));
  app.use(pinoHttp({ logger }));

  // Health endpoint (observability T71 precondition; T49 staging probe).
  app.get("/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "degraded", detail: "database unreachable" });
    }
  });

  // M1 modules.
  app.use(identityRouter); // A1, A2
  app.use(analyticsRouter); // A12

  // M2 — session mechanism behind the authenticated shell (T12, OQ-14).
  app.use(sessionRouter);
  // M2 — Q&A core behind the T14a moderation gateway (T15 A3, T16 A4, T17 A5-browse).
  app.use(contentRouter);

  // 404 fallback.
  app.use((_req, _res, next) => next(errors.notFound("Route not found")));

  // Central error handler → uniform error envelope (architecture §4).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      if (err.status >= 500) req.log.error({ err }, "request failed");
      sendError(res, err);
      return;
    }
    req.log.error({ err }, "unhandled error");
    sendError(res, errors.internal());
  });

  return app;
}
