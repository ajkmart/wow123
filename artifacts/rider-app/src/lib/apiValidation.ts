import {
  createSchemaRegistry,
  type ValidationOptions,
  type SchemaEntry,
  VerifyOtpResponse,
  GetProfileResponse,
  GetOrdersResponse,
  GetOrderResponse,
  GetRideResponse,
  GetRideHistoryResponse,
  EstimateFareResponse,
  GetWalletResponse,
} from "@workspace/api-zod";

const ENTRIES: SchemaEntry[] = [
  { pattern: /\/auth\/verify-otp/,        schema: VerifyOtpResponse },
  { pattern: /\/auth\/verify-email-otp/,  schema: VerifyOtpResponse },
  { pattern: /\/rider\/me$/,              schema: GetProfileResponse },
  { pattern: /\/profile/,                schema: GetProfileResponse },
  { pattern: /\/orders\/[^/?]+$/,        schema: GetOrderResponse },
  { pattern: /\/orders/,                 schema: GetOrdersResponse },
  { pattern: /\/rides\/history/,         schema: GetRideHistoryResponse },
  { pattern: /\/rides\/[^/?]+$/,         schema: GetRideResponse },
  { pattern: /\/fare\/estimate/,         schema: EstimateFareResponse },
  { pattern: /\/wallet/,                 schema: GetWalletResponse },
];

/**
 * Build and return a response validator for the rider app.
 *
 * Pass the returned function to `initApiValidation()` exported from `api.ts`
 * so every successful `apiFetch` response is validated against its Zod schema.
 *
 * Behaviour by environment:
 *   development — throws `ApiValidationError` (surface the mismatch immediately)
 *   production  — `console.warn` only; raw data is returned so the UI still works
 */
export function createRiderValidator(
  onFailure?: ValidationOptions["onFailure"],
): (path: string, data: unknown) => void {
  return createSchemaRegistry(ENTRIES, { onFailure });
}
