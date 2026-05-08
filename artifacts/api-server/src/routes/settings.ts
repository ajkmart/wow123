import { Router, type IRouter } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { userSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { customerAuth } from "../middleware/security.js";
import { getPlatformDefaultLanguage } from "../lib/getUserLanguage.js";
import { sendSuccess, sendValidationError } from "../lib/response.js";

const router: IRouter = Router();

router.use(customerAuth);

const DEFAULT_SETTINGS_BASE = {
  notifOrders: true,
  notifWallet: true,
  notifDeals: true,
  notifRides: true,
  locationSharing: true,
  biometric: false,
  twoFactor: false,
  darkMode: false,
};

const settingsUpdateSchema = z.object({
  notifOrders:    z.boolean().optional(),
  notifWallet:    z.boolean().optional(),
  notifDeals:     z.boolean().optional(),
  notifRides:     z.boolean().optional(),
  locationSharing: z.boolean().optional(),
  biometric:      z.boolean().optional(),
  twoFactor:      z.boolean().optional(),
  darkMode:       z.boolean().optional(),
  language: z.enum(["en", "ur", "roman", "en_roman", "en_ur"]).optional(),
}).strip();

router.get("/", async (req, res) => {
  const userId = req.customerId!;
  const platformLang = await getPlatformDefaultLanguage();

  /* Upsert: create the row if it doesn't exist yet, touching nothing if it does.
     Safe under concurrent GETs — onConflictDoNothing prevents PK collision. */
  await db.insert(userSettingsTable)
    .values({ id: generateId(), userId, ...DEFAULT_SETTINGS_BASE, language: platformLang })
    .onConflictDoNothing();

  const [settings] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.userId, userId)).limit(1);
  sendSuccess(res, { ...settings!, updatedAt: settings!.updatedAt.toISOString() });
});

router.put("/", async (req, res) => {
  const userId = req.customerId!;

  const parsed = settingsUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const msg = parsed.error.errors.map(e => e.message).join("; ");
    sendValidationError(res, msg);
    return;
  }

  const updates = parsed.data;
  const platformLang = await getPlatformDefaultLanguage();

  /* Single upsert: creates the row with defaults if absent, or updates only
     the validated changed fields if the row exists. Race-safe — no PK collision. */
  await db.insert(userSettingsTable)
    .values({
      id: generateId(),
      userId,
      ...DEFAULT_SETTINGS_BASE,
      language: platformLang,
      ...updates,
    })
    .onConflictDoUpdate({
      target: userSettingsTable.userId,
      set: { ...updates, updatedAt: new Date() },
    });

  const [settings] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.userId, userId)).limit(1);
  sendSuccess(res, { ...settings!, updatedAt: settings!.updatedAt.toISOString() });
});

export default router;
