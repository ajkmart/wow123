CREATE TYPE "public"."language_mode" AS ENUM('en', 'ur', 'roman', 'en_roman', 'en_ur');--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text,
	"name" text,
	"email" text,
	"role" text DEFAULT 'customer' NOT NULL,
	"roles" text DEFAULT 'customer' NOT NULL,
	"avatar" text,
	"wallet_balance" numeric(10, 2) DEFAULT '0' NOT NULL,
	"otp_code" text,
	"otp_expiry" timestamp,
	"otp_used" boolean DEFAULT false NOT NULL,
	"email_otp_code" text,
	"email_otp_expiry" timestamp,
	"username" text,
	"password_hash" text,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"approval_status" text DEFAULT 'approved' NOT NULL,
	"approval_note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"blocked_services" text DEFAULT '' NOT NULL,
	"security_note" text,
	"is_online" boolean DEFAULT false NOT NULL,
	"cnic" text,
	"address" text,
	"city" text,
	"area" text,
	"latitude" text,
	"longitude" text,
	"kyc_status" text DEFAULT 'none' NOT NULL,
	"account_level" text DEFAULT 'bronze' NOT NULL,
	"emergency_contact" text,
	"bank_name" text,
	"bank_account" text,
	"bank_account_title" text,
	"national_id" text,
	"store_name" text,
	"store_category" text,
	"store_banner" text,
	"store_description" text,
	"store_hours" text,
	"store_announcement" text,
	"store_min_order" numeric(10, 2) DEFAULT '0',
	"store_delivery_time" text,
	"store_is_open" boolean DEFAULT true NOT NULL,
	"store_address" text,
	"business_type" text,
	"business_name" text,
	"ntn" text,
	"vehicle_type" text,
	"vehicle_plate" text,
	"vehicle_reg_no" text,
	"driving_license" text,
	"vehicle_photo" text,
	"documents" text,
	"biometric_enabled" boolean DEFAULT false NOT NULL,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"backup_codes" text,
	"trusted_devices" text,
	"google_id" text,
	"facebook_id" text,
	"cancel_count" integer DEFAULT 0 NOT NULL,
	"ignore_count" integer DEFAULT 0 NOT NULL,
	"is_restricted" boolean DEFAULT false NOT NULL,
	"cancellation_debt" numeric(10, 2) DEFAULT '0' NOT NULL,
	"merge_otp_code" text,
	"merge_otp_expiry" timestamp,
	"pending_merge_identifier" text,
	"device_id" text,
	"token_version" integer DEFAULT 0 NOT NULL,
	"dev_otp_enabled" boolean DEFAULT false NOT NULL,
	"auto_suspended_at" timestamp,
	"auto_suspend_reason" text,
	"admin_override_suspension" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp,
	"last_active" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id"),
	CONSTRAINT "users_facebook_id_unique" UNIQUE("facebook_id"),
	CONSTRAINT "users_wallet_non_negative" CHECK ("users"."wallet_balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"original_price" numeric(10, 2),
	"category" text NOT NULL,
	"type" text DEFAULT 'mart' NOT NULL,
	"image" text,
	"images" text[],
	"vendor_id" text NOT NULL,
	"vendor_name" text,
	"rating" numeric(3, 1) DEFAULT '4.0',
	"review_count" integer DEFAULT 0,
	"in_stock" boolean DEFAULT true NOT NULL,
	"stock" integer,
	"unit" text,
	"delivery_time" text,
	"deal_expires_at" timestamp,
	"approval_status" text DEFAULT 'approved' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_price_positive" CHECK ("products"."price" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"items" json NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"delivery_address" text,
	"payment_method" text NOT NULL,
	"rider_id" text,
	"rider_name" text,
	"rider_phone" text,
	"vendor_id" text,
	"estimated_time" text,
	"proof_photo_url" text,
	"txn_ref" text,
	"payment_status" text DEFAULT 'pending',
	"refunded_at" timestamp,
	"refunded_amount" numeric(10, 2),
	"assigned_rider_id" text,
	"assigned_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_total_non_negative" CHECK ("orders"."total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"description" text NOT NULL,
	"reference" text,
	"payment_method" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_txn_amount_non_negative" CHECK ("wallet_transactions"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rides" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'searching' NOT NULL,
	"pickup_address" text NOT NULL,
	"drop_address" text NOT NULL,
	"pickup_lat" numeric(10, 6),
	"pickup_lng" numeric(10, 6),
	"drop_lat" numeric(10, 6),
	"drop_lng" numeric(10, 6),
	"fare" numeric(10, 2) NOT NULL,
	"distance" numeric(10, 2) NOT NULL,
	"rider_id" text,
	"rider_name" text,
	"rider_phone" text,
	"payment_method" text NOT NULL,
	"offered_fare" numeric(10, 2),
	"counter_fare" numeric(10, 2),
	"bargain_status" text,
	"bargain_rounds" integer DEFAULT 0,
	"bargain_note" text,
	"cancellation_reason" text,
	"dispatched_rider_id" text,
	"dispatch_attempts" jsonb DEFAULT '[]'::jsonb,
	"dispatch_loop_count" integer DEFAULT 0,
	"dispatched_at" timestamp,
	"expires_at" timestamp,
	"trip_otp" text,
	"otp_verified" boolean DEFAULT false NOT NULL,
	"is_parcel" boolean DEFAULT false NOT NULL,
	"receiver_name" text,
	"receiver_phone" text,
	"package_type" text,
	"accepted_at" timestamp,
	"arrived_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ride_bids" (
	"id" text PRIMARY KEY NOT NULL,
	"ride_id" text NOT NULL,
	"rider_id" text NOT NULL,
	"rider_name" text NOT NULL,
	"rider_phone" text,
	"fare" numeric(10, 2) NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_locations" (
	"user_id" text PRIMARY KEY NOT NULL,
	"latitude" numeric(10, 6) NOT NULL,
	"longitude" numeric(10, 6) NOT NULL,
	"role" text NOT NULL,
	"action" text,
	"battery_level" real,
	"last_seen" timestamp,
	"online_since" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pharmacy_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"rider_id" text,
	"items" json NOT NULL,
	"prescription_note" text,
	"delivery_address" text NOT NULL,
	"contact_phone" text NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"payment_method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"estimated_time" text DEFAULT '25-40 min',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parcel_bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sender_name" text NOT NULL,
	"sender_phone" text NOT NULL,
	"pickup_address" text NOT NULL,
	"receiver_name" text NOT NULL,
	"receiver_phone" text NOT NULL,
	"drop_address" text NOT NULL,
	"parcel_type" text NOT NULL,
	"weight" numeric(6, 2),
	"description" text,
	"fare" numeric(10, 2) NOT NULL,
	"payment_method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"estimated_time" text DEFAULT '45-60 min',
	"rider_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"type" text DEFAULT 'system' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"icon" text DEFAULT 'notifications-outline',
	"link" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sos_status" text DEFAULT 'pending',
	"acknowledged_at" timestamp,
	"acknowledged_by" text,
	"acknowledged_by_name" text,
	"resolved_at" timestamp,
	"resolved_by" text,
	"resolved_by_name" text,
	"resolution_notes" text
);
--> statement-breakpoint
CREATE TABLE "saved_addresses" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"address" text NOT NULL,
	"city" text DEFAULT 'Muzaffarabad' NOT NULL,
	"icon" text DEFAULT 'location-outline' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"notif_orders" boolean DEFAULT true NOT NULL,
	"notif_wallet" boolean DEFAULT true NOT NULL,
	"notif_deals" boolean DEFAULT true NOT NULL,
	"notif_rides" boolean DEFAULT true NOT NULL,
	"location_sharing" boolean DEFAULT true NOT NULL,
	"biometric" boolean DEFAULT false NOT NULL,
	"two_factor" boolean DEFAULT false NOT NULL,
	"dark_mode" boolean DEFAULT false NOT NULL,
	"language" "language_mode" DEFAULT 'en_roman' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"label" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flash_deals" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"title" text,
	"badge" text DEFAULT 'FLASH' NOT NULL,
	"discount_pct" numeric(5, 2),
	"discount_flat" numeric(10, 2),
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"deal_stock" integer,
	"sold_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"discount_pct" numeric(5, 2),
	"discount_flat" numeric(10, 2),
	"min_order_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"max_discount" numeric(10, 2),
	"usage_limit" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"applies_to" text DEFAULT 'all' NOT NULL,
	"expires_at" timestamp,
	"vendor_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "promo_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "admin_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"secret" text NOT NULL,
	"role" text DEFAULT 'manager' NOT NULL,
	"permissions" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"language" text DEFAULT 'en',
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_accounts_secret_unique" UNIQUE("secret")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"user_id" text NOT NULL,
	"vendor_id" text,
	"rider_id" text,
	"order_type" text NOT NULL,
	"rating" integer NOT NULL,
	"rider_rating" integer,
	"comment" text,
	"photos" text[],
	"product_id" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"deleted_by" text,
	"status" text DEFAULT 'visible' NOT NULL,
	"moderation_note" text,
	"vendor_reply" text,
	"vendor_replied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating"       BETWEEN 1 AND 5),
	CONSTRAINT "reviews_rider_rating_range" CHECK ("reviews"."rider_rating"  IS NULL OR "reviews"."rider_rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "system_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"action_id" text NOT NULL,
	"tables_json" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ride_service_types" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"name_urdu" text,
	"icon" text DEFAULT '🚗' NOT NULL,
	"description" text,
	"color" text DEFAULT '#059669' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"base_fare" numeric(10, 2) DEFAULT '15' NOT NULL,
	"per_km" numeric(10, 2) DEFAULT '8' NOT NULL,
	"min_fare" numeric(10, 2) DEFAULT '50' NOT NULL,
	"max_passengers" integer DEFAULT 1 NOT NULL,
	"allow_bargaining" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ride_service_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "popular_locations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_urdu" text,
	"lat" numeric(10, 6) NOT NULL,
	"lng" numeric(10, 6) NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"icon" text DEFAULT '📍' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_routes" (
	"id" text PRIMARY KEY NOT NULL,
	"route_name" text NOT NULL,
	"school_name" text NOT NULL,
	"school_name_urdu" text,
	"from_area" text NOT NULL,
	"from_area_urdu" text,
	"to_address" text NOT NULL,
	"from_lat" numeric(10, 6),
	"from_lng" numeric(10, 6),
	"to_lat" numeric(10, 6),
	"to_lng" numeric(10, 6),
	"monthly_price" numeric(10, 2) NOT NULL,
	"morning_time" text DEFAULT '7:30 AM',
	"afternoon_time" text,
	"capacity" integer DEFAULT 30 NOT NULL,
	"enrolled_count" integer DEFAULT 0 NOT NULL,
	"vehicle_type" text DEFAULT 'school_shift' NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"route_id" text NOT NULL,
	"student_name" text NOT NULL,
	"student_class" text NOT NULL,
	"monthly_amount" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"payment_method" text DEFAULT 'cash' NOT NULL,
	"start_date" timestamp DEFAULT now() NOT NULL,
	"next_billing_date" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ride_event_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"ride_id" text NOT NULL,
	"rider_id" text NOT NULL,
	"event" text NOT NULL,
	"lat" numeric(10, 6),
	"lng" numeric(10, 6),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"auth_method" text,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "auth_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"event" text NOT NULL,
	"ip" text DEFAULT 'unknown' NOT NULL,
	"user_agent" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_link_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "magic_link_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "rider_penalties" (
	"id" text PRIMARY KEY NOT NULL,
	"rider_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ride_ratings" (
	"id" text PRIMARY KEY NOT NULL,
	"ride_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"rider_id" text NOT NULL,
	"stars" integer NOT NULL,
	"comment" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"deleted_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ride_notified_riders" (
	"id" text PRIMARY KEY NOT NULL,
	"ride_id" text NOT NULL,
	"rider_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'rider' NOT NULL,
	"latitude" numeric(10, 6) NOT NULL,
	"longitude" numeric(10, 6) NOT NULL,
	"accuracy" real,
	"speed" real,
	"heading" real,
	"battery_level" real,
	"is_spoofed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"window_start" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"label" text NOT NULL,
	"type" text DEFAULT 'size' NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"original_price" numeric(10, 2),
	"sku" text,
	"stock" integer,
	"in_stock" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"attributes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "banners" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"image_url" text,
	"link_type" text DEFAULT 'none' NOT NULL,
	"link_value" text,
	"target_service" text,
	"placement" text DEFAULT 'home' NOT NULL,
	"color_from" text DEFAULT '#7C3AED' NOT NULL,
	"color_to" text DEFAULT '#4F46E5' NOT NULL,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_interactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"interaction_type" text DEFAULT 'view' NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rider_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"vehicle_type" text,
	"vehicle_plate" text,
	"vehicle_reg_no" text,
	"driving_license" text,
	"vehicle_photo" text,
	"documents" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"store_name" text,
	"store_category" text,
	"store_banner" text,
	"store_description" text,
	"store_hours" text,
	"store_announcement" text,
	"store_min_order" numeric(10, 2) DEFAULT '0',
	"store_delivery_time" text,
	"store_is_open" boolean DEFAULT true NOT NULL,
	"store_address" text,
	"business_type" text,
	"business_name" text,
	"ntn" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'customer' NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_otps" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"otp_hash" text NOT NULL,
	"otp_expiry" timestamp NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pending_otps_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "kyc_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"full_name" text,
	"cnic" text,
	"date_of_birth" text,
	"gender" text,
	"address" text,
	"city" text,
	"front_id_photo" text,
	"back_id_photo" text,
	"selfie_photo" text,
	"rejection_reason" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"device_name" text,
	"browser" text,
	"os" text,
	"ip" text,
	"location" text,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_history" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ip" text,
	"device_name" text,
	"browser" text,
	"os" text,
	"location" text,
	"success" boolean DEFAULT true NOT NULL,
	"method" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlist" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT 'grid-outline' NOT NULL,
	"type" text DEFAULT 'mart' NOT NULL,
	"parent_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ride_id" text,
	"order_id" text,
	"coords" jsonb NOT NULL,
	"heading" numeric(6, 2),
	"speed" numeric(8, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_vendor_id_users_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_vendor_id_users_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_rider_id_users_id_fk" FOREIGN KEY ("assigned_rider_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_dispatched_rider_id_users_id_fk" FOREIGN KEY ("dispatched_rider_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_bids" ADD CONSTRAINT "ride_bids_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_bids" ADD CONSTRAINT "ride_bids_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_locations" ADD CONSTRAINT "live_locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_orders" ADD CONSTRAINT "pharmacy_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_orders" ADD CONSTRAINT "pharmacy_orders_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcel_bookings" ADD CONSTRAINT "parcel_bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcel_bookings" ADD CONSTRAINT "parcel_bookings_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_addresses" ADD CONSTRAINT "saved_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_vendor_id_users_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_vendor_id_users_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_subscriptions" ADD CONSTRAINT "school_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_subscriptions" ADD CONSTRAINT "school_subscriptions_route_id_school_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."school_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_event_logs" ADD CONSTRAINT "ride_event_logs_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_event_logs" ADD CONSTRAINT "ride_event_logs_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_audit_log" ADD CONSTRAINT "auth_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_link_tokens" ADD CONSTRAINT "magic_link_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_penalties" ADD CONSTRAINT "rider_penalties_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_ratings" ADD CONSTRAINT "ride_ratings_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_ratings" ADD CONSTRAINT "ride_ratings_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_ratings" ADD CONSTRAINT "ride_ratings_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_notified_riders" ADD CONSTRAINT "ride_notified_riders_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_notified_riders" ADD CONSTRAINT "ride_notified_riders_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_logs" ADD CONSTRAINT "location_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_interactions" ADD CONSTRAINT "user_interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_interactions" ADD CONSTRAINT "user_interactions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_profiles" ADD CONSTRAINT "rider_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_profiles" ADD CONSTRAINT "vendor_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_verifications" ADD CONSTRAINT "kyc_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_history" ADD CONSTRAINT "login_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_history" ADD CONSTRAINT "location_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_history" ADD CONSTRAINT "location_history_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_history" ADD CONSTRAINT "location_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_vendor_id_idx" ON "products" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category");--> statement-breakpoint
CREATE INDEX "products_in_stock_idx" ON "products" USING btree ("in_stock");--> statement-breakpoint
CREATE INDEX "products_type_idx" ON "products" USING btree ("type");--> statement-breakpoint
CREATE INDEX "orders_user_id_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orders_rider_id_idx" ON "orders" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "orders_vendor_id_idx" ON "orders" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "wallet_txn_user_id_idx" ON "wallet_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallet_txn_created_at_idx" ON "wallet_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "wallet_txn_reference_idx" ON "wallet_transactions" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "rides_user_id_idx" ON "rides" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rides_rider_id_idx" ON "rides" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "rides_status_idx" ON "rides" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rides_created_at_idx" ON "rides" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ride_bids_ride_rider_uidx" ON "ride_bids" USING btree ("ride_id","rider_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "ride_bids_ride_id_idx" ON "ride_bids" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "ride_bids_rider_id_idx" ON "ride_bids" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "ride_bids_status_idx" ON "ride_bids" USING btree ("status");--> statement-breakpoint
CREATE INDEX "live_locations_role_idx" ON "live_locations" USING btree ("role");--> statement-breakpoint
CREATE INDEX "live_locations_lat_lng_idx" ON "live_locations" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "live_locations_role_updated_idx" ON "live_locations" USING btree ("role","updated_at");--> statement-breakpoint
CREATE INDEX "pharmacy_orders_user_id_idx" ON "pharmacy_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pharmacy_orders_rider_id_idx" ON "pharmacy_orders" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "pharmacy_orders_status_idx" ON "pharmacy_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pharmacy_orders_created_at_idx" ON "pharmacy_orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "parcel_bookings_user_id_idx" ON "parcel_bookings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "parcel_bookings_rider_id_idx" ON "parcel_bookings" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "parcel_bookings_status_idx" ON "parcel_bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "parcel_bookings_created_at_idx" ON "parcel_bookings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_sos_status_idx" ON "notifications" USING btree ("sos_status");--> statement-breakpoint
CREATE INDEX "saved_addresses_user_id_idx" ON "saved_addresses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "flash_deals_product_id_idx" ON "flash_deals" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "flash_deals_is_active_idx" ON "flash_deals" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "flash_deals_end_time_idx" ON "flash_deals" USING btree ("end_time");--> statement-breakpoint
CREATE INDEX "promo_codes_vendor_id_idx" ON "promo_codes" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "promo_codes_is_active_idx" ON "promo_codes" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "promo_codes_expires_at_idx" ON "promo_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_order_user_uidx" ON "reviews" USING btree ("order_id","user_id");--> statement-breakpoint
CREATE INDEX "reviews_user_id_idx" ON "reviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reviews_vendor_id_idx" ON "reviews" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "reviews_rider_id_idx" ON "reviews" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "reviews_product_id_idx" ON "reviews" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "school_subs_user_route_uidx" ON "school_subscriptions" USING btree ("user_id","route_id") WHERE status != 'cancelled';--> statement-breakpoint
CREATE INDEX "school_subs_user_id_idx" ON "school_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "school_subs_route_id_idx" ON "school_subscriptions" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "school_subs_status_idx" ON "school_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ride_event_logs_ride_id_idx" ON "ride_event_logs" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "ride_event_logs_rider_id_idx" ON "ride_event_logs" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "rider_penalties_rider_id_idx" ON "rider_penalties" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "rider_penalties_type_idx" ON "rider_penalties" USING btree ("type");--> statement-breakpoint
CREATE INDEX "rider_penalties_created_at_idx" ON "rider_penalties" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ride_ratings_ride_id_uidx" ON "ride_ratings" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "ride_ratings_rider_id_idx" ON "ride_ratings" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "ride_ratings_customer_id_idx" ON "ride_ratings" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ride_notified_riders_ride_rider_uidx" ON "ride_notified_riders" USING btree ("ride_id","rider_id");--> statement-breakpoint
CREATE INDEX "ride_notified_riders_ride_id_idx" ON "ride_notified_riders" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "location_logs_user_ts_idx" ON "location_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "location_logs_user_idx" ON "location_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "location_logs_role_idx" ON "location_logs" USING btree ("role");--> statement-breakpoint
CREATE INDEX "location_logs_role_ts_idx" ON "location_logs" USING btree ("role","created_at");--> statement-breakpoint
CREATE INDEX "location_logs_lat_lng_idx" ON "location_logs" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "product_variants_product_id_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_variants_type_idx" ON "product_variants" USING btree ("type");--> statement-breakpoint
CREATE INDEX "product_variants_sku_idx" ON "product_variants" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "banners_is_active_idx" ON "banners" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "banners_placement_idx" ON "banners" USING btree ("placement");--> statement-breakpoint
CREATE INDEX "banners_sort_order_idx" ON "banners" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "user_interactions_user_id_idx" ON "user_interactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_interactions_product_id_idx" ON "user_interactions" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "user_interactions_type_idx" ON "user_interactions" USING btree ("interaction_type");--> statement-breakpoint
CREATE INDEX "user_interactions_created_at_idx" ON "user_interactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "push_sub_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_sub_role_idx" ON "push_subscriptions" USING btree ("role");--> statement-breakpoint
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_history_user_id_idx" ON "login_history" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_user_product_uidx" ON "wishlist" USING btree ("user_id","product_id");--> statement-breakpoint
CREATE INDEX "wishlist_user_id_idx" ON "wishlist" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "categories_type_idx" ON "categories" USING btree ("type");--> statement-breakpoint
CREATE INDEX "categories_parent_id_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "categories_sort_order_idx" ON "categories" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "categories_is_active_idx" ON "categories" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "location_history_user_id_idx" ON "location_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "location_history_created_at_idx" ON "location_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "location_history_user_created_idx" ON "location_history" USING btree ("user_id","created_at");