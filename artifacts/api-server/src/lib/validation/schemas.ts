/**
 * Consolidated Zod validation schemas — single source of truth.
 *
 * All route handlers SHOULD import from here instead of defining
 * schemas inline.  Inline definitions are acceptable only for
 * highly route-specific shapes that have no reuse value.
 */

import { z } from "zod";

/* ── Phone number ──────────────────────────────────────────────────── */
export const PhoneSchema = z
  .string()
  .min(7, "Phone number is required")
  .max(20, "Phone number too long")
  .regex(/^[\d\s\-()+]{7,20}$/, "Phone must contain only digits, spaces, dashes, or parentheses");

/* ── Shared field helpers ──────────────────────────────────────────── */
const positiveAmount = z
  .union([z.number().positive(), z.string().min(1)])
  .transform((v) => parseFloat(String(v)))
  .refine((v) => !isNaN(v) && isFinite(v) && v > 0, "Amount must be a positive number");

/* ── User registration ─────────────────────────────────────────────── */
export const UserRegistrationSchema = z
  .object({
    phone: PhoneSchema,
    password: z.string().min(8, "Password must be at least 8 characters"),
    name: z.string().max(80).optional(),
    role: z.enum(["customer", "rider", "vendor"]).optional(),
    email: z.string().email().optional().or(z.literal("")),
    username: z
      .string()
      .min(3)
      .max(20)
      .regex(/^[a-z0-9_]+$/, "Username: lowercase letters, numbers, and underscores only")
      .optional(),
    cnic: z
      .string()
      .regex(/^\d{5}-\d{7}-\d{1}$/, "CNIC format must be XXXXX-XXXXXXX-X")
      .optional()
      .or(z.literal("")),
    nationalId: z.string().optional(),
    vehicleType: z.string().optional(),
    vehicleRegNo: z.string().optional(),
    drivingLicense: z.string().optional(),
    address: z.string().max(255).optional(),
    city: z.string().max(80).optional(),
    emergencyContact: z.string().optional(),
    vehiclePlate: z.string().optional(),
    vehiclePhoto: z.string().optional(),
    documents: z.string().optional(),
    businessName: z.string().max(120).optional(),
    businessType: z.string().optional(),
    storeAddress: z.string().max(255).optional(),
    ntn: z.string().optional(),
    storeName: z.string().max(120).optional(),
    captchaToken: z.string().optional(),
  })
  .strip();

/* ── User login ────────────────────────────────────────────────────── */
export const UserLoginSchema = z
  .object({
    identifier: z.string().min(3, "Phone, email, or username is required").optional(),
    username: z.string().min(3).optional(),
    password: z.string().min(1, "Password is required"),
    deviceFingerprint: z.string().max(512).optional(),
    role: z.enum(["customer", "rider", "vendor"]).optional(),
  })
  .strip()
  .refine((d) => d.identifier || d.username, {
    message: "Phone, email, or username is required",
    path: ["identifier"],
  });

/* ── OTP request / verify ──────────────────────────────────────────── */
export const SendOtpSchema = z
  .object({
    phone: PhoneSchema,
    role: z.enum(["customer", "rider", "vendor"]).optional(),
    deviceId: z.string().max(256).optional(),
    preferredChannel: z.enum(["whatsapp", "sms", "email"]).optional(),
    captchaToken: z.string().optional(),
  })
  .strip();

export const VerifyOtpSchema = z
  .object({
    phone: PhoneSchema,
    otp: z
      .string()
      .length(6, "OTP must be exactly 6 digits")
      .regex(/^\d{6}$/, "OTP must be 6 digits"),
    deviceFingerprint: z.string().max(512).optional(),
    deviceId: z.string().max(256).optional(),
    role: z.enum(["customer", "rider", "vendor"]).optional(),
  })
  .strip();

