import { Router } from "express";
import { db } from "@workspace/db";
import {
  conversationsTable,
  chatMessagesTable,
  usersTable,
  chatReportsTable,
} from "@workspace/db/schema";
import { eq, desc, and, sql, or, count } from "drizzle-orm";
import { generateId, addAuditEntry, getClientIp, type AdminRequest } from "../admin-shared.js";
import { sendSuccess, sendNotFound, sendValidationError } from "../../lib/response.js";

const router = Router();

router.get("/conversations", async (req, res) => {
  const limit = Math.min(Number(req.query["limit"]) || 100, 500);
  const offset = Number(req.query["offset"]) || 0;

  const typeFilter = (req.query["type"] as string) || "direct";
  const conversations = await db
    .select({
      id: conversationsTable.id,
      participant1Id: conversationsTable.participant1Id,
      participant2Id: conversationsTable.participant2Id,
      type: conversationsTable.type,
      status: conversationsTable.status,
      lastMessageAt: conversationsTable.lastMessageAt,
      createdAt: conversationsTable.createdAt,
    })
    .from(conversationsTable)
    .where(eq(conversationsTable.type, typeFilter))
    .orderBy(desc(conversationsTable.lastMessageAt))
    .limit(limit)
    .offset(offset);

  const userIds = new Set<string>();
  for (const c of conversations) {
    userIds.add(c.participant1Id);
    userIds.add(c.participant2Id);
  }

  const userMap: Record<string, { id: string; name: string | null; phone: string | null; ajkId: string | null; chatMuted: boolean }> = {};
  if (userIds.size > 0) {
    const users = await db
      .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone, ajkId: usersTable.ajkId, chatMuted: usersTable.chatMuted })
      .from(usersTable)
      .where(or(...Array.from(userIds).map(uid => eq(usersTable.id, uid))));
    for (const u of users) userMap[u.id] = u;
  }

  const msgCounts = await db
    .select({ conversationId: chatMessagesTable.conversationId, msgCount: count() })
    .from(chatMessagesTable)
    .groupBy(chatMessagesTable.conversationId);
  const msgCountMap: Record<string, number> = {};
  for (const mc of msgCounts) msgCountMap[mc.conversationId] = mc.msgCount;

  const enriched = conversations.map(c => ({
    ...c,
    participant1: userMap[c.participant1Id] || null,
    participant2: userMap[c.participant2Id] || null,
    messageCount: msgCountMap[c.id] || 0,
  }));

  sendSuccess(res, { conversations: enriched, total: enriched.length });
});

router.get("/conversations/:id/messages", async (req, res) => {
  const conversationId = req.params["id"]!;
  const limit = Math.min(Number(req.query["limit"]) || 100, 500);
  const offset = Number(req.query["offset"]) || 0;

  const messages = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.conversationId, conversationId))
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(limit)
    .offset(offset);

  const userIds = new Set<string>();
  for (const m of messages) userIds.add(m.senderId);

  const userMap: Record<string, { id: string; name: string | null; phone: string | null; ajkId: string | null }> = {};
  if (userIds.size > 0) {
    const users = await db
      .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone, ajkId: usersTable.ajkId })
      .from(usersTable)
      .where(or(...Array.from(userIds).map(uid => eq(usersTable.id, uid))));
    for (const u of users) userMap[u.id] = u;
  }

  const enriched = messages.map(m => ({
    ...m,
    sender: userMap[m.senderId] || null,
  }));

  sendSuccess(res, { messages: enriched.reverse() });
});

router.post("/users/:id/chat-mute", async (req, res) => {
  const userId = req.params["id"]!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { sendNotFound(res, "User not found"); return; }

  await db.update(usersTable).set({ chatMuted: true, updatedAt: new Date() }).where(eq(usersTable.id, userId));

  addAuditEntry({ action: "chat_mute_user", ip: getClientIp(req), adminId: (req as AdminRequest).adminId, details: `Muted chat for user ${userId} (${user.name || user.phone})`, result: "success" });
  sendSuccess(res, { success: true, message: `Chat muted for ${user.name || user.phone}` });
});

router.post("/users/:id/chat-unmute", async (req, res) => {
  const userId = req.params["id"]!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { sendNotFound(res, "User not found"); return; }

  await db.update(usersTable).set({ chatMuted: false, updatedAt: new Date() }).where(eq(usersTable.id, userId));

  addAuditEntry({ action: "chat_unmute_user", ip: getClientIp(req), adminId: (req as AdminRequest).adminId, details: `Unmuted chat for user ${userId} (${user.name || user.phone})`, result: "success" });
  sendSuccess(res, { success: true, message: `Chat unmuted for ${user.name || user.phone}` });
});

router.get("/reports", async (req, res) => {
  const statusFilter = req.query["status"] as string | undefined;
  const limit = Math.min(Number(req.query["limit"]) || 100, 500);

  const whereClause = statusFilter ? eq(chatReportsTable.status, statusFilter) : undefined;
  const reports = await db.select().from(chatReportsTable)
    .where(whereClause)
    .orderBy(desc(chatReportsTable.createdAt))
    .limit(limit);

  const userIds = new Set<string>();
  for (const r of reports) {
    userIds.add(r.reporterId);
    userIds.add(r.reportedUserId);
  }

  const userMap: Record<string, { id: string; name: string | null; phone: string | null }> = {};
  if (userIds.size > 0) {
    const users = await db
      .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
      .from(usersTable)
      .where(or(...Array.from(userIds).map(uid => eq(usersTable.id, uid))));
    for (const u of users) userMap[u.id] = u;
  }

  const enriched = reports.map(r => ({
    ...r,
    reporter: userMap[r.reporterId] || null,
    reportedUser: userMap[r.reportedUserId] || null,
  }));

  sendSuccess(res, { reports: enriched });
});

router.patch("/reports/:id/resolve", async (req, res) => {
  const reportId = req.params["id"]!;
  const [report] = await db.select().from(chatReportsTable).where(eq(chatReportsTable.id, reportId)).limit(1);
  if (!report) { sendNotFound(res, "Report not found"); return; }

  await db.update(chatReportsTable).set({
    status: "resolved",
    resolvedBy: (req as AdminRequest).adminId || "admin",
    resolvedAt: new Date(),
  }).where(eq(chatReportsTable.id, reportId));

  addAuditEntry({ action: "chat_report_resolve", ip: getClientIp(req), adminId: (req as AdminRequest).adminId, details: `Resolved chat report ${reportId}`, result: "success" });
  sendSuccess(res, { success: true });
});

export default router;
