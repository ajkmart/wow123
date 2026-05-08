import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userSessionsTable = pgTable("user_sessions", {
  id:          text("id").primaryKey(),
  userId:      text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  tokenHash:   text("token_hash").notNull(),
  refreshTokenId: text("refresh_token_id"),
  deviceName:  text("device_name"),
  browser:     text("browser"),
  os:          text("os"),
  ip:          text("ip"),
  location:    text("location"),
  lastActiveAt: timestamp("last_active_at").notNull().defaultNow(),
  revokedAt:   timestamp("revoked_at"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("user_sessions_user_id_idx").on(t.userId),
]);

export type UserSession = typeof userSessionsTable.$inferSelect;
