CREATE TYPE "public"."condition_mode" AS ENUM('default', 'ai_recommended', 'custom');--> statement-breakpoint
CREATE TYPE "public"."condition_severity" AS ENUM('warning', 'restriction_normal', 'restriction_strict', 'suspension', 'ban');--> statement-breakpoint
CREATE TYPE "public"."condition_type" AS ENUM('warning_l1', 'warning_l2', 'warning_l3', 'restriction_service_block', 'restriction_wallet_freeze', 'restriction_promo_block', 'restriction_order_cap', 'restriction_review_block', 'restriction_cash_only', 'restriction_new_order_block', 'restriction_rate_limit', 'restriction_pending_review_gate', 'restriction_device_restriction', 'suspension_temporary', 'suspension_extended', 'suspension_pending_review', 'ban_soft', 'ban_hard', 'ban_fraud');--> statement-breakpoint
CREATE TABLE "van_bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"schedule_id" text NOT NULL,
	"route_id" text NOT NULL,
	"seat_numbers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"travel_date" text NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"fare" numeric(10, 2) NOT NULL,
	"payment_method" text DEFAULT 'cash' NOT NULL,
	"passenger_name" text,
	"passenger_phone" text,
	"boarded_at" timestamp,
	"completed_at" timestamp,
	"cancelled_at" timestamp,
	"cancellation_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "van_routes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_urdu" text,
	"from_address" text NOT NULL,
	"from_address_urdu" text,
	"from_lat" numeric(10, 6),
	"from_lng" numeric(10, 6),
	"to_address" text NOT NULL,
	"to_address_urdu" text,
	"to_lat" numeric(10, 6),
	"to_lng" numeric(10, 6),
	"distance_km" numeric(6, 2),
	"duration_min" integer,
	"fare_per_seat" numeric(10, 2) NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "van_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"route_id" text NOT NULL,
	"vehicle_id" text,
	"driver_id" text,
	"departure_time" text NOT NULL,
	"return_time" text,
	"days_of_week" jsonb DEFAULT '[1,2,3,4,5,6]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "van_vehicles" (
	"id" text PRIMARY KEY NOT NULL,
	"driver_id" text,
	"plate_number" text NOT NULL,
	"model" text DEFAULT 'Suzuki Carry' NOT NULL,
	"total_seats" integer DEFAULT 12 NOT NULL,
	"seat_layout" jsonb DEFAULT 'null'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_zones" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"lat" numeric(10, 6) NOT NULL,
	"lng" numeric(10, 6) NOT NULL,
	"radius_km" numeric(8, 2) DEFAULT '30' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"applies_to_rides" boolean DEFAULT true NOT NULL,
	"applies_to_orders" boolean DEFAULT true NOT NULL,
	"applies_to_parcel" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "map_api_usage_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"endpoint_type" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "map_api_usage_log_unique" UNIQUE("provider","endpoint_type","date")
);
--> statement-breakpoint
CREATE TABLE "delivery_access_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"vendor_id" text NOT NULL,
	"service_type" text DEFAULT 'all' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "delivery_whitelist" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"target_id" text NOT NULL,
	"service_type" text DEFAULT 'all' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"valid_until" timestamp,
	"delivery_label" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text,
	"admin_name" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"old_value" text,
	"new_value" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_conditions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_role" text NOT NULL,
	"condition_type" "condition_type" NOT NULL,
	"severity" "condition_severity" NOT NULL,
	"category" text NOT NULL,
	"reason" text NOT NULL,
	"notes" text,
	"applied_by" text,
	"applied_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"lifted_at" timestamp,
	"lifted_by" text,
	"lift_reason" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "condition_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_role" text NOT NULL,
	"metric" text NOT NULL,
	"operator" text NOT NULL,
	"threshold" text NOT NULL,
	"condition_type" "condition_type" NOT NULL,
	"severity" "condition_severity" NOT NULL,
	"cooldown_hours" integer DEFAULT 24 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"mode_applicability" text DEFAULT 'default,ai_recommended,custom' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "condition_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"mode" "condition_mode" DEFAULT 'default' NOT NULL,
	"custom_thresholds" jsonb,
	"ai_parameters" jsonb,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "ride_bids_ride_rider_uidx";--> statement-breakpoint
