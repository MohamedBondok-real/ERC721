import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { errorHandler, notFoundHandler } from "./middleware/http";
import { authRouter } from "./routes/auth.routes";
import { patientRouter } from "./routes/patient.routes";
import { careRouter } from "./routes/care.routes";
import { consentRouter, doctorRouter } from "./routes/consent.routes";
import { adminRouter, platformRouter } from "./routes/platform.routes";

export function createApp(): Express {
  const app = express();

  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: false, // the frontend sets its own CSP; this is a pure JSON API
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
      credentials: true,
    }),
  );

  // Authentication endpoints are rate limited to slow credential stuffing.
  app.use(
    "/api/auth",
    rateLimit({
      windowMs: 60_000,
      max: 60,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { code: "RATE_LIMITED", message: "Too many attempts. Please wait a minute." } },
    }),
  );
  app.use(
    "/api",
    rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false }),
  );

  // Request logging — identifiers and outcomes only, never clinical payloads.
  app.use((req, res, next) => {
    const started = Date.now();
    res.on("finish", () => {
      if (req.path === "/api/health") return;
      logger.info("request", { method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - started });
    });
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", time: new Date().toISOString(), database: env.DATABASE_DRIVER });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/patients", patientRouter);
  app.use("/api", careRouter); // /treatments /medications /appointments /availability
  app.use("/api/consent", consentRouter);
  app.use("/api/doctors", doctorRouter);
  app.use("/api", platformRouter); // /notifications /analytics /blockchain /knowledge /assistant
  app.use("/api/admin", adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
