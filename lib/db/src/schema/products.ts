import { boolean, check, decimal, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const productsTable = pgTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  originalPrice: decimal("original_price", { precision: 10, scale: 2 }),
  category: text("category").notNull(),
  type: text("type").notNull().default("mart"),
  image: text("image"),
  images: text("images").array(),
  videoUrl: text("video_url"),
  vendorId: text("vendor_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  vendorName: text("vendor_name"),
  rating: decimal("rating", { precision: 3, scale: 1 }).default("4.0"),
  reviewCount: integer("review_count").default(0),
  inStock: boolean("in_stock").notNull().default(true),
  stock: integer("stock"),
  unit: text("unit"),
  deliveryTime: text("delivery_time"),
  dealExpiresAt: timestamp("deal_expires_at"),
  approvalStatus: text("approval_status").notNull().default("approved"),
  /* Per-product overrides for the global vendor inventory settings.
     NULL means "use the platform default from `inventory_*` settings". */
  lowStockThreshold:    integer("low_stock_threshold"),
  maxQuantityPerOrder:  integer("max_quantity_per_order"),
  backInStockNotify:    boolean("back_in_stock_notify"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("products_vendor_id_idx").on(t.vendorId),
  index("products_category_idx").on(t.category),
  index("products_in_stock_idx").on(t.inStock),
  index("products_type_idx").on(t.type),
  index("products_name_idx").on(t.name),
  index("products_price_idx").on(t.price),
  index("products_fts_gin_idx").using(
    "gin",
    sql`to_tsvector('english', coalesce(${t.name}, '') || ' ' || coalesce(${t.description}, ''))`
  ),
  /* Product price must be positive */
  check("products_price_positive", sql`${t.price} > 0`),
]);

export const insertProductSchema = createInsertSchema(productsTable).omit({ createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