ALTER TABLE "ride_event_logs" ALTER COLUMN "rider_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "store_lat" numeric(10, 6);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "store_lng" numeric(10, 6);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "wallet_pin_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "wallet_pin_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "wallet_pin_locked_until" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "wallet_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_lat" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_lng" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "gps_accuracy" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "gps_mismatch" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_lat" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_lng" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "is_scheduled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "scheduled_at" timestamp;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "stops" jsonb DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "is_pool_ride" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "pool_group_id" text;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "refunded_at" timestamp;--> statement-breakpoint
ALTER TABLE "ride_bids" ADD COLUMN "expires_at" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "ride_event_logs" ADD COLUMN "admin_id" text;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "refresh_token_id" text;--> statement-breakpoint
ALTER TABLE "van_bookings" ADD CONSTRAINT "van_bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "van_bookings" ADD CONSTRAINT "van_bookings_schedule_id_van_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."van_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "van_bookings" ADD CONSTRAINT "van_bookings_route_id_van_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."van_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "van_schedules" ADD CONSTRAINT "van_schedules_route_id_van_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."van_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "van_schedules" ADD CONSTRAINT "van_schedules_vehicle_id_van_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."van_vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "van_schedules" ADD CONSTRAINT "van_schedules_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "van_vehicles" ADD CONSTRAINT "van_vehicles_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_access_requests" ADD CONSTRAINT "delivery_access_requests_vendor_id_users_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_whitelist" ADD CONSTRAINT "delivery_whitelist_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_conditions" ADD CONSTRAINT "account_conditions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "van_bookings_user_id_idx" ON "van_bookings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "van_bookings_schedule_id_idx" ON "van_bookings" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "van_bookings_travel_date_idx" ON "van_bookings" USING btree ("travel_date");--> statement-breakpoint
CREATE INDEX "van_bookings_status_idx" ON "van_bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "van_routes_is_active_idx" ON "van_routes" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "van_schedules_route_id_idx" ON "van_schedules" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "van_schedules_vehicle_id_idx" ON "van_schedules" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "van_schedules_driver_id_idx" ON "van_schedules" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "van_vehicles_driver_id_idx" ON "van_vehicles" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "service_zones_is_active_idx" ON "service_zones" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "service_zones_city_idx" ON "service_zones" USING btree ("city");--> statement-breakpoint
CREATE INDEX "delivery_access_requests_vendor_idx" ON "delivery_access_requests" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "delivery_access_requests_status_idx" ON "delivery_access_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "delivery_whitelist_type_target_service_idx" ON "delivery_whitelist" USING btree ("type","target_id","service_type");--> statement-breakpoint
CREATE INDEX "delivery_whitelist_type_status_idx" ON "delivery_whitelist" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "account_conditions_user_id_idx" ON "account_conditions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_conditions_user_role_idx" ON "account_conditions" USING btree ("user_role");--> statement-breakpoint
CREATE INDEX "account_conditions_type_idx" ON "account_conditions" USING btree ("condition_type");--> statement-breakpoint
CREATE INDEX "account_conditions_severity_idx" ON "account_conditions" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "account_conditions_is_active_idx" ON "account_conditions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "account_conditions_applied_at_idx" ON "account_conditions" USING btree ("applied_at");--> statement-breakpoint
CREATE INDEX "condition_rules_target_role_idx" ON "condition_rules" USING btree ("target_role");--> statement-breakpoint
CREATE INDEX "condition_rules_is_active_idx" ON "condition_rules" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_is_online_idx" ON "users" USING btree ("is_online");--> statement-breakpoint
CREATE INDEX "users_role_is_online_idx" ON "users" USING btree ("role","is_online");--> statement-breakpoint
CREATE UNIQUE INDEX "rides_one_active_per_user_uidx" ON "rides" USING btree ("user_id") WHERE status IN ('searching', 'bargaining', 'accepted', 'arrived', 'in_transit', 'dispatched', 'pending');--> statement-breakpoint
CREATE INDEX "ride_bids_expires_at_idx" ON "ride_bids" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ride_bids_ride_rider_uidx" ON "ride_bids" USING btree ("ride_id","rider_id");