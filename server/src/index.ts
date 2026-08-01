import { createApp } from "./app.js";
import { config } from "./config/index.js";
import { logger } from "./shared/logger.js";
import { closePool } from "./db/pool.js";
import { initModerationProviders } from "./modules/moderation/providers/index.js";

/** Server entrypoint. The background worker runs as a separate process (worker/index.ts). */

// RES-2: bind the moderation providers BEFORE the port opens. A provider name that does
// not resolve is a configuration error, and a configuration error must stop the boot —
// not wait to surface on the first student's post.
initModerationProviders();

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, "murmur api listening");
});

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
