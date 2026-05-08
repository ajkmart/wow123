import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { savedAddressesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { generateId } from "../lib/id.js";
import { sendSuccess, sendCreated, sendNotFound, sendForbidden, sendValidationError } from "../lib/response.js";
import { validateBody } from "../middleware/validate.js";
import { customerAuth } from "../middleware/security.js";

const router: IRouter = Router();

router.use(customerAuth);

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "").trim();

router.get("/", async (req, res) => {
  const userId = req.customerId!;
  const addresses = await db.select().from(savedAddressesTable)
    .where(eq(savedAddressesTable.userId, userId))
    .orderBy(savedAddressesTable.createdAt);
  sendSuccess(res, { addresses: addresses.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })) });
});

const createAddressSchema = z.object({
  label: z.string().min(1, "Label is required").max(100, "Label must be 100 characters or less").transform(stripHtml),
  address: z.string().min(1, "Address is required").max(500, "Address must be 500 characters or less").transform(stripHtml),
  city: z.string().max(100, "City must be 100 characters or less").optional().transform(v => (v ? stripHtml(v) : v)),
  icon: z.string().optional(),
  isDefault: z.boolean().optional(),
});

const updateAddressSchema = z.object({
  label: z.string().min(1).max(100).transform(stripHtml).optional(),
  address: z.string().min(1).max(500).transform(stripHtml).optional(),
  city: z.string().max(100).optional().transform(v => (v ? stripHtml(v) : v)),
  icon: z.string().optional(),
  isDefault: z.boolean().optional(),
});

router.post("/", validateBody(createAddressSchema), async (req, res) => {
  const userId = req.customerId!;
  const { label, address, city, icon, isDefault } = req.body;

  const existing = await db.select({ id: savedAddressesTable.id }).from(savedAddressesTable).where(eq(savedAddressesTable.userId, userId));
  if (existing.length >= 5) {
    sendValidationError(res, "Maximum 5 addresses allowed", "زیادہ سے زیادہ 5 پتے مجاز ہیں۔");
    return;
  }

  const id = generateId();

  await db.transaction(async (tx) => {
    if (isDefault) {
      await tx.update(savedAddressesTable).set({ isDefault: false }).where(eq(savedAddressesTable.userId, userId));
    }
    await tx.insert(savedAddressesTable).values({
      id,
      userId,
      label,
      address,
      city: city || null,
      icon: icon || "location-outline",
      isDefault: isDefault ?? false,
    });
  });

  const [addr] = await db.select().from(savedAddressesTable).where(eq(savedAddressesTable.id, id)).limit(1);
  sendCreated(res, { ...addr, createdAt: addr!.createdAt.toISOString() });
});

router.put("/:id", validateBody(updateAddressSchema), async (req, res) => {
  const userId = req.customerId!;
  const { label, address, city, icon, isDefault } = req.body;
  const { id } = req.params;

  const [existing] = await db.select().from(savedAddressesTable).where(eq(savedAddressesTable.id, id!)).limit(1);
  if (!existing) { sendNotFound(res, "Address not found", "پتہ نہیں ملا۔"); return; }
  if (existing.userId !== userId) { sendForbidden(res, "Access denied", "رسائی سے انکار۔"); return; }

  await db.transaction(async (tx) => {
    if (isDefault) {
      await tx.update(savedAddressesTable).set({ isDefault: false }).where(eq(savedAddressesTable.userId, userId));
    }
    await tx.update(savedAddressesTable).set({ label, address, city, icon, isDefault }).where(eq(savedAddressesTable.id, id!));
  });

  sendSuccess(res, null);
});

router.patch("/:id/set-default", async (req, res) => {
  const userId = req.customerId!;
  const { id } = req.params;

  const [existing] = await db.select().from(savedAddressesTable).where(eq(savedAddressesTable.id, id!)).limit(1);
  if (!existing) { sendNotFound(res, "Address not found", "پتہ نہیں ملا۔"); return; }
  if (existing.userId !== userId) { sendForbidden(res, "Access denied", "رسائی سے انکار۔"); return; }

  await db.transaction(async (tx) => {
    /* Clear all defaults, then set the target — both in the same transaction */
    await tx.update(savedAddressesTable).set({ isDefault: false }).where(eq(savedAddressesTable.userId, userId));
    await tx.update(savedAddressesTable).set({ isDefault: true }).where(and(
      eq(savedAddressesTable.id, id!),
      eq(savedAddressesTable.userId, userId),
    ));
  });

  sendSuccess(res, null);
});

router.delete("/:id", async (req, res) => {
  const userId = req.customerId!;

  const [existing] = await db.select().from(savedAddressesTable).where(eq(savedAddressesTable.id, req.params["id"]!)).limit(1);
  if (!existing) { sendNotFound(res, "Address not found", "پتہ نہیں ملا۔"); return; }
  if (existing.userId !== userId) { sendForbidden(res, "Access denied", "رسائی سے انکار۔"); return; }

  await db.delete(savedAddressesTable).where(eq(savedAddressesTable.id, req.params["id"]!));
  sendSuccess(res, null);
});

export default router;
