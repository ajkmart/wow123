import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { unwrapApiResponse } from "../utils/api";
import { setDefaultMapCenter } from "../hooks/useMaps";

const API_DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";
const CACHE_MS = 30_000;

export interface PlatformConfig {
  appStatus: "active" | "maintenance" | "limited";
  features: {
    mart: boolean;
    food: boolean;
    rides: boolean;
    pharmacy: boolean;
    parcel: boolean;
    van: boolean;
    wallet: boolean;
    referral: boolean;
    newUsers: boolean;
    chat: boolean;
    liveTracking: boolean;
    reviews: boolean;
    sos: boolean;
    weather: boolean;
    school: boolean;
  };
  content: {
    trackerBannerEnabled: boolean;
    trackerBannerPosition: "top" | "bottom";
    showBanner: boolean;
    banner: string;
    announcement: string;
    maintenanceMsg: string;
    supportMsg: string;
    vendorNotice: string;
    riderNotice: string;
    tncUrl: string;
    privacyUrl: string;
    refundPolicyUrl: string;
    faqUrl: string;
    aboutUrl: string;
  };
  platform: {
    appName: string;
    appTagline: string;
    appVersion: string;
    supportPhone: string;
    supportEmail: string;
    supportHours: string;
    businessAddress: string;
    socialFacebook: string;
    socialInstagram: string;
  };
  orderRules: {
    minOrderAmount: number;
    maxCodAmount: number;
    maxCartValue: number;
    cancelWindowMin: number;
    autoCancelMin: number;
    refundDays: number;
    preptimeMin: number;
    ratingWindowHours: number;
    scheduleEnabled: boolean;
    serviceableCities: string[];
  };
  deliveryFee: {
    mart: number;
    food: number;
    pharmacy: number;
    parcel: number;
    parcelPerKg: number;
    freeEnabled: boolean;
    freeDeliveryAbove: number;
  };
  parcelFares: Record<string, number>;
  rides: {
    bikeBaseFare: number;
    bikePerKm: number;
    bikeMinFare: number;
    carBaseFare: number;
    carPerKm: number;
    carMinFare: number;
    surgeEnabled: boolean;
    surgeMultiplier: number;
    cancellationFee: number;
    cancelGraceSec: number;
    bargainingEnabled: boolean;
    bargainingMinPct: number;
    bargainingMaxRounds: number;
    riderEarningPct: number;
  };
  finance: {
    gstEnabled: boolean;
    gstPct: number;
    cashbackEnabled: boolean;
    cashbackPct: number;
    cashbackMaxRs: number;
    invoiceEnabled: boolean;
    platformCommissionPct: number;
    vendorCommissionPct: number;
    riderEarningPct: number;
    minVendorPayout: number;
    minRiderPayout: number;
    vendorSettleDays: number;
    referralBonus: number;
  };
  customer: {
    walletMax: number;
    minTopup: number;
    maxTopup: number;
    minWithdrawal: number;
    maxWithdrawal: number;
    minTransfer: number;
    maxTransfer: number;
    dailyLimit: number;
    p2pDailyLimit: number;
    withdrawalProcessingDays: number | null;
    kycRequired: boolean;
    topupMethods: string;
    referralEnabled: boolean;
    referralBonus: number;
    loyaltyEnabled: boolean;
    loyaltyPtsPerRs100: number;
    loyaltyMin: number;
    maxOrdersDay: number;
    signupBonus: number;
    p2pEnabled: boolean;
    p2pFeePct: number;
    walletCashbackPct: number;
    walletCashbackOrders: boolean;
    walletCashbackRides: boolean;
    walletCashbackPharm: boolean;
  };
  integrations: {
    pushNotif: boolean;
    analytics: boolean;
    analyticsPlatform: string;
    analyticsTrackingId: string;
    analyticsDebug: boolean;
    sentry: boolean;
    sentryDsn: string;
    sentryEnvironment: string;
    sentrySampleRate: number;
    sentryTracesSampleRate: number;
    maps: boolean;
    mapsAutocomplete: boolean;
    mapsGeocoding: boolean;
    mapsDistanceMatrix: boolean;
    whatsapp: boolean;
    sms: boolean;
    email: boolean;
  };
  security: {
    orderGpsCaptureEnabled: boolean;
    gpsMismatchThresholdM: number;
  };
  payment: {
    jazzcashProofRequired: boolean;
    paymentReceiptRequired: boolean;
    currency: string;
  };
  profile: {
    showSavedAddresses: boolean;
  };
  auth: {
    phoneOtpEnabled: boolean | Record<string, boolean>;
    emailOtpEnabled: boolean | Record<string, boolean>;
    usernamePasswordEnabled: boolean | Record<string, boolean>;
    googleEnabled: boolean | Record<string, boolean>;
    facebookEnabled: boolean | Record<string, boolean>;
    emailRegisterEnabled: boolean | Record<string, boolean>;
    biometricEnabled: boolean | Record<string, boolean>;
    captchaEnabled: boolean;
    twoFactorEnabled: boolean | Record<string, boolean>;
    magicLinkEnabled: boolean | Record<string, boolean>;
    captchaSiteKey: string;
    googleClientId: string;
    facebookAppId: string;
    authMode: "OTP" | "EMAIL" | "FIREBASE" | "HYBRID";
    firebaseEnabled: boolean;
  };
  language: {
    defaultLanguage: string;
    enabledLanguages: string[];
  };
  cities: string[];
  network: {
    apiTimeoutMs: number;
    maxRetryAttempts: number;
    retryBackoffBaseMs: number;
    riderGpsQueueMax: number;
    riderDismissedRequestTtlSec: number;
  };
  branding?: {
    colorMart?: string;
    colorFood?: string;
    colorRides?: string;
    colorPharmacy?: string;
    colorParcel?: string;
    colorVan?: string;
    mapCenterLat?: number;
    mapCenterLng?: number;
    mapCenterLabel?: string;
  };
  regional?: {
    currencySymbol?: string;
    phoneFormat?: string;
    phoneHint?: string;
    timezone?: string;
    countryCode?: string;
  };
  serviceContent?: {
    mart?: { label?: string; description?: string; heroTitle?: string; heroSubtitle?: string; cta?: string };
    food?: { label?: string; description?: string; heroTitle?: string; heroSubtitle?: string; cta?: string };
    rides?: { label?: string; description?: string; heroTitle?: string; heroSubtitle?: string; cta?: string };
    pharmacy?: { label?: string; description?: string; heroTitle?: string; heroSubtitle?: string; cta?: string };
    parcel?: { label?: string; description?: string; heroTitle?: string; heroSubtitle?: string; cta?: string };
    van?: { label?: string; description?: string; heroTitle?: string; heroSubtitle?: string; cta?: string };
  };
  compliance: {
    minAppVersion: string;
    termsVersion:  string;
    appStoreUrl:   string;
    playStoreUrl:  string;
  };
  releaseNotes: {
    id:          string;
    version:     string;
    releaseDate: string;
    notes:       string[];
    sortOrder:   number;
  }[];
  uploads?: {
    maxImageMb?: number;
    maxVideoMb?: number;
    maxVideoDurationSec?: number;
    allowedImageFormats?: string[];
    allowedVideoFormats?: string[];
  };
  pagination?: {
    productsDefault?: number;
    trendingLimit?: number;
    flashDealsLimit?: number;
  };
  onboarding?: {
    slides?: {
      id: string;
      title: string;
      subtitle?: string;
      image?: string;
      backgroundColor?: string;
    }[];
  };
  supportHoursSchedule?: {
    [day: string]: { open: string; close: string; closed?: boolean };
  } | null;
}

