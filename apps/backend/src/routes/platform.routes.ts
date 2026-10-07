import { Router } from "express";
import { assistantQuestionSchema, DEMO_DATA_BANNER, MEDICAL_DISCLAIMER, RED_FLAG_CONTENT } from "@breastcare/shared";
import { getStore } from "../db";
import { env } from "../config/env";
import { asyncHandler, auditContext, authenticate, requireRole, validateBody } from "../middleware/http";
import { audit } from "../services/core.service";
import {
  askAssistant,
  blockchainOverview,
  getArticle,
  knowledgeCategories,
  listArticles,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  platformAnalytics,
  redFlags,
} from "../services/platform.service";
import { auditEntryCount } from "../blockchain/service";

export const platformRouter = Router();

/* ---------------- notifications ---------------- */

platformRouter.get(
  "/notifications",
  authenticate,
  asyncHandler(async (req, res) => {
    const store = getStore();
    const notifications = await listNotifications(store, req.actor!.id);
    res.json({ notifications, unread: notifications.filter((notification) => !notification.readAt).length });
  }),
);

platformRouter.post(
  "/notifications/:id/read",
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(await markNotificationRead(getStore(), req.actor!.id, req.params.id!));
  }),
);

platformRouter.post(
  "/notifications/read-all",
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(await markAllNotificationsRead(getStore(), req.actor!.id));
  }),
);

/* ---------------- analytics ---------------- */

platformRouter.get(
  "/analytics",
  authenticate,
  requireRole("doctor", "admin"),
  asyncHandler(async (_req, res) => {
    // Aggregates only — no patient identifiers are included.
    res.json(await platformAnalytics(getStore()));
  }),
);

/* ---------------- blockchain ---------------- */

platformRouter.get(
  "/blockchain",
  authenticate,
  asyncHandler(async (req, res) => {
    const store = getStore();
    const actor = req.actor!;
    const patientId = actor.role === "patient" ? actor.patientId : (req.query.patientId as string | undefined) ?? null;
    res.json(await blockchainOverview(store, patientId ?? null, auditContext(req)));
  }),
);

platformRouter.get(
  "/blockchain/health",
  asyncHandler(async (_req, res) => {
    const { chainStatus } = await import("../blockchain/client");
    const status = await chainStatus();
    res.json({ ...status, auditEntries: status.reachable ? await auditEntryCount() : null });
  }),
);

/* ---------------- knowledge centre ---------------- */

platformRouter.get("/knowledge/categories", (_req, res) => {
  res.json({ categories: knowledgeCategories() });
});

platformRouter.get("/knowledge/articles", (req, res) => {
  const category = req.query.category as string | undefined;
  res.json({ articles: listArticles(category).map(({ slug, category, title, summary, readingTimeMinutes, updatedAt }) => ({ slug, category, title, summary, readingTimeMinutes, updatedAt })) });
});

platformRouter.get("/knowledge/articles/:slug", (req, res) => {
  // Every article is served with the platform disclaimer: nothing here is diagnostic advice.
  res.json({ article: getArticle(req.params.slug!), disclaimer: MEDICAL_DISCLAIMER });
});

platformRouter.get("/red-flags", (_req, res) => {
  res.json({ ...RED_FLAG_CONTENT, disclaimer: MEDICAL_DISCLAIMER });
});

/* ---------------- AI assistant ---------------- */

platformRouter.post(
  "/assistant",
  authenticate,
  validateBody(assistantQuestionSchema),
  asyncHandler(async (req, res) => {
    const store = getStore();
    const body = req.body as { question: string; context: string };
    const answer = askAssistant(body.question, body.context);
    await audit(store, auditContext(req), "ASSISTANT_QUESTION", {
      resource: "assistant",
      dataHash: null, // the question text is never written to the audit trail
    });
    res.json(answer);
  }),
);

/* ---------------- admin ---------------- */

export const adminRouter = Router();
adminRouter.use(authenticate, requireRole("admin"));

adminRouter.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    const store = getStore();
    const [users, patients, doctors, appointments, reports, consents, auditLogs, blockchainRecords] = await Promise.all([
      store.users.list(),
      store.patients.list(),
      store.doctors.list(),
      store.appointments.list(),
      store.reports.list(),
      store.consents.list(),
      store.auditLogs.list({ orderBy: "createdAt", order: "desc", limit: 200 }),
      store.blockchainRecords.list({ orderBy: "createdAt", order: "desc", limit: 100 }),
    ]);

    res.json({
      counts: {
        users: users.length,
        patients: patients.length,
        doctors: doctors.length,
        appointments: appointments.length,
        reports: reports.length,
        consents: consents.length,
        activeConsents: consents.filter((consent) => consent.status === "active" && !consent.revokedAt).length,
        auditEntries: auditLogs.length,
        blockchainRecords: blockchainRecords.length,
        anchoredRecords: blockchainRecords.filter((record) => record.transactionHash).length,
      },
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
        status: user.status,
        walletLinked: Boolean(user.walletAddress),
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      })),
      doctors: doctors.map((doctor) => ({ id: doctor.id, displayName: doctor.displayName, specialty: doctor.specialty, institution: doctor.institution })),
      recentAudit: auditLogs.slice(0, 50),
      recentBlockchain: blockchainRecords.slice(0, 25),
      analytics: await platformAnalytics(store),
      riskModels: (await import("../services/clinical.service")).availableRiskModels(),
      demoMode: env.DATABASE_DRIVER === "memory",
      demoBanner: DEMO_DATA_BANNER,
      privacyNote:
        "Administrators do not have implicit access to clinical records. Opening a patient's record requires an explicit consent grant scoped to admin review, exactly as for a clinician.",
    });
  }),
);

adminRouter.get(
  "/audit-logs",
  asyncHandler(async (req, res) => {
    const store = getStore();
    const limit = Math.min(Number(req.query.limit ?? 200), 1000);
    const offset = Number(req.query.offset ?? 0);
    const entries = await store.auditLogs.list({ orderBy: "createdAt", order: "desc", limit, offset });
    res.json({ entries, total: await store.auditLogs.count() });
  }),
);

adminRouter.patch(
  "/users/:id/status",
  asyncHandler(async (req, res) => {
    const store = getStore();
    const { status } = req.body as { status?: "active" | "suspended" };
    if (status !== "active" && status !== "suspended") {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "status must be active or suspended" } });
      return;
    }
    const user = await store.users.update(req.params.id!, { status });
    await audit(store, auditContext(req), "USER_STATUS_CHANGED", { resource: "user", resourceId: user.id });
    res.json({ id: user.id, status: user.status });
  }),
);

adminRouter.get(
  "/blockchain-records",
  asyncHandler(async (req, res) => {
    const store = getStore();
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    res.json({ records: await store.blockchainRecords.list({ orderBy: "createdAt", order: "desc", limit }) });
  }),
);
