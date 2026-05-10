import { boolean, decimal, index, integer, pgTable, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const ridesTable = pgTable("rides", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  status: text("status").notNull().default("searching"),
  pickupAddress: text("pickup_address").notNull(),
  dropAddress: text("drop_address").notNull(),
  pickupLat: decimal("pickup_lat", { precision: 10, scale: 6 }),
  pickupLng: decimal("pickup_lng", { precision: 10, scale: 6 }),
  dropLat: decimal("drop_lat", { precision: 10, scale: 6 }),
  dropLng: decimal("drop_lng", { precision: 10, scale: 6 }),
  fare: decimal("fare", { precision: 10, scale: 2 }).notNull(),
  distance: decimal("distance", { precision: 10, scale: 2 }).notNull(),
  riderId: text("rider_id").references(() => usersTable.id, { onDelete: "set null" }),
  riderName: text("rider_name"),
  riderPhone: text("rider_phone"),
  paymentMethod: text("payment_method").notNull(),
  offeredFare:    decimal("offered_fare",   { precision: 10, scale: 2 }),
  counterFare:    decimal("counter_fare",   { precision: 10, scale: 2 }),
  bargainStatus:  text("bargain_status"),
  bargainRounds:  integer("bargain_rounds").default(0),
  bargainNote:    text("bargain_note"),
  cancellationReason: text("cancellation_reason"),
  dispatchedRiderId: text("dispatched_rider_id").references(() => usersTable.id, { onDelete: "set null" }),
  dispatchAttempts:  jsonb("dispatch_attempts").default([]),
  dispatchLoopCount: integer("dispatch_loop_count").default(0),
  dispatchedAt:      timestamp("dispatched_at"),
  expiresAt:         timestamp("expires_at"),
  tripOtp:     text("trip_otp"),
  otpVerified: boolean("otp_verified").notNull().default(false),
  isParcel:      boolean("is_parcel").notNull().default(false),
  receiverName:  text("receiver_name"),
  receiverPhone: text("receiver_phone"),
  packageType:   text("package_type"),
  isScheduled:   boolean("is_scheduled").notNull().default(false),
  scheduledAt:   timestamp("scheduled_at"),
  stops:         jsonb("stops").default(null),
  isPoolRide:    boolean("is_pool_ride").notNull().default(false),
  poolGroupId:   text("pool_group_id"),
  acceptedAt:   timestamp("accepted_at"),
  arrivedAt:    timestamp("arrived_at"),
  startedAt:    timestamp("started_at"),
  completedAt:  timestamp("completed_at"),
  cancelledAt:  timestamp("cancelled_at"),
  refundedAt:   timestamp("refunded_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("rides_user_id_idx").on(t.userId),
  index("rides_rider_id_idx").on(t.riderId),
  index("rides_status_idx").on(t.status),
  index("rides_created_at_idx").on(t.createdAt),
  index("rides_status_rider_id_idx").on(t.status, t.riderId),
  index("rides_rider_id_status_idx").on(t.riderId, t.status),
  /* Prevent a customer from holding more than one active ride at a time.
     The partial index fires only on non-terminal statuses so completed/cancelled
     rides do not block future bookings. This is an application-level guard;
     the pessimistic row-lock inside the booking transaction is the primary defence.
     All live statuses are listed explicitly so adding a new status in future
     cannot silently create a bypass. */
  uniqueIndex("rides_one_active_per_user_uidx")
    .on(t.userId)
    .where(sql`status IN ('searching', 'bargaining', 'accepted', 'arrived', 'in_transit', 'dispatched', 'pending')`),
]);

export const insertRideSchema = createInsertSchema(ridesTable).omit({ createdAt: true, updatedAt: true });
export type InsertRide = z.infer<typeof insertRideSchema>;
export type Ride = typeof ridesTable.$inferSelect;
