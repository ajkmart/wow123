import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const refreshTokensTable = pgTable("refresh_tokens", {
  id:             text("id").primaryKey(),
  userId:         text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  tokenHash:      text("token_hash").notNull().unique(),
  authMethod:     text("auth_method"),
  tokenFamilyId:  text("token_family_id"),
  revoked:        boolean("revoked").default(false).notNull(),
  revokedReason:  text("revoked_reason"),
  expiresAt:      timestamp("expires_at").notNull(),
  revokedAt:      timestamp("revoked_at"),
  usedAt:         timestamp("used_at"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

export type RefreshToken = typeof refreshTokensTable.$inferSelect;
