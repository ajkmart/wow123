import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { productVariantsTable, productsTable } from "@workspace/db/schema";
import { eq, and, asc, ilike, SQL, inArray, desc } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { adminAuth } from "./admin.js";
import { sendSuccess, sendCreated, sendNotFound, sendValidationError } from "../lib/response.js";

const router: IRouter = Router();

router.get("/product/:productId", async (req, res) => {
  const productId = req.params["productId"]!;
  const variants = await db
    .select()
    .from(productVariantsTable)
    .where(and(
      eq(productVariantsTable.productId, productId),
      eq(productVariantsTable.inStock, true),
    ))
    .orderBy(asc(productVariantsTable.sortOrder));

  res.json({
    variants: variants.map(v => ({
      ...v,
      price: parseFloat(v.price),
      originalPrice: v.originalPrice ? parseFloat(v.originalPrice) : undefined,
      attributes: v.attributes ? JSON.parse(v.attributes) : null,
    })),
    total: variants.length,
  });
});

router.get("/product/:productId/all", adminAuth, async (req, res) => {
  const productId = req.params["productId"]!;
  const variants = await db
    .select()
    .from(productVariantsTable)
    .where(eq(productVariantsTable.productId, productId))
    .orderBy(asc(productVariantsTable.sortOrder));

  res.json({
    variants: variants.map(v => ({
      ...v,
      price: parseFloat(v.price),
      originalPrice: v.originalPrice ? parseFloat(v.originalPrice) : undefined,
      attributes: v.attributes ? JSON.parse(v.attributes) : null,
    })),
    total: variants.length,
  });
});

router.post("/", adminAuth, async (req, res) => {
  const { productId, label, type, price, originalPrice, sku, stock, inStock, sortOrder, attributes } = req.body;
  if (!productId || !label || price === undefined) {
    res.status(400).json({ error: "productId, label, and price are required" });
    return;
  }

  const [product] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.id, productId)).limit(1);
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const [variant] = await db.insert(productVariantsTable).values({
    id: generateId(),
    productId,
    label,
    type: type || "size",
    price: String(price),
    originalPrice: originalPrice ? String(originalPrice) : null,
    sku: sku || null,
    stock: stock ?? null,
    inStock: inStock !== false,
    sortOrder: sortOrder ?? 0,
    attributes: attributes ? JSON.stringify(attributes) : null,
  }).returning();

  res.status(201).json({
    ...variant!,
    price: parseFloat(variant!.price),
    originalPrice: variant!.originalPrice ? parseFloat(variant!.originalPrice) : undefined,
    attributes: variant!.attributes ? JSON.parse(variant!.attributes) : null,
  });
});

router.patch("/:id", adminAuth, async (req, res) => {
  const variantId = req.params["id"]!;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (req.body.label !== undefined) updates.label = req.body.label;
  if (req.body.type !== undefined) updates.type = req.body.type;
  if (req.body.price !== undefined) updates.price = String(req.body.price);
  if (req.body.originalPrice !== undefined) updates.originalPrice = req.body.originalPrice ? String(req.body.originalPrice) : null;
  if (req.body.sku !== undefined) updates.sku = req.body.sku;
  if (req.body.stock !== undefined) updates.stock = req.body.stock;
  if (req.body.inStock !== undefined) updates.inStock = req.body.inStock;
  if (req.body.sortOrder !== undefined) updates.sortOrder = req.body.sortOrder;
  if (req.body.attributes !== undefined) updates.attributes = req.body.attributes ? JSON.stringify(req.body.attributes) : null;

  const [updated] = await db.update(productVariantsTable).set(updates).where(eq(productVariantsTable.id, variantId)).returning();
  if (!updated) {
    res.status(404).json({ error: "Variant not found" });
    return;
  }
  res.json({
    ...updated,
    price: parseFloat(updated.price),
    originalPrice: updated.originalPrice ? parseFloat(updated.originalPrice) : undefined,
    attributes: updated.attributes ? JSON.parse(updated.attributes) : null,
  });
});

router.delete("/:id", adminAuth, async (req, res) => {
  const variantId = req.params["id"]!;
  const [deleted] = await db.delete(productVariantsTable).where(eq(productVariantsTable.id, variantId)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Variant not found" });
    return;
  }
  res.json({ success: true, id: variantId });
});

export default router;
