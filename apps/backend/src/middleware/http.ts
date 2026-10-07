import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError, type ZodTypeAny } from "zod";
import type { Role } from "@breastcare/shared";
import { getStore } from "../db";
import { forbidden, unauthorized } from "../lib/errors";
import { logger, redact } from "../lib/logger";
import { verifyToken } from "../services/core.service";
import { ApiError } from "../lib/errors";

export interface Actor {
  id: string;
  role: Role;
  patientId: string | null;
  doctorId: string | null;
  email: string;
  displayName: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: Actor;
    }
  }
}

/** Verifies the bearer token and attaches the caller identity. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw unauthorized();

    const payload = verifyToken(token);
    const user = await getStore().users.get(payload.sub);
    if (!user) throw unauthorized("Account no longer exists");

    req.actor = {
      id: user.id,
      role: user.role,
      patientId: payload.patientId,
      doctorId: payload.doctorId,
      email: user.email,
      displayName: user.displayName,
    };
    next();
  } catch (error) {
    next(error);
  }
};

/** Restricts a route to the given roles. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.actor) return next(unauthorized());
    if (!roles.includes(req.actor.role)) {
      return next(forbidden(`This endpoint requires one of: ${roles.join(", ")}`));
    }
    next();
  };
}

/** Validates and replaces `req.body` with the parsed, defaulted value. */
export function validateBody(schema: ZodTypeAny): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) return next(result.error);
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodTypeAny): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(result.error);
    (req as Request & { validatedQuery: unknown }).validatedQuery = result.data;
    next();
  };
}

/** Wraps an async handler so rejections reach the error handler. */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

export function auditContext(req: Request) {
  return {
    actorId: req.actor?.id ?? "anonymous",
    actorRole: req.actor?.role ?? ("system" as const),
    ipAddress: req.ip ?? null,
  };
}

type ZodIssueLike = { path: (string | number)[]; message: string };

/**
 * Zod publishes both CJS and ESM builds, so an error raised inside another workspace
 * package is not necessarily `instanceof` the `ZodError` imported here. Match on shape
 * as well, otherwise every validation failure would surface as a 500.
 */
function zodIssues(error: unknown): ZodIssueLike[] | null {
  if (error instanceof ZodError) return error.issues;
  const candidate = error as { name?: unknown; issues?: unknown } | null | undefined;
  if (candidate && typeof candidate === "object" && candidate.name === "ZodError" && Array.isArray(candidate.issues)) {
    return candidate.issues as ZodIssueLike[];
  }
  return null;
}

/** Central error handler — one predictable response shape for every failure. */
export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  const issues = zodIssues(error);
  if (issues) {
    res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      },
    });
    return;
  }

  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details ?? null },
    });
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  logger.error("Unhandled error", { message, path: req.path, body: redact(req.body) as Record<string, unknown> });
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong. The team has been notified.", details: null },
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}`, details: null } });
}
