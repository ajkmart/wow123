ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "wallet_pin_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "wallet_pin_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "wallet_pin_locked_until" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "wallet_hidden" boolean DEFAULT false NOT NULL;