import express, { type Express } from "express";
import path from "node:path";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { auditIpMiddleware } from "./middlewares/audit-middleware";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler";
import { config } from "./lib/config";

const app: Express = express();

// Trust proxy headers (required for correct IP extraction behind load balancer)
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          // Signed document links carry their token in the path — keep it out of the logs.
          url: req.url?.split("?")[0]?.replace(/^\/api\/doctor\/files\/[^/]+/, "/api/doctor/files/[redacted]"),
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({
  origin: config.CORS_ORIGINS === "*" ? "*" : config.CORS_ORIGINS.split(","),
  credentials: true,
}));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Attach IP extractor for audit logging
app.use(auditIpMiddleware);

app.use("/api", router);

// In the production container, serve the built patient/staff portal from the
// same origin as the API so browser requests can use relative /api URLs.
const portalDistDir = process.env.PORTAL_DIST_DIR || path.resolve(process.cwd(), "public");
app.use(express.static(portalDistDir, { index: false }));
app.get("/{*path}", (req, res, next) => {
  if (req.path === "/api" || req.path.startsWith("/api/")) {
    next();
    return;
  }
  res.sendFile(path.join(portalDistDir, "index.html"), (err) => {
    if (err) next(err);
  });
});

// 404 and global error handler — must be last
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
