import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { webhookRegistrationsTable, webhookLogsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

const generateLogId = () => randomBytes(10).toString("hex");

const WEBHOOK_CONCURRENCY_LIMIT = 5;

async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<void> {
  const executing: Promise<void>[] = [];
  for (const task of tasks) {
    const p = task().then(
      () => { executing.splice(executing.indexOf(p), 1); },
      (err: Error) => {
        executing.splice(executing.indexOf(p), 1);
        logger.error({ err: err.message }, "[webhook-emitter] concurrency dispatch failed");
      },
    );
    executing.push(p);
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

export async function emitWebhookEvent(event: string, data: Record<string, unknown>) {
  try {
    const webhooks = await db.select().from(webhookRegistrationsTable)
      .where(eq(webhookRegistrationsTable.isActive, true));

    const matching = webhooks.filter(w => {
      const events = (w.events as string[]) || [];
      return events.includes(event);
    });

    if (matching.length === 0) return;

    const payload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    await runWithConcurrencyLimit(
      matching.map(webhook => () => dispatchWebhook(webhook, event, payload)),
      WEBHOOK_CONCURRENCY_LIMIT,
    );
  } catch (err: unknown) {
    logger.error({ err: (err as Error).message }, `[webhook-emitter] Error emitting event ${event}`);
  }
}

async function dispatchWebhook(
  webhook: { id: string; url: string; secret: string | null },
  event: string,
  payload: Record<string, unknown>,
) {
  const logId = generateLogId();
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": webhook.secret || "",
        "X-Webhook-Event": event,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const durationMs = Date.now() - startTime;
    const responseText = await response.text().catch(() => "");

    await db.insert(webhookLogsTable).values({
      id: logId,
      webhookId: webhook.id,
      event,
      url: webhook.url,
      status: response.status,
      requestBody: payload,
      responseBody: responseText.slice(0, 2000),
      success: response.ok,
      durationMs,
    });

    if (!response.ok) {
      logger.warn({ webhookId: webhook.id, url: webhook.url, status: response.status }, "[webhook-emitter] Dispatch returned non-2xx, scheduling retry");
      const retryTimeout = setTimeout(() => {
        retryWebhook(webhook, event, payload).catch((retryErr: Error) => {
          logger.error({ webhookId: webhook.id, url: webhook.url, err: retryErr.message }, "[webhook-emitter] Retry failed");
        });
      }, 5000);
      if (retryTimeout.unref) retryTimeout.unref();
    }
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const errMsg = (err as Error).message || "Unknown error";
    logger.error({ webhookId: webhook.id, url: webhook.url, err: errMsg }, "[webhook-emitter] Dispatch threw error");
    await db.insert(webhookLogsTable).values({
      id: logId,
      webhookId: webhook.id,
      event,
      url: webhook.url,
      status: 0,
      requestBody: payload,
      success: false,
      error: errMsg,
      durationMs,
    }).catch((dbErr: Error) => { logger.error({ err: dbErr.message }, "[webhook-emitter] Failed to write error log"); });

    const retryTimeout = setTimeout(() => {
      retryWebhook(webhook, event, payload).catch((retryErr: Error) => {
        logger.error({ webhookId: webhook.id, url: webhook.url, err: retryErr.message }, "[webhook-emitter] Retry failed");
      });
    }, 5000);
    if (retryTimeout.unref) retryTimeout.unref();
  }
}

async function retryWebhook(
  webhook: { id: string; url: string; secret: string | null },
  event: string,
  payload: Record<string, unknown>,
) {
  const logId = generateLogId();
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": webhook.secret || "",
        "X-Webhook-Event": event,
        "X-Webhook-Retry": "1",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const durationMs = Date.now() - startTime;
    const responseText = await response.text().catch(() => "");

    await db.insert(webhookLogsTable).values({
      id: logId,
      webhookId: webhook.id,
      event: `${event} (retry)`,
      url: webhook.url,
      status: response.status,
      requestBody: payload,
      responseBody: responseText.slice(0, 2000),
      success: response.ok,
      durationMs,
    }).catch((dbErr: Error) => { logger.error({ err: dbErr.message }, "[webhook-emitter] Failed to write retry log"); });

    if (!response.ok) {
      logger.warn({ webhookId: webhook.id, url: webhook.url, status: response.status }, "[webhook-emitter] Retry also returned non-2xx — giving up");
    }
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const errMsg = (err as Error).message || "Unknown error";
    logger.error({ webhookId: webhook.id, url: webhook.url, err: errMsg }, "[webhook-emitter] Retry threw error — giving up");
    await db.insert(webhookLogsTable).values({
      id: logId,
      webhookId: webhook.id,
      event: `${event} (retry)`,
      url: webhook.url,
      status: 0,
      requestBody: payload,
      success: false,
      error: errMsg,
      durationMs,
    }).catch((dbErr: Error) => { logger.error({ err: dbErr.message }, "[webhook-emitter] Failed to write retry error log"); });
  }
}
