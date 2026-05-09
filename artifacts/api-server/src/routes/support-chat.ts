import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { logger } from "../lib/logger.js";
import { z } from "zod";
import { generateId } from "../lib/id.js";
import { sendSuccess, sendCreated, sendError } from "../lib/response.js";
import { validateBody } from "../middleware/validate.js";
import { requireRole, getCachedSettings } from "../middleware/security.js";
import { getIO } from "../lib/socketio.js";
import { db } from "@workspace/db";
import { supportMessagesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

/* Admin toggle: feature_chat. When OFF, the customer support chat
   endpoints return 403 so a disabled admin switch is enforced
   server-side and not just hidden in the UI. */
async function requireChatEnabled(_req: Request, res: Response, next: NextFunction) {
  const s = await getCachedSettings();
  if ((s["feature_chat"] ?? "off") !== "on") {
    res.status(403).json({ error: "Customer support chat is currently disabled by the administrator." });
    return;
  }
  next();
}
router.use(requireChatEnabled);

const messageSchema = z.object({
  message: z.string().min(1).max(2000),
});

router.get("/messages", requireRole("customer"), async (req, res) => {
  const userId = req.customerId!;
  try {
    const msgs = await db
      .select()
      .from(supportMessagesTable)
      .where(eq(supportMessagesTable.userId, userId))
      .orderBy(supportMessagesTable.createdAt);
    return sendSuccess(res, {
      messages: msgs.map(m => ({
        id: m.id,
        userId: m.userId,
        message: m.message,
        isFromSupport: m.isFromSupport,
        createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
      })),
    });
  } catch {
    return sendSuccess(res, { messages: [] });
  }
});

router.post("/messages", requireRole("customer"), validateBody(messageSchema), async (req, res) => {
  const userId = req.customerId!;
  const { message } = req.body as z.infer<typeof messageSchema>;
  const io = getIO();

  try {
    const [msg] = await db.insert(supportMessagesTable).values({
      id: generateId(),
      userId,
      message,
      isFromSupport: false,
      createdAt: new Date(),
    }).returning();

    if (msg) {
      const msgPayload = {
        id: msg.id,
        userId: msg.userId,
        message: msg.message,
        isFromSupport: msg.isFromSupport,
        createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt,
      };
      io?.to(`user:${userId}`).emit("support_message", msgPayload);

      const autoReplyMsg = {
        id: generateId(),
        userId,
        message: "Thank you for contacting support! Our team will get back to you shortly. For urgent matters, please call our helpline.",
        isFromSupport: true,
        createdAt: new Date(Date.now() + 1000),
      };
      await db.insert(supportMessagesTable).values(autoReplyMsg);
      const autoPayload = {
        ...autoReplyMsg,
        createdAt: autoReplyMsg.createdAt.toISOString(),
      };

      setTimeout(() => {
        io?.to(`user:${userId}`).emit("support_message", autoPayload);
      }, 1500);

      return sendCreated(res, { message: msgPayload });
    }
  } catch (err) {
    logger.error("support-chat insert failed", err);
    return sendError(res, "Failed to save message", 500);
  }
});

export default router;
