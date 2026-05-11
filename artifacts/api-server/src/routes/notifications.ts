import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { generateId } from "../lib/id.js";
import { sendSuccess, sendCreated, sendNotFound, sendForbidden } from "../lib/response.js";
import { validateBody } from "../middleware/validate.js";
import { customerAuth } from "../middleware/security.js";
import { adminAuth } from "./admin.js";
import { t } from "@workspace/i18n";
import { getUserLanguage } from "../lib/getUserLanguage.js";

const router: IRouter = Router();

router.get("/", customerAuth, async (req, res) => {
  try {
    const userId = req.customerId!;

    let notifs = await db.select().from(notificationsTable)
      .where(eq(notificationsTable.userId, userId))
      .orderBy(notificationsTable.createdAt);

    if (notifs.length === 0) {
      const userLang = await getUserLanguage(userId);
      const seeds = [
        { id: generateId(), userId, title: t("notifWelcomeTitle", userLang), body: t("notifWelcomeBody", userLang), type: "system", icon: "star-outline", isRead: false },
        { id: generateId(), userId, title: t("notifWalletReadyTitle", userLang), body: t("notifWalletReadyBody", userLang), type: "wallet", icon: "wallet-outline", isRead: false },
        { id: generateId(), userId, title: t("notifRideServiceTitle", userLang), body: t("notifRideServiceBody", userLang), type: "ride", icon: "car-outline", isRead: true },
      ];
      await db.insert(notificationsTable).values(seeds);
      notifs = await db.select().from(notificationsTable)
        .where(eq(notificationsTable.userId, userId))
        .orderBy(notificationsTable.createdAt);
    }

    const unreadCount = notifs.filter(n => !n.isRead).length;
    sendSuccess(res, {
      notifications: notifs.reverse().map(n => ({ ...n, createdAt: n.createdAt.toISOString() })),
      unreadCount,
    });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

const createNotifSchema = z.object({
  userId: z.string().min(1, "userId is required"),
  title: z.string().min(1, "title is required"),
  body: z.string().min(1, "body is required"),
  type: z.string().optional(),
  icon: z.string().optional(),
  link: z.string().nullable().optional(),
});

router.post("/", adminAuth, validateBody(createNotifSchema), async (req, res) => {
  try {
    const { userId, title, body, type, icon, link } = req.body;
    const id = generateId();
    await db.insert(notificationsTable).values({ id, userId, title, body, type: type || "system", icon: icon || "notifications-outline", link: link || null, isRead: false });
    sendCreated(res, { id });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/read-all", customerAuth, async (req, res) => {
  try {
    const userId = req.customerId!;
    await db.update(notificationsTable).set({ isRead: true }).where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false)));
    sendSuccess(res, null);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/:id/read", customerAuth, async (req, res) => {
  try {
    const userId = req.customerId!;
    const [notif] = await db.select().from(notificationsTable).where(eq(notificationsTable.id, String(req.params["id"]))).limit(1);
    if (!notif) { sendNotFound(res, "Not found", "نوٹیفکیشن نہیں ملی۔"); return; }
    if (notif.userId !== userId) { sendForbidden(res, "Access denied", "رسائی سے انکار۔"); return; }
    await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.id, String(req.params["id"])));
    sendSuccess(res, null);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:id", customerAuth, async (req, res) => {
  try {
    const userId = req.customerId!;
    const [notif] = await db.select().from(notificationsTable).where(eq(notificationsTable.id, String(req.params["id"]))).limit(1);
    if (!notif) { sendNotFound(res, "Not found", "نوٹیفکیشن نہیں ملی۔"); return; }
    if (notif.userId !== userId) { sendForbidden(res, "Access denied", "رسائی سے انکار۔"); return; }
    await db.delete(notificationsTable).where(eq(notificationsTable.id, String(req.params["id"])));
    sendSuccess(res, null);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