/* ── Order creation ────────────────────────────────────────────────── */
export const OrderCreateSchema = z
  .object({
    vendorId: z.string().min(1, "vendorId is required"),
    type: z.enum(["mart", "food"]).default("mart"),
    items: z
      .array(
        z.object({
          productId: z.string().optional(),
          name: z.string().min(1),
          qty: z.number().int().positive(),
          price: z.number().positive(),
          variantId: z.string().optional(),
        })
      )
      .min(1, "At least one item is required"),
    total: positiveAmount,
    deliveryAddress: z.string().min(1, "deliveryAddress is required").max(500),
    paymentMethod: z.enum(["cod", "wallet", "jazzcash", "easypaisa"]).default("cod"),
    note: z.string().max(500).optional(),
    promoCode: z.string().max(50).optional(),
  })
  .strip();

/* ── Wallet transaction ────────────────────────────────────────────── */
export const WalletTransactionSchema = z
  .object({
    amount: positiveAmount,
    paymentMethod: z
      .string()
      .min(1, "paymentMethod is required")
      .regex(/^[a-z_]+$/, "paymentMethod must be a lowercase identifier"),
    transactionId: z.string().min(1, "transactionId is required"),
    idempotencyKey: z.string().uuid("idempotencyKey must be a UUID"),
    accountNumber: z.string().optional(),
    note: z.string().max(200).optional(),
  })
  .strip();

/* ── Wallet send ───────────────────────────────────────────────────── */
export const WalletSendSchema = z
  .object({
    receiverPhone: z.string().optional(),
    ajkId: z.string().optional(),
    amount: positiveAmount,
    note: z.string().max(200).optional(),
  })
  .strip()
  .refine((d) => d.receiverPhone || d.ajkId, {
    message: "receiverPhone or ajkId is required",
  });

/* ── Location update ───────────────────────────────────────────────── */
export const LocationUpdateSchema = z
  .object({
    latitude: z
      .number()
      .min(-90, "Latitude must be between -90 and 90")
      .max(90, "Latitude must be between -90 and 90"),
    longitude: z
      .number()
      .min(-180, "Longitude must be between -180 and 180")
      .max(180, "Longitude must be between -180 and 180"),
    accuracy: z
      .number()
      .min(0, "Accuracy must be non-negative")
      .max(500, "Accuracy must not exceed 500 meters")
      .optional(),
    timestamp: z
      .number()
      .refine(
        (v) => v <= Date.now() + 5_000,
        "Timestamp cannot be more than 5 seconds in the future"
      )
      .optional(),
    heading: z.number().min(0).max(360).optional(),
    speed: z.number().min(0).optional(),
    batteryLevel: z.number().min(0).max(100).optional(),
  })
  .strip();

/* ── Product creation ──────────────────────────────────────────────── */
export const ProductCreateSchema = z
  .object({
    name: z.string().min(1, "Product name is required").max(200),
    description: z.string().max(2000).optional(),
    price: positiveAmount,
    categoryId: z.string().min(1, "categoryId is required"),
    stock: z.number().int().min(0, "Stock cannot be negative").default(0),
    unit: z.string().max(20).optional(),
    images: z.array(z.string().url()).max(10).optional(),
    isAvailable: z.boolean().default(true),
    discountPercent: z.number().min(0).max(100).optional(),
    minOrderQty: z.number().int().positive().optional(),
    maxOrderQty: z.number().int().positive().optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
  })
  .strip();

/* ── Chat message ──────────────────────────────────────────────────── */
export const ChatMessageSchema = z
  .object({
    content: z
      .string()
      .min(1, "Message cannot be empty")
      .max(2000, "Message cannot exceed 2000 characters")
      .transform((s) => s.trim()),
    type: z.enum(["text", "image", "audio", "location"]).default("text"),
    replyToId: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strip();

/* ── Cursor pagination query ───────────────────────────────────────── */
export const CursorPaginationSchema = z
  .object({
    limit: z
      .string()
      .optional()
      .transform((v) => Math.min(parseInt(v ?? "20", 10) || 20, 100)),
    after: z.string().optional(),
  })
  .strip();