const DEFAULT: PlatformConfig = {
  appStatus: "active",
  features: { mart: true, food: true, rides: true, pharmacy: true, parcel: true, van: true, wallet: true, referral: true, newUsers: true, chat: false, liveTracking: true, reviews: true, sos: true, weather: true, school: false },
  content: {
    trackerBannerEnabled: true,
    trackerBannerPosition: "top" as const,
    showBanner:      true,
    banner:          "Free delivery on your first order! 🎉",
    announcement:    "",
    maintenanceMsg:  "We're performing scheduled maintenance. Back soon!",
    supportMsg:      "Need help? Chat with us!",
    vendorNotice:    "",
    riderNotice:     "",
    tncUrl:          "",
    privacyUrl:      "",
    refundPolicyUrl: "",
    faqUrl:          "",
    aboutUrl:        "",
  },
  platform: {
    appName: "AJKMart",
    appTagline: "Your super app for everything",
    appVersion: "1.0.0",
    supportPhone: "03005000000",
    supportEmail: "",
    supportHours: "Mon–Sat, 8AM–10PM",
    businessAddress: "Muzaffarabad, AJK, Pakistan",
    socialFacebook: "",
    socialInstagram: "",
  },
  orderRules: {
    minOrderAmount:    100,
    maxCodAmount:      5000,
    maxCartValue:      50000,
    cancelWindowMin:   5,
    autoCancelMin:     15,
    refundDays:        3,
    preptimeMin:       15,
    ratingWindowHours: 48,
    scheduleEnabled:   false,
    serviceableCities: [] as string[],
  },
  deliveryFee: {
    mart: 80, food: 60, pharmacy: 50, parcel: 100,
    parcelPerKg: 40, freeEnabled: true, freeDeliveryAbove: 1000,
  },
  parcelFares: {} as Record<string, number>,
  rides: {
    bikeBaseFare: 15, bikePerKm: 8, bikeMinFare: 50,
    carBaseFare: 25, carPerKm: 12, carMinFare: 80,
    surgeEnabled: false, surgeMultiplier: 1.5, cancellationFee: 30, cancelGraceSec: 180,
    bargainingEnabled: true, bargainingMinPct: 70, bargainingMaxRounds: 3,
    riderEarningPct: 80,
  },
  finance: {
    gstEnabled: true, gstPct: 17, cashbackEnabled: false, cashbackPct: 2, cashbackMaxRs: 100,
    invoiceEnabled: false, platformCommissionPct: 10, vendorCommissionPct: 15, riderEarningPct: 80,
    minVendorPayout: 500, minRiderPayout: 500, vendorSettleDays: 7, referralBonus: 100,
  },
  customer: {
    walletMax: 50000, minTopup: 100, maxTopup: 25000, minWithdrawal: 200, maxWithdrawal: 10000, minTransfer: 200, maxTransfer: 10000,
    dailyLimit: 20000, p2pDailyLimit: 10000, withdrawalProcessingDays: null, kycRequired: false,
    topupMethods: "jazzcash,easypaisa,bank",
    referralEnabled: true, referralBonus: 100,
    loyaltyEnabled: true, loyaltyPtsPerRs100: 5, loyaltyMin: 10,
    maxOrdersDay: 10, signupBonus: 0, p2pEnabled: true, p2pFeePct: 0,
    walletCashbackPct: 0, walletCashbackOrders: true, walletCashbackRides: false, walletCashbackPharm: false,
  },
  regional: {
    currencySymbol: "Rs.",
  },
  payment: {
    jazzcashProofRequired: false,
    paymentReceiptRequired: false,
    currency: "PKR",
  },
  security: {
    orderGpsCaptureEnabled: false,
    gpsMismatchThresholdM: 500,
  },
  profile: {
    showSavedAddresses: true,
  },
  integrations: {
    pushNotif: false, analytics: false, analyticsPlatform: "ga4", analyticsTrackingId: "", analyticsDebug: false,
    sentry: false, sentryDsn: "", sentryEnvironment: "production", sentrySampleRate: 1.0, sentryTracesSampleRate: 0.1,
    maps: false, mapsAutocomplete: true, mapsGeocoding: true, mapsDistanceMatrix: true,
    whatsapp: false, sms: false, email: false,
  },
  auth: {
    phoneOtpEnabled: true,
    emailOtpEnabled: true,
    usernamePasswordEnabled: true,
    googleEnabled: false,
    facebookEnabled: false,
    emailRegisterEnabled: true,
    biometricEnabled: false,
    captchaEnabled: false,
    twoFactorEnabled: false,
    magicLinkEnabled: false,
    captchaSiteKey: "",
    googleClientId: "",
    facebookAppId: "",
    authMode: "OTP" as const,
    firebaseEnabled: false,
  },
  language: {
    defaultLanguage: "en",
    enabledLanguages: ["en", "ur", "roman", "en_roman", "en_ur"],
  },
  cities: [] as string[],
  network: {
    apiTimeoutMs: 30_000,
    maxRetryAttempts: 3,
    retryBackoffBaseMs: 1_000,
    riderGpsQueueMax: 500,
    riderDismissedRequestTtlSec: 90,
  },
  compliance: {
    minAppVersion: "1.0.0",
    termsVersion:  "1.0",
    appStoreUrl:   "",
    playStoreUrl:  "",
  },
  releaseNotes: [],
};

