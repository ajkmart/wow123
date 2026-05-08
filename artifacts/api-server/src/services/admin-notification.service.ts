/**
 * NotificationService - Admin Notifications Management
 * 
 * Centralized business logic for:
 * - SMS notifications (Twilio, MSG91)
 * - Email notifications
 * - Push notifications
 * - WhatsApp messages
 * - Notification history & tracking
 */

import { db } from "@workspace/db";
import {
  usersTable,
  notificationsTable,
} from "@workspace/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import { sendSms } from "./sms.js";
import { sendEmail } from "./email.js";
import { sendPushToUser } from "../lib/webpush.js";
import { sendWhatsappMessage } from "./whatsapp.js";

export interface SendSmsInput {
  userId: string;
  phoneNumber?: string;
  message: string;
  templateId?: string;
}

export interface SendEmailInput {
  userId: string;
  emailAddress?: string;
  subject: string;
  body: string;
  templateId?: string;
}

export interface SendPushInput {
  userId: string;
  title: string;
  body: string;
  icon?: string;
  type: string;
}

export interface SendWhatsappInput {
  userId: string;
  phoneNumber?: string;
  message: string;
  templateId?: string;
}

export interface BroadcastInput {
  channel: "sms" | "email" | "push" | "whatsapp";
  userFilter?: {
    roles?: string[];
    status?: string;
    service?: string;
  };
  message: string;
  title?: string; // for push
  subject?: string; // for email
}

export class NotificationService {
  /**
   * Send SMS to user
   */
  static async sendSms(input: SendSmsInput) {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, input.userId))
      .limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    const phoneNumber = input.phoneNumber || user.phone;
    if (!phoneNumber) {
      throw new Error("No phone number available for SMS");
    }

    try {
      const result = await sendSms({
        to: phoneNumber,
        message: input.message,
        templateId: input.templateId,
      });

      logger.info(
        { userId: input.userId, phone: phoneNumber },
        "[NotificationService] SMS sent"
      );

      return {
        success: true,
        messageId: result?.messageId || generateId(),
      };
    } catch (error) {
      logger.error(
        { userId: input.userId, error },
        "[NotificationService] SMS send failed"
      );
      throw new Error(`Failed to send SMS: ${error}`);
    }
  }

  /**
   * Send email to user
   */
  static async sendEmail(input: SendEmailInput) {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, input.userId))
      .limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    const emailAddress = input.emailAddress || user.email;
    if (!emailAddress) {
      throw new Error("No email address available");
    }

    try {
      const result = await sendEmail({
        to: emailAddress,
        subject: input.subject,
        html: input.body,
        templateId: input.templateId,
      });

      logger.info(
        { userId: input.userId, email: emailAddress },
        "[NotificationService] Email sent"
      );

      return {
        success: true,
        messageId: result?.messageId || generateId(),
      };
    } catch (error) {
      logger.error(
        { userId: input.userId, error },
        "[NotificationService] Email send failed"
      );
      throw new Error(`Failed to send email: ${error}`);
    }
  }

  /**
   * Send push notification to user
   */
  static async sendPush(input: SendPushInput) {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, input.userId))
      .limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    try {
      // Store notification in database
      const notificationId = generateId();
      await db.insert(notificationsTable).values({
        id: notificationId,
        userId: input.userId,
        title: input.title,
        body: input.body,
        type: input.type,
        icon: input.icon || null,
      });

      // Send push notification
      await sendPushToUser(input.userId, {
        title: input.title,
        body: input.body,
        tag: `${input.type}-${Date.now()}`,
      });

      logger.info(
        { userId: input.userId, type: input.type },
        "[NotificationService] Push notification sent"
      );

      return {
        success: true,
        notificationId,
      };
    } catch (error) {
      logger.error(
        { userId: input.userId, error },
        "[NotificationService] Push notification send failed"
      );
      throw new Error(`Failed to send push notification: ${error}`);
    }
  }

  /**
   * Send WhatsApp message
   */
  static async sendWhatsapp(input: SendWhatsappInput) {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, input.userId))
      .limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    const phoneNumber = input.phoneNumber || user.phone;
    if (!phoneNumber) {
      throw new Error("No phone number available for WhatsApp");
    }

    try {
      const result = await sendWhatsappMessage({
        to: phoneNumber,
        message: input.message,
        templateId: input.templateId,
      });

      logger.info(
        { userId: input.userId, phone: phoneNumber },
        "[NotificationService] WhatsApp message sent"
      );

      return {
        success: true,
        messageId: result?.messageId || generateId(),
      };
    } catch (error) {
      logger.error(
        { userId: input.userId, error },
        "[NotificationService] WhatsApp send failed"
      );
      throw new Error(`Failed to send WhatsApp message: ${error}`);
    }
  }

  /**
   * Get notification history for a user
   */
  static async getNotificationHistory(userId: string, limit: number = 100) {
    const notifications = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, userId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(Math.min(limit, 500));

    return notifications.map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
      readAt: n.isRead ? n.createdAt.toISOString() : null,
    }));
  }

  /**
   * Broadcast message to multiple users
   */
  static async broadcast(input: BroadcastInput) {
    try {
      // Get all users matching filter
      // Build a role condition using raw SQL LIKE so comma-separated role strings are handled
      let roleCondition: ReturnType<typeof sql> | undefined;
      if (input.userFilter?.roles && input.userFilter.roles.length > 0) {
        const roleConditions = input.userFilter.roles.map(
          (role) => sql`${usersTable.roles} LIKE ${"%" + role + "%"}`
        );
        roleCondition = roleConditions.length === 1
          ? roleConditions[0]!
          : sql`(${sql.join(roleConditions, sql` OR `)})`;
      }

      const users = await db
        .select()
        .from(usersTable)
        .where(roleCondition)
        .limit(10000);

      const results = {
        sent: 0,
        failed: 0,
        failedUserIds: [] as string[],
      };

      for (const user of users) {
        try {
          switch (input.channel) {
            case "sms":
              await this.sendSms({
                userId: user.id,
                message: input.message,
              });
              results.sent++;
              break;

            case "email":
              if (user.email) {
                await this.sendEmail({
                  userId: user.id,
                  subject: input.subject || "Notification",
                  body: input.message,
                });
                results.sent++;
              }
              break;

            case "push":
              await this.sendPush({
                userId: user.id,
                title: input.title || "Notification",
                body: input.message,
                type: "broadcast",
              });
              results.sent++;
              break;

            case "whatsapp":
              if (user.phone) {
                await this.sendWhatsapp({
                  userId: user.id,
                  message: input.message,
                });
                results.sent++;
              }
              break;
          }
        } catch (error) {
          results.failed++;
          results.failedUserIds.push(user.id);
          logger.warn(
            { userId: user.id, channel: input.channel, error },
            "[NotificationService] Broadcast message send failed for user"
          );
        }
      }

      logger.info(
        { channel: input.channel, sent: results.sent, failed: results.failed },
        "[NotificationService] Broadcast complete"
      );

      return results;
    } catch (error) {
      logger.error(
        { error },
        "[NotificationService] Broadcast failed"
      );
      throw new Error(`Broadcast failed: ${error}`);
    }
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(notificationId: string) {
    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(eq(notificationsTable.id, notificationId));

    return { success: true };
  }

  /**
   * Get unread notification count for user
   */
  static async getUnreadCount(userId: string) {
    const notifications = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, userId),
          eq(notificationsTable.isRead, false),
        )
      );

    return { unreadCount: notifications.length };
  }
}
