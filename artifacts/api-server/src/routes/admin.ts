import { Router, type IRouter } from "express";
import { adminAuth } from "./admin-shared.js";
import { csrfProtection } from "../middleware/admin-auth.js";
import authRoutes from "./admin/system/auth.js";
import usersRoutes from "./admin/system/users.js";
import rbacRoutes from "./admin/system/rbac.js";
import ordersRoutes from "./admin/orders.js";
import ridesRoutes from "./admin/fleet/rides.js";
import financeRoutes from "./admin/finance/wallets.js";
import contentRoutes from "./admin/content.js";
import systemRoutes from "./admin/system.js";
import serviceZonesRoutes from "./admin/fleet/zones.js";
import deliveryAccessRoutes from "./admin/delivery-access.js";
import conditionsRoutes from "./admin/conditions.js";
import popupsRoutes from "./admin/popups.js";
import supportChatAdminRoutes from "./admin/support-chat.js";
import faqAdminRoutes from "./admin/faq.js";
import communicationAdminRoutes from "./admin/communication.js";
import loyaltyAdminRoutes from "./admin/loyalty.js";
import chatMonitorRoutes from "./admin/chat-monitor.js";
import wishlistAnalyticsRoutes from "./admin/wishlist-analytics.js";
import searchAnalyticsRoutes from "./admin/search-analytics.js";
import qrCodesRoutes from "./admin/qr-codes.js";
import weatherConfigRoutes from "./admin/weather-config.js";
import userAddressesRoutes from "./admin/user-addresses.js";
import experimentsRoutes from "./admin/experiments.js";
import whatsappDeliveryRoutes from "./admin/whatsapp-delivery.js";
import businessRulesRoutes from "./admin/business-rules.js";
import webhookRegistrationsRoutes from "./admin/webhook-registrations.js";
import deepLinksRoutes from "./admin/deep-links.js";
import releaseNotesRoutes from "./admin/release-notes.js";
import launchRoutes, { ensureLaunchData } from "./admin/launch.js";
import otpRoutes from "./admin/otp.js";
import smsGatewaysRoutes from "./admin/sms-gateways.js";
import whitelistRoutes from "./admin/whitelist.js";
import inventorySettingsRoutes from "./admin/inventory-settings.js";
import securityRoutes from "./admin/security.js";
import broadcastsRoutes from "./admin/broadcasts.js";

export {
  DEFAULT_PLATFORM_SETTINGS,
  ensureAuthMethodColumn,
  ensureRideBidsMigration,
  ensureOrdersGpsColumns,
  ensurePromotionsTables,
  ensureSupportMessagesTable,
  ensureFaqsTable,
  ensureCommunicationTables,
  ensureVendorLocationColumns,
  ensureVanServiceUpgrade,
  ensureWalletP2PColumns,
  ensureComplianceTables,
  getPlatformSettings,
  getCachedSettings,
  getAdminSecret,
  adminAuth,
  DEFAULT_RIDE_SERVICES,
  ensureDefaultRideServices,
  ensureDefaultLocations,
  type AdminRequest,
} from "./admin-shared.js";

export { ensureLaunchData };

const router: IRouter = Router();

router.use(authRoutes);

router.use(adminAuth);
router.use(csrfProtection);

router.use(usersRoutes);
router.use(ordersRoutes);
router.use(ridesRoutes);
router.use(financeRoutes);
router.use(contentRoutes);
router.use(systemRoutes);
// New RBAC management routes (Task #2). Mounted explicitly because the legacy
// systemRoutes monolith above predates the admin/system/* sub-router split.
router.use("/system/rbac", rbacRoutes);
router.use("/service-zones", serviceZonesRoutes);
router.use(deliveryAccessRoutes);
router.use(conditionsRoutes);
router.use(popupsRoutes);
router.use("/support-chat", supportChatAdminRoutes);
router.use("/faqs", faqAdminRoutes);
router.use(communicationAdminRoutes);
router.use(loyaltyAdminRoutes);
router.use("/chat-monitor", chatMonitorRoutes);
router.use(wishlistAnalyticsRoutes);
router.use(searchAnalyticsRoutes);
router.use("/qr-codes", qrCodesRoutes);
router.use("/weather-config", weatherConfigRoutes);
router.use(userAddressesRoutes);
router.use(experimentsRoutes);
router.use("/whatsapp", whatsappDeliveryRoutes);
router.use("/business-rules", businessRulesRoutes);
router.use(webhookRegistrationsRoutes);
router.use(deepLinksRoutes);
router.use(releaseNotesRoutes);
router.use("/launch", launchRoutes);
router.use(otpRoutes);
router.use("/sms-gateways", smsGatewaysRoutes);
router.use("/whitelist", whitelistRoutes);
router.use(inventorySettingsRoutes);
router.use(securityRoutes);
router.use(broadcastsRoutes);

export default router;
