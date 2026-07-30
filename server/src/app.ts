import express, { type NextFunction, type Request, type Response } from "express";
import { pinoHttp } from "pino-http";
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
