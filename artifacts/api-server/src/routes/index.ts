import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth/index.js";
import usersRouter from "./users.js";
import productsRouter from "./products.js";
import ordersRouter from "./orders.js";
import walletRouter from "./wallet.js";
import ridesRouter from "./rides/index.js";
import locationsRouter from "./locations.js";
import categoriesRouter from "./categories.js";
import pharmacyRouter from "./pharmacy.js";
import parcelRouter from "./parcel.js";
import notificationsRouter from "./notifications.js";
import addressesRouter from "./addresses.js";
import settingsRouter from "./settings.js";
import seedRouter from "./seed.js";
import adminRouter from "./admin.js";
import adminAuthV2Router from "./admin-auth-v2.js";
import platformConfigRouter from "./platform-config.js";
import riderRouter from "./rider/index.js";
import vendorRouter from "./vendor.js";
import paymentsRouter from "./payments.js";
import reviewsRouter from "./reviews.js";
import systemRouter from "./system.js";
import mapsRouter, { adminMapsRouter } from "./maps.js";
import schoolRouter, { adminSchoolRouter } from "./school.js";
import uploadsRouter from "./uploads.js";
import sosRouter from "./sos.js";
import recommendationsRouter from "./recommendations.js";
import bannersRouter from "./banners.js";
import variantsRouter from "./variants.js";
import pushRouter from "./push.js";
import kycRouter from "./kyc.js";
import wishlistRouter from "./wishlist.js";
import vanRouter from "./van.js";
import webhooksRouter from "./webhooks.js";
import deliveryEligibilityRouter from "./delivery-eligibility.js";
import popupsRouter from "./popups.js";
import promotionsRouter from "./promotions/index.js";
import supportChatRouter from "./support-chat.js";
import publicVendorsRouter from "./public-vendors.js";
import statsRouter from "./stats.js";
import metricsRouter from "./metrics.js";
import errorReportsRouter from "./error-reports.js";
import communicationRouter from "./communication.js";
import weatherConfigRouter from "./weather-config.js";
import deepLinksPublicRouter from "./deep-links-public.js";
import legalRouter from "./legal.js";
import docsRouter from "./docs.js";
import sentryWebhookRouter from "./sentry-webhook.js";
import cartRouter from "./cart.js";
import referralsRouter from "./referrals.js";
import loyaltyRouter from "./loyalty.js";
import { adminAuth } from "./admin-shared.js";
import { userApiLimiter } from "../middleware/rate-limit.js";

const router: IRouter = Router();

router.use("/health", healthRouter);

/**
 * Legacy customer-facing /api/auth router (OTP, login, refresh, 2FA, social
 * sign-in for AJKMart users). The admin SSoT lives entirely under
 * /api/admin/auth/* (admin-auth-v2). Set ADMIN_LEGACY_AUTH_DISABLED=1 to
 * fully unmount this router once all clients have migrated. Defaults to
 * mounted to keep the customer (ajkmart) app functional.
 */
if (process.env["ADMIN_LEGACY_AUTH_DISABLED"] !== "1") {
  router.use("/auth", authRouter);
}
router.use("/users", usersRouter);
router.use("/products", productsRouter);
router.use("/orders", userApiLimiter, ordersRouter);
router.use("/cart", userApiLimiter, cartRouter);
router.use("/wallet", userApiLimiter, walletRouter);
router.use("/rides", userApiLimiter, ridesRouter);
router.use("/locations", locationsRouter);
router.use("/categories", categoriesRouter);
router.use("/pharmacy-orders", pharmacyRouter);
router.use("/parcel-bookings", parcelRouter);
router.use("/notifications", notificationsRouter);
router.use("/addresses", addressesRouter);
router.use("/settings", settingsRouter);
router.use("/seed", seedRouter);
router.use("/admin/system", systemRouter);
// Sentry webhook is public (HMAC-verified) — must be mounted BEFORE adminRouter
// so it is NOT intercepted by adminAuth. The route is POST /admin/sentry-webhook.
router.use(sentryWebhookRouter);
// admin-auth-v2 owns the public /api/admin/auth/* surface (forgot-password,
// reset-password, reset-password/validate). Mount it BEFORE the legacy
// adminRouter so its public endpoints are not shadowed by adminRouter's
// blanket `adminAuth` middleware.
router.use("/admin", adminAuthV2Router);
router.use("/admin", adminRouter);
router.use("/platform-config", platformConfigRouter);
router.use("/rider", riderRouter);
router.use("/vendor", vendorRouter);
router.use("/payments", paymentsRouter);
router.use("/reviews", reviewsRouter);
router.use("/maps", mapsRouter);
/* /api/admin/maps/{test|usage|cache/clear} — dedicated admin maps router
   so admin clients using the /api/admin prefix reach the right handlers.
   These endpoints match the task's required contract exactly. */
router.use("/admin/maps", adminMapsRouter);
router.use("/school", schoolRouter);
router.use("/uploads", uploadsRouter);
router.use("/sos", sosRouter);
router.use("/recommendations", recommendationsRouter);
router.use("/banners", bannersRouter);
router.use("/variants", variantsRouter);
router.use("/push", pushRouter);
router.use("/kyc", kycRouter);
router.use("/wishlist", wishlistRouter);
router.use("/van", vanRouter);
router.use("/webhooks", webhooksRouter);
router.use("/delivery/eligibility", deliveryEligibilityRouter);
router.use("/popups", popupsRouter);
router.use("/promotions", promotionsRouter);
router.use("/admin/promotions", promotionsRouter);
router.use("/support-chat", supportChatRouter);
router.use("/vendors", publicVendorsRouter);
router.use("/stats", statsRouter);
router.use("/metrics", metricsRouter);
router.use("/error-reports", errorReportsRouter);
router.use("/admin/error-reports", errorReportsRouter);
router.use("/communication", communicationRouter);
router.use("/weather-config", weatherConfigRouter);
router.use("/dl", deepLinksPublicRouter);

/**
 * Legal / consent surface used by the admin "Consent & Terms Versions"
 * page. Mounted under both `/api/legal` (the contract documented in the
 * page header) and `/api/admin/legal` (the path the admin fetcher
 * actually targets, since `fetchAdmin` always prepends `/api/admin`).
 * Both mounts require admin auth — consent records are GDPR-sensitive
 * and the POST publishes new policy versions.
 */
router.use("/legal", adminAuth, legalRouter);
router.use("/admin/legal", adminAuth, legalRouter);

router.use("/docs", docsRouter);

router.use("/referrals", userApiLimiter, referralsRouter);
/* loyalty/redeem lives at POST /api/loyalty/redeem — separate from /users */
router.use("/loyalty", userApiLimiter, loyaltyRouter);
/* admin/school/subscriptions — paginated list + cancel */
router.use("/admin/school", adminSchoolRouter);

export default router;
