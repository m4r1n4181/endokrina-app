import app from "./app";
import { logger } from "./lib/logger";
import { config } from "./lib/config";
import { ensureStorageBucket } from "./lib/s3-document-storage";
import { startMaintenanceJobs } from "./jobs/maintenance";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  try {
    await ensureStorageBucket();
  } catch (storageErr) {
    logger.error({ err: storageErr }, "Object storage is not ready");
    if (config.NODE_ENV === "production") process.exit(1);
  }

  startMaintenanceJobs();
  logger.info({ port }, "Server listening");
});