function isMethodEnabled(val: boolean | Record<string, boolean> | undefined | null, role = "customer"): boolean {
  if (val === undefined || val === null) return false;
  if (typeof val === "boolean") return val;
  if (typeof val !== "object") return false;
  return val[role] ?? false;
}

export { isMethodEnabled };

interface Ctx {
  config: PlatformConfig;
  loading: boolean;
  fetching: boolean;
  refresh: () => void;
}

const PlatformConfigContext = createContext<Ctx>({
  config: DEFAULT,
  loading: false,
  fetching: false,
  refresh: () => {},
});

let _cached: PlatformConfig | null = null;
let _cachedAt = 0;

export function PlatformConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<PlatformConfig>(_cached ?? DEFAULT);
  const [fetching, setFetching] = useState(false);
  const fetchingRef = useRef(false);

  const fetchConfig = useCallback(async (force = false) => {
    if (fetchingRef.current) return;
    const now = Date.now();
    if (!force && _cached && now - _cachedAt < CACHE_MS) {
      setConfig(_cached);
      return;
    }
    fetchingRef.current = true;
    setFetching(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      let res: Response;
      try {
        res = await fetch(`https://${API_DOMAIN}/api/platform-config`, { cache: "no-store", signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!res.ok) throw new Error("config fetch failed");
      interface RawConfigSection { [key: string]: any }
      interface RawPlatformConfigResponse {
        platform?: RawConfigSection;
        features?: RawConfigSection;
        content?: RawConfigSection;
        orderRules?: RawConfigSection;
        deliveryFee?: RawConfigSection;
        parcelFares?: Record<string, number>;
        rides?: RawConfigSection;
        finance?: RawConfigSection;
        customer?: RawConfigSection;
        payment?: RawConfigSection;
        security?: RawConfigSection;
        profile?: RawConfigSection;
        integrations?: RawConfigSection;
        auth?: RawConfigSection;
        language?: { defaultLanguage?: string; enabledLanguages?: string[] };
        cities?: unknown[];
        network?: RawConfigSection;
        branding?: RawConfigSection;
        regional?: RawConfigSection;
        serviceContent?: RawConfigSection;
        compliance?: RawConfigSection;
        releaseNotes?: unknown[];
        uploads?: RawConfigSection;
        pagination?: RawConfigSection;
        onboarding?: RawConfigSection;
        supportHoursSchedule?: RawConfigSection | null;
        currencyCode?: string;
        currencySymbol?: string;
      }
      const raw = unwrapApiResponse(await res.json()) as RawPlatformConfigResponse;
      const parsed: PlatformConfig = {
        appStatus: raw.platform?.appStatus === "maintenance"
          ? "maintenance"
          : raw.platform?.appStatus === "limited"
          ? "limited"
          : "active",
        features: {
          mart:         raw.features?.mart         !== false,
          food:         raw.features?.food         !== false,
          rides:        raw.features?.rides        !== false,
          pharmacy:     raw.features?.pharmacy     !== false,
          parcel:       raw.features?.parcel       !== false,
          van:          raw.features?.van          !== false,
          wallet:       raw.features?.wallet       !== false,
          referral:     raw.features?.referral     !== false,
          newUsers:     raw.features?.newUsers     !== false,
          chat:         raw.features?.chat         === true,
          liveTracking: raw.features?.liveTracking !== false,
          reviews:      raw.features?.reviews      !== false,
          sos:          raw.features?.sos          !== false,
          weather:      raw.features?.weather      !== false,
          school:       raw.features?.school       === true,
        },
        content: {
          trackerBannerEnabled: raw.content?.trackerBannerEnabled ?? true,
          trackerBannerPosition: raw.content?.trackerBannerPosition ?? "top",
          showBanner:      raw.content?.showBanner      ?? true,
          banner:          raw.content?.banner          ?? DEFAULT.content.banner,
          announcement:    raw.content?.announcement    ?? "",
          maintenanceMsg:  raw.content?.maintenanceMsg  ?? DEFAULT.content.maintenanceMsg,
          supportMsg:      raw.content?.supportMsg      ?? DEFAULT.content.supportMsg,
          vendorNotice:    raw.content?.vendorNotice    ?? "",
          riderNotice:     raw.content?.riderNotice     ?? "",
          tncUrl:          raw.content?.tncUrl          ?? "",
          privacyUrl:      raw.content?.privacyUrl      ?? "",
          refundPolicyUrl: raw.content?.refundPolicyUrl ?? "",
          faqUrl:          raw.content?.faqUrl          ?? "",
          aboutUrl:        raw.content?.aboutUrl        ?? "",
        },
        platform: {
          appName:         raw.platform?.appName         ?? DEFAULT.platform.appName,
          appTagline:      raw.platform?.appTagline      ?? DEFAULT.platform.appTagline,
          appVersion:      raw.platform?.appVersion      ?? DEFAULT.platform.appVersion,
          supportPhone:    raw.platform?.supportPhone    ?? DEFAULT.platform.supportPhone,
          supportEmail:    raw.platform?.supportEmail    ?? "",
          supportHours:    raw.platform?.supportHours    ?? DEFAULT.platform.supportHours,
          businessAddress: raw.platform?.businessAddress ?? DEFAULT.platform.businessAddress,
          socialFacebook:  raw.platform?.socialFacebook  ?? "",
          socialInstagram: raw.platform?.socialInstagram ?? "",
        },
        orderRules: {
          minOrderAmount:    raw.orderRules?.minOrderAmount    ?? DEFAULT.orderRules.minOrderAmount,
          maxCodAmount:      raw.orderRules?.maxCodAmount      ?? DEFAULT.orderRules.maxCodAmount,
          maxCartValue:      raw.orderRules?.maxCartValue      ?? DEFAULT.orderRules.maxCartValue,
          cancelWindowMin:   raw.orderRules?.cancelWindowMin   ?? DEFAULT.orderRules.cancelWindowMin,
          autoCancelMin:     raw.orderRules?.autoCancelMin     ?? DEFAULT.orderRules.autoCancelMin,
          refundDays:        raw.orderRules?.refundDays        ?? DEFAULT.orderRules.refundDays,
          preptimeMin:       raw.orderRules?.preptimeMin       ?? DEFAULT.orderRules.preptimeMin,
          ratingWindowHours: raw.orderRules?.ratingWindowHours ?? DEFAULT.orderRules.ratingWindowHours,
          scheduleEnabled:   raw.orderRules?.scheduleEnabled   ?? DEFAULT.orderRules.scheduleEnabled,
          serviceableCities: Array.isArray(raw.orderRules?.serviceableCities) ? raw.orderRules.serviceableCities : [],
        },
        deliveryFee: {
          mart:             raw.deliveryFee?.mart              ?? DEFAULT.deliveryFee.mart,
          food:             raw.deliveryFee?.food              ?? DEFAULT.deliveryFee.food,
          pharmacy:         raw.deliveryFee?.pharmacy          ?? DEFAULT.deliveryFee.pharmacy,
          parcel:           raw.deliveryFee?.parcel            ?? DEFAULT.deliveryFee.parcel,
          parcelPerKg:      raw.deliveryFee?.parcelPerKg       ?? DEFAULT.deliveryFee.parcelPerKg,
          freeEnabled:      raw.deliveryFee?.freeEnabled       ?? DEFAULT.deliveryFee.freeEnabled,
          freeDeliveryAbove: raw.deliveryFee?.freeDeliveryAbove ?? raw.platform?.freeDeliveryAbove ?? DEFAULT.deliveryFee.freeDeliveryAbove,
        },
        parcelFares: (raw.parcelFares && typeof raw.parcelFares === "object" && !Array.isArray(raw.parcelFares))
          ? raw.parcelFares as Record<string, number>
          : DEFAULT.parcelFares,
        rides: {
          bikeBaseFare:    raw.rides?.bikeBaseFare    ?? DEFAULT.rides.bikeBaseFare,
          bikePerKm:       raw.rides?.bikePerKm       ?? DEFAULT.rides.bikePerKm,
          bikeMinFare:     raw.rides?.bikeMinFare     ?? DEFAULT.rides.bikeMinFare,
          carBaseFare:     raw.rides?.carBaseFare     ?? DEFAULT.rides.carBaseFare,
          carPerKm:        raw.rides?.carPerKm        ?? DEFAULT.rides.carPerKm,
          carMinFare:      raw.rides?.carMinFare      ?? DEFAULT.rides.carMinFare,
          surgeEnabled:        raw.rides?.surgeEnabled        ?? DEFAULT.rides.surgeEnabled,
          surgeMultiplier:     raw.rides?.surgeMultiplier     ?? DEFAULT.rides.surgeMultiplier,
          cancellationFee:     raw.rides?.cancellationFee     ?? DEFAULT.rides.cancellationFee,
          cancelGraceSec:      raw.rides?.cancelGraceSec      ?? DEFAULT.rides.cancelGraceSec,
          bargainingEnabled:   raw.rides?.bargainingEnabled   ?? DEFAULT.rides.bargainingEnabled,
          bargainingMinPct:    raw.rides?.bargainingMinPct    ?? DEFAULT.rides.bargainingMinPct,
          bargainingMaxRounds: raw.rides?.bargainingMaxRounds ?? DEFAULT.rides.bargainingMaxRounds,
          riderEarningPct:     raw.rides?.riderEarningPct     ?? DEFAULT.rides.riderEarningPct,
        },
        finance: {
          gstEnabled:           raw.finance?.gstEnabled           ?? DEFAULT.finance.gstEnabled,
          gstPct:               raw.finance?.gstPct               ?? DEFAULT.finance.gstPct,
          cashbackEnabled:      raw.finance?.cashbackEnabled      ?? DEFAULT.finance.cashbackEnabled,
          cashbackPct:          raw.finance?.cashbackPct          ?? DEFAULT.finance.cashbackPct,
          cashbackMaxRs:        raw.finance?.cashbackMaxRs        ?? DEFAULT.finance.cashbackMaxRs,
          invoiceEnabled:       raw.finance?.invoiceEnabled       ?? DEFAULT.finance.invoiceEnabled,
          platformCommissionPct:raw.finance?.platformCommissionPct?? DEFAULT.finance.platformCommissionPct,
          vendorCommissionPct:  raw.finance?.vendorCommissionPct  ?? DEFAULT.finance.vendorCommissionPct,
          riderEarningPct:      raw.finance?.riderEarningPct      ?? DEFAULT.finance.riderEarningPct,
          minVendorPayout:      raw.finance?.minVendorPayout      ?? DEFAULT.finance.minVendorPayout,
          minRiderPayout:       raw.finance?.minRiderPayout       ?? DEFAULT.finance.minRiderPayout,
          vendorSettleDays:     raw.finance?.vendorSettleDays     ?? DEFAULT.finance.vendorSettleDays,
          referralBonus:        raw.finance?.referralBonus        ?? DEFAULT.finance.referralBonus,
        },
        customer: {
          walletMax:                raw.customer?.walletMax                ?? DEFAULT.customer.walletMax,
          minTopup:                 raw.customer?.minTopup                 ?? DEFAULT.customer.minTopup,
          maxTopup:                 raw.customer?.maxTopup                 ?? DEFAULT.customer.maxTopup,
          minWithdrawal:            raw.customer?.minWithdrawal            ?? DEFAULT.customer.minWithdrawal,
          maxWithdrawal:            raw.customer?.maxWithdrawal            ?? DEFAULT.customer.maxWithdrawal,
          minTransfer:              raw.customer?.minTransfer              ?? DEFAULT.customer.minTransfer,
          maxTransfer:              raw.customer?.maxTransfer              ?? DEFAULT.customer.maxTransfer,
          dailyLimit:               raw.customer?.dailyLimit               ?? DEFAULT.customer.dailyLimit,
          p2pDailyLimit:            raw.customer?.p2pDailyLimit            ?? DEFAULT.customer.p2pDailyLimit,
          withdrawalProcessingDays: raw.customer?.withdrawalProcessingDays ?? DEFAULT.customer.withdrawalProcessingDays,
          kycRequired:              raw.customer?.kycRequired              ?? DEFAULT.customer.kycRequired,
          topupMethods:             raw.customer?.topupMethods             ?? DEFAULT.customer.topupMethods,
          referralEnabled:          raw.customer?.referralEnabled          ?? DEFAULT.customer.referralEnabled,
          referralBonus:            raw.customer?.referralBonus            ?? DEFAULT.customer.referralBonus,
          loyaltyEnabled:           raw.customer?.loyaltyEnabled           ?? DEFAULT.customer.loyaltyEnabled,
          loyaltyPtsPerRs100:       raw.customer?.loyaltyPtsPerRs100       ?? DEFAULT.customer.loyaltyPtsPerRs100,
          loyaltyMin:               raw.customer?.loyaltyMinPoints         ?? raw.customer?.loyaltyMin ?? DEFAULT.customer.loyaltyMin,
          maxOrdersDay:             raw.customer?.maxOrdersDay             ?? DEFAULT.customer.maxOrdersDay,
          signupBonus:              raw.customer?.signupBonus              ?? DEFAULT.customer.signupBonus,
          p2pEnabled:               raw.customer?.p2pEnabled               ?? DEFAULT.customer.p2pEnabled,
          p2pFeePct:                raw.customer?.p2pFeePct                ?? DEFAULT.customer.p2pFeePct,
          walletCashbackPct:        raw.customer?.walletCashbackPct        ?? DEFAULT.customer.walletCashbackPct,
          walletCashbackOrders:     raw.customer?.walletCashbackOrders     ?? DEFAULT.customer.walletCashbackOrders,
          walletCashbackRides:      raw.customer?.walletCashbackRides      ?? DEFAULT.customer.walletCashbackRides,
          walletCashbackPharm:      raw.customer?.walletCashbackPharm      ?? DEFAULT.customer.walletCashbackPharm,
        },
        // NOTE: full `regional` object (including phoneFormat, timezone, etc.)
        // is built below at the bottom of the parsed object so we don't override
        // it here. We DO NOT emit a partial `regional` here because that would
        // create a duplicate key.
        payment: {
          jazzcashProofRequired:  raw.payment?.jazzcashProofRequired  ?? DEFAULT.payment.jazzcashProofRequired,
          paymentReceiptRequired: raw.payment?.paymentReceiptRequired ?? DEFAULT.payment.paymentReceiptRequired,
          currency: raw.payment?.currency ?? raw.currencyCode ?? DEFAULT.payment.currency,
        },
        security: {
          orderGpsCaptureEnabled: raw.security?.orderGpsCaptureEnabled ?? DEFAULT.security.orderGpsCaptureEnabled,
          gpsMismatchThresholdM:  raw.security?.gpsMismatchThresholdM  ?? DEFAULT.security.gpsMismatchThresholdM,
        },
        profile: {
          showSavedAddresses: raw.profile?.showSavedAddresses ?? DEFAULT.profile.showSavedAddresses,
        },
        integrations: {
          pushNotif:             raw.integrations?.pushNotif             ?? DEFAULT.integrations.pushNotif,
          analytics:             raw.integrations?.analytics             ?? DEFAULT.integrations.analytics,
          analyticsPlatform:     raw.integrations?.analyticsPlatform     ?? DEFAULT.integrations.analyticsPlatform,
          analyticsTrackingId:   raw.integrations?.analyticsTrackingId   ?? DEFAULT.integrations.analyticsTrackingId,
          analyticsDebug:        raw.integrations?.analyticsDebug        ?? DEFAULT.integrations.analyticsDebug,
          sentry:                raw.integrations?.sentry                ?? DEFAULT.integrations.sentry,
          sentryDsn:             raw.integrations?.sentryDsn             ?? DEFAULT.integrations.sentryDsn,
          sentryEnvironment:     raw.integrations?.sentryEnvironment     ?? DEFAULT.integrations.sentryEnvironment,
          sentrySampleRate:      raw.integrations?.sentrySampleRate      ?? DEFAULT.integrations.sentrySampleRate,
          sentryTracesSampleRate:raw.integrations?.sentryTracesSampleRate?? DEFAULT.integrations.sentryTracesSampleRate,
          maps:                  raw.integrations?.maps                  ?? DEFAULT.integrations.maps,
          mapsAutocomplete:      raw.integrations?.mapsAutocomplete      ?? DEFAULT.integrations.mapsAutocomplete,
          mapsGeocoding:         raw.integrations?.mapsGeocoding         ?? DEFAULT.integrations.mapsGeocoding,
          mapsDistanceMatrix:    raw.integrations?.mapsDistanceMatrix     ?? DEFAULT.integrations.mapsDistanceMatrix,
          whatsapp:              raw.integrations?.whatsapp              ?? DEFAULT.integrations.whatsapp,
          sms:                   raw.integrations?.sms                  ?? DEFAULT.integrations.sms,
          email:                 raw.integrations?.email                 ?? DEFAULT.integrations.email,
        },
        auth: {
          phoneOtpEnabled:        raw.auth?.phoneOtpEnabled        ?? DEFAULT.auth.phoneOtpEnabled,
          emailOtpEnabled:        raw.auth?.emailOtpEnabled        ?? DEFAULT.auth.emailOtpEnabled,
          usernamePasswordEnabled:raw.auth?.usernamePasswordEnabled?? DEFAULT.auth.usernamePasswordEnabled,
          googleEnabled:          raw.auth?.googleEnabled          ?? DEFAULT.auth.googleEnabled,
          facebookEnabled:        raw.auth?.facebookEnabled        ?? DEFAULT.auth.facebookEnabled,
          emailRegisterEnabled:   raw.auth?.emailRegisterEnabled   ?? DEFAULT.auth.emailRegisterEnabled,
          biometricEnabled:       raw.auth?.biometricEnabled       ?? DEFAULT.auth.biometricEnabled,
          captchaEnabled:         raw.auth?.captchaEnabled         ?? DEFAULT.auth.captchaEnabled,
          twoFactorEnabled:       raw.auth?.twoFactorEnabled       ?? DEFAULT.auth.twoFactorEnabled,
          magicLinkEnabled:       raw.auth?.magicLinkEnabled       ?? DEFAULT.auth.magicLinkEnabled,
          captchaSiteKey:         raw.auth?.captchaSiteKey         ?? DEFAULT.auth.captchaSiteKey,
          googleClientId:         raw.auth?.googleClientId         ?? DEFAULT.auth.googleClientId,
          facebookAppId:          raw.auth?.facebookAppId          ?? DEFAULT.auth.facebookAppId,
          authMode:               raw.auth?.authMode               ?? DEFAULT.auth.authMode,
          firebaseEnabled:        raw.auth?.firebaseEnabled        ?? DEFAULT.auth.firebaseEnabled,
        },
        language: {
          defaultLanguage:  raw.language?.defaultLanguage  ?? DEFAULT.language.defaultLanguage,
          enabledLanguages: Array.isArray(raw.language?.enabledLanguages) && raw.language.enabledLanguages.length > 0
            ? raw.language.enabledLanguages
            : DEFAULT.language.enabledLanguages,
        },
        cities: Array.isArray(raw.cities) && raw.cities.length > 0
          ? raw.cities as string[]
          : DEFAULT.cities,
        network: {
          apiTimeoutMs:              raw.network?.apiTimeoutMs              ?? DEFAULT.network.apiTimeoutMs,
          maxRetryAttempts:          raw.network?.maxRetryAttempts          ?? DEFAULT.network.maxRetryAttempts,
          retryBackoffBaseMs:        raw.network?.retryBackoffBaseMs        ?? DEFAULT.network.retryBackoffBaseMs,
          riderGpsQueueMax:          raw.network?.riderGpsQueueMax          ?? DEFAULT.network.riderGpsQueueMax,
          riderDismissedRequestTtlSec: raw.network?.riderDismissedRequestTtlSec ?? DEFAULT.network.riderDismissedRequestTtlSec,
        },
        branding: raw.branding ? {
          colorMart:      raw.branding.colorMart,
          colorFood:      raw.branding.colorFood,
          colorRides:     raw.branding.colorRides,
          colorPharmacy:  raw.branding.colorPharmacy,
          colorParcel:    raw.branding.colorParcel,
          colorVan:       raw.branding.colorVan,
          mapCenterLat:   typeof raw.branding.mapCenterLat === "number" ? raw.branding.mapCenterLat : undefined,
          mapCenterLng:   typeof raw.branding.mapCenterLng === "number" ? raw.branding.mapCenterLng : undefined,
          mapCenterLabel: raw.branding.mapCenterLabel,
        } : undefined,
        regional: {
          phoneFormat:    raw.regional?.phoneFormat,
          phoneHint:      raw.regional?.phoneHint,
          timezone:       raw.regional?.timezone,
          currencySymbol: raw.regional?.currencySymbol ?? raw.currencySymbol ?? DEFAULT.regional?.currencySymbol ?? "Rs.",
          countryCode:    raw.regional?.countryCode,
        },
        serviceContent: raw.serviceContent ? {
          mart:     raw.serviceContent.mart     ?? undefined,
          food:     raw.serviceContent.food     ?? undefined,
          rides:    raw.serviceContent.rides    ?? undefined,
          pharmacy: raw.serviceContent.pharmacy ?? undefined,
          parcel:   raw.serviceContent.parcel   ?? undefined,
          van:      raw.serviceContent.van      ?? undefined,
        } : undefined,
        compliance: {
          minAppVersion: raw.compliance?.minAppVersion ?? DEFAULT.compliance.minAppVersion,
          termsVersion:  raw.compliance?.termsVersion  ?? DEFAULT.compliance.termsVersion,
          appStoreUrl:   raw.compliance?.appStoreUrl   ?? "",
          playStoreUrl:  raw.compliance?.playStoreUrl  ?? "",
        },
        releaseNotes: Array.isArray(raw.releaseNotes) ? raw.releaseNotes as { id: string; version: string; releaseDate: string; notes: string[]; sortOrder: number }[] : [],
        uploads: raw.uploads ? {
          maxImageMb:           raw.uploads.maxImageMb           ?? undefined,
          maxVideoMb:           raw.uploads.maxVideoMb           ?? undefined,
          maxVideoDurationSec:  raw.uploads.maxVideoDurationSec  ?? undefined,
          allowedImageFormats:  Array.isArray(raw.uploads.allowedImageFormats) ? raw.uploads.allowedImageFormats : undefined,
          allowedVideoFormats:  Array.isArray(raw.uploads.allowedVideoFormats) ? raw.uploads.allowedVideoFormats : undefined,
        } : undefined,
        pagination: raw.pagination ? {
          productsDefault: raw.pagination.productsDefault ?? undefined,
          trendingLimit:   raw.pagination.trendingLimit   ?? undefined,
          flashDealsLimit: raw.pagination.flashDealsLimit ?? undefined,
        } : undefined,
        onboarding: raw.onboarding ? {
          slides: Array.isArray(raw.onboarding.slides) ? raw.onboarding.slides : undefined,
        } : undefined,
        supportHoursSchedule: raw.supportHoursSchedule && typeof raw.supportHoursSchedule === "object"
          ? raw.supportHoursSchedule
          : null,
      };
      _cached = parsed;
      _cachedAt = Date.now();
      setConfig(parsed);
      if (parsed.branding?.mapCenterLat != null && parsed.branding?.mapCenterLng != null) {
        setDefaultMapCenter(parsed.branding.mapCenterLat, parsed.branding.mapCenterLng);
      }
    } catch {
      if (_cached) setConfig(_cached);
    } finally {
      setFetching(false);
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    const interval = setInterval(() => fetchConfig(), CACHE_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") fetchConfig(true);
    });
    return () => { clearInterval(interval); sub.remove(); };
  }, [fetchConfig]);

  const refresh = useCallback(() => fetchConfig(true), [fetchConfig]);

  return (
    <PlatformConfigContext.Provider value={{ config, loading: false, fetching, refresh }}>
      {children}
    </PlatformConfigContext.Provider>
  );
}

export function usePlatformConfig() {
  return useContext(PlatformConfigContext);
}

export function useCurrency() {
  const { config } = useContext(PlatformConfigContext);
  return {
    symbol: config.regional?.currencySymbol ?? "Rs.",
    code:   config.payment?.currency        ?? "PKR",
  };
}
