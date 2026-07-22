import { createApp } from "./app.js";
import { config } from "./config/index.js";
import { logger } from "./shared/logger.js";
import { closePool } from "./db/pool.js";

/** Server entrypoint. The background worker runs as a separate process (worker/index.ts). */
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
