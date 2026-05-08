import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const pendingOtpsTable = pgTable("pending_otps", {
  id:        text("id").primaryKey(),
  phone:     text("phone").notNull().unique(),
  otpHash:   text("otp_hash").notNull(),
  otpExpiry: timestamp("otp_expiry").notNull(),
  attempts:  integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
