import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { Phone, Mail, User, Wrench, AlertCircle, X, Eye, EyeOff, Fingerprint, Loader2 } from "lucide-react";
import {
  isBiometricAvailable,
  isBiometricEnabled,
  setBiometricEnabled as saveBiometricEnabled,
  storeBiometricToken,
  getBiometricToken,
  verifyBiometric,
} from "../lib/biometric";
import { useAuth } from "../lib/auth";
import { api, apiFetch } from "../lib/api";
import { vendorEnv } from "../lib/envValidation";
import { usePlatformConfig, getVendorAuthConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { loadGoogleGSIToken, loadFacebookAccessToken, MagicLinkSender, canonicalizePhone, useAuthConfig, executeCaptcha, formatPhoneForApi } from "@workspace/auth-utils";
import { useOTPBypass } from "../hooks/useOTPBypass";

type LoginMethod = "phone" | "email" | "username" | "google" | "facebook";
type Step = "continue" | "input" | "otp" | "pending" | "2fa" | "register" | "register-otp" | "register-info" | "register-submitted" | "forgot" | "forgot-otp" | "forgot-reset" | "forgot-done";

function getDeviceFingerprint(): string {
  const stored = sessionStorage.getItem("_dfp");
  if (stored) return stored;
  const fp = [
    navigator.userAgent,
    navigator.language,
    screen.width + "x" + screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency ?? "",
  ].filter(Boolean).join("|");
  let hash = 0;
  for (let i = 0; i < fp.length; i++) { hash = ((hash << 5) - hash + fp.charCodeAt(i)) | 0; }
  const id = "web_" + Math.abs(hash).toString(36);
  sessionStorage.setItem("_dfp", id);
  return id;
}

const STORE_CATS = ["Grocery","Restaurant","Bakery","Pharmacy","Electronics","Clothing","General Store","Fast Food","Fruits & Vegetables","Dairy","Meat & Poultry","Other"];
const CITIES = ["Muzaffarabad","Mirpur","Rawalakot","Bagh","Kotli","Bhimber","Jhelum","Rawalpindi","Islamabad","Lahore","Other"];
const BANKS = ["EasyPaisa","JazzCash","MCB","HBL","UBL","Meezan Bank","Bank Alfalah","NBP","Allied Bank","Other"];

export default function Login() {
  const { login } = useAuth();
  const { config } = usePlatformConfig();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const appName           = config.platform.appName;
  const businessAddress   = config.platform.businessAddress;
  const vendorEarningsPct = Math.round(100 - (config.platform.vendorCommissionPct ?? 15));
  const vendorAuth        = getVendorAuthConfig(config);
  const firebaseCfg = useAuthConfig("/api");
  const phoneHint    = config.regional?.phoneHint ?? "03XXXXXXXXX";
  const isValidPhone = (() => {
    try {
      if (config.regional?.phoneFormat) {
        const re = new RegExp(config.regional.phoneFormat);
        return (ph: string) => re.test(ph);
      }
    } catch { /* invalid regex — fall through to hardcoded regex */ }
    return (ph: string) => /^0?3\d{9}$/.test(ph.replace(/[\s\-()+]/g, ""));
  })();
  const googleClientId    = config.auth?.googleClientId;
  const facebookAppId     = config.auth?.facebookAppId;
  const hasSocial         = vendorAuth.google || vendorAuth.facebook;
  const hasMagicLink      = vendorAuth.magicLink;

  /* authMode from platform_settings — in EMAIL-only mode, hide phone OTP */
  const availableMethods: LoginMethod[] = (["phone", "email", "username"] as const).filter(m => {
    if (m === "phone") return vendorAuth.phoneOtp && firebaseCfg.authMode !== "EMAIL";
    if (m === "email") return vendorAuth.emailOtp;
    if (m === "username") return vendorAuth.usernamePassword;
    return false;
  });

  const FEATURES = [
    { icon: "📦", titleKey: "orderManagement" as TranslationKey,   descKey: "manageOrdersDesc" as TranslationKey },
    { icon: "🍽️", titleKey: "productControl" as TranslationKey,    descKey: "productControlDesc" as TranslationKey },
    { icon: "💰", titleKey: "instantEarnings" as TranslationKey,   descKey: "instantEarningsDesc" as TranslationKey },
    { icon: "🎟️", titleKey: "promoCodes" as TranslationKey,        descKey: "promoCodesDesc" as TranslationKey },
  ];

  const [method, setMethod] = useState<LoginMethod>("phone");
  const [step, setStep]     = useState<Step>("continue");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");

  const [identifier, setIdentifier] = useState("");
  const [otpChannel, setOtpChannel] = useState("");
  const [fallbackChannels, setFallbackChannels] = useState<string[]>([]);

  const [phone, setPhone] = useState("");
  const { bypassActive: otpBypassActive, bypassMessage: otpBypassMessage, remainingSeconds: bypassRemainingSeconds } = useOTPBypass(
    method === "phone" && phone.length >= 10 ? phone : undefined
  );
  const [otp, setOtp]     = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [resendCooldown, setResendCooldown] = useState<number>(() => {
    try {
      const expiry = localStorage.getItem("vendor_otp_cooldown_expiry");
      if (expiry) {
        const remaining = Math.ceil((parseInt(expiry, 10) - Date.now()) / 1000);
        if (remaining > 0) return remaining;
      }
    } catch { /* ignore */ }
    return 0;
  });

  const [email, setEmail]     = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [emailDevOtp, setEmailDevOtp] = useState("");

  const [totpTempToken, setTotpTempToken] = useState("");
  const [totpUserId, setTotpUserId] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);

  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotDevOtp, setForgotDevOtp] = useState("");
  const [forgotNewPwd, setForgotNewPwd] = useState("");
  const [forgotConfirmPwd, setForgotConfirmPwd] = useState("");
  const [showForgotPwd, setShowForgotPwd] = useState(false);

  const [regPhone, setRegPhone] = useState("");
  const [regOtp, setRegOtp]     = useState("");
  const [regDevOtp, setRegDevOtp] = useState("");
  const [regForm, setRegForm] = useState({
    storeName: "", storeCategory: "", name: "", cnic: "", address: "", city: "",
    bankName: "", bankAccount: "", bankAccountTitle: "",
  });
  const rf = (k: string, v: string) => setRegForm(p => ({ ...p, [k]: v }));

  const [regUsername, setRegUsername] = useState("");
  const [regUsernameStatus, setRegUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const regUsernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const regUsernameAbort = useRef<AbortController | null>(null);
  const checkIdentifierAbort = useRef<AbortController | null>(null);
  const [regTermsAccepted, setRegTermsAccepted] = useState(false);

  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [bypassBannerDismissed, setBypassBannerDismissed] = useState(false);

  const clearError = () => setError("");

  const [failedAttempts, setFailedAttempts] = useState(() => {
    try { return parseInt(sessionStorage.getItem("vendor_login_attempts") || "0", 10) || 0; } catch { return 0; }
  });
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(() => {
    try {
      const s = sessionStorage.getItem("vendor_lockout_until");
      const v = s ? parseInt(s, 10) : null;
      return v && v > Date.now() ? v : null;
    } catch { return null; }
  });
  const isLockedOut = lockoutUntil !== null && lockoutUntil > Date.now();

  const handleAuthError = (e: unknown) => {
    const msg = e instanceof Error ? e.message : "Login failed. Please try again.";
    const isLockError = msg.toLowerCase().includes("locked") || msg.toLowerCase().includes("too many");
    if (isLockError) {
      const until = Date.now() + (vendorAuth.lockoutDurationSec ?? 300) * 1000;
      setLockoutUntil(until);
      try { sessionStorage.setItem("vendor_lockout_until", String(until)); } catch { /* ignore */ }
      setError("Account temporarily locked due to too many failed attempts. Please try again later.");
      return;
    }
    if (vendorAuth.lockoutEnabled) {
      setFailedAttempts(prev => {
        const next = prev + 1;
        try { sessionStorage.setItem("vendor_login_attempts", String(next)); } catch { /* ignore */ }
        if (next >= (vendorAuth.lockoutMaxAttempts ?? 5)) {
          const until = Date.now() + (vendorAuth.lockoutDurationSec ?? 300) * 1000;
          setLockoutUntil(until);
          try { sessionStorage.setItem("vendor_lockout_until", String(until)); } catch { /* ignore */ }
        }
        return next;
      });
    }
    setError(msg);
  };

  const BASE = vendorEnv.baseUrl.replace(/\/$/, "");

  const handleSocialGoogle = async () => {
    if (!googleClientId) { setError("Google login is not configured. Please contact support."); return; }
    setLoading(true); clearError();
    try {
      const idToken = await loadGoogleGSIToken(googleClientId);
      const res = await api.socialGoogle({ idToken });
      await doLogin(res);
    } catch (e) { setError(e instanceof Error ? e.message : "Google login failed"); }
    setLoading(false);
  };

  const handleSocialFacebook = async () => {
    if (!facebookAppId) { setError("Facebook login is not configured. Please contact support."); return; }
    setLoading(true); clearError();
    try {
      const accessToken = await loadFacebookAccessToken(facebookAppId);
      const res = await api.socialFacebook({ accessToken });
      await doLogin(res);
    } catch (e) { setError(e instanceof Error ? e.message : "Facebook login failed"); }
    setLoading(false);
  };

  const handleMagicLinkSend = async (email: string) => {
    clearError();
    try {
      await api.magicLinkSend(email);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to send magic link"); throw e; }
  };

  useEffect(() => {
    if (step === "input" && method === "google") { handleSocialGoogle(); }
    if (step === "input" && method === "facebook") { handleSocialFacebook(); }
  }, [step, method]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const magicToken = params.get("magic_token");
    if (magicToken) {
      setLoading(true);
      api.magicLinkVerify({ token: magicToken })
        .then(async (res: any) => { await doLogin(res); window.history.replaceState({}, "", window.location.pathname); })
        .catch((e: unknown) => { setError(e instanceof Error ? e.message : "Magic link login failed"); window.history.replaceState({}, "", window.location.pathname); })
        .finally(() => setLoading(false));
    }
  }, []);

  const checkIdentifier = useCallback(async () => {
    const id = identifier.trim();
    if (!id) { setError("Please enter your phone, email, or username"); return; }

    /* Cancel any in-flight request from a previous attempt */
    if (checkIdentifierAbort.current) checkIdentifierAbort.current.abort();
    checkIdentifierAbort.current = new AbortController();

    setLoading(true); clearError();
    try {
      const deviceId = getDeviceFingerprint();
      const data = await apiFetch("/auth/check-identifier", {
        method: "POST",
        body: JSON.stringify({ identifier: id, role: "vendor", deviceId }),
        signal: checkIdentifierAbort.current.signal,
      });

      if (data.action === "blocked" || data.isBanned) {
        setError("This account has been suspended. Please contact support.");
        setLoading(false); return;
      }
      if (data.action === "locked") {
        setError(`Account temporarily locked. Please try again in ${data.lockedMinutes} minute(s).`);
        setLoading(false); return;
      }
      if (data.action === "registration_closed") {
        setError("New registrations are currently closed. Please contact support.");
        setLoading(false); return;
      }
      if (data.action === "no_method") {
        setError("No login methods are currently available. Please contact support.");
        setLoading(false); return;
      }
      if (data.action === "force_google") {
        if (vendorAuth.google) {
          setMethod("google");
          setStep("input");
        } else {
          setError("This account is linked to Google. Please sign in with Google.");
        }
        setLoading(false); return;
      }
      if (data.action === "force_facebook") {
        if (vendorAuth.facebook) {
          setMethod("facebook");
          setStep("input");
        } else {
          setError("This account is linked to Facebook. Please sign in with Facebook.");
        }
        setLoading(false); return;
      }
      if (data.action === "register") {
        const looksLikePhone = /^[\d\s\-+()]{7,15}$/.test(id);
        if (looksLikePhone) setRegPhone(canonicalizePhone(id));
        setStep("register");
        setLoading(false); return;
      }
      if (data.action === "send_phone_otp") {
        const normalized = canonicalizePhone(id);
        setPhone(normalized);
        setMethod("phone");
        setLoading(false);
        setStep("input");
        setTimeout(() => sendPhoneOtpDirect(normalized), 0);
        return;
      }
      if (data.action === "send_email_otp") {
        setEmail(id);
        setMethod("email");
        setLoading(false);
        setStep("input");
        setTimeout(() => sendEmailOtpDirect(id), 0);
        return;
      }
      if (data.action === "login_password") {
        setUsername(id);
        setMethod("username");
        setStep("input");
        setLoading(false); return;
      }
      setMethod("username");
      setUsername(id);
      setStep("input");
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Check failed. Please try again.");
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identifier]);

  const sendPhoneOtpDirect = async (ph: string, channel?: string) => {
    setLoading(true); clearError();
    try {
      const res = await api.sendOtp(ph, channel);
      if (res.otpRequired === false) {
        if (res.token) { await doLogin(res as AuthResponse); setLoading(false); return; }
        const bypass = await api.verifyOtp(ph, "000000", getDeviceFingerprint(), "vendor");
        await doLogin(bypass);
        setLoading(false); return;
      }
      setDevOtp(res.otp || "");
      setOtpChannel(res.channel || "sms");
      setFallbackChannels(res.fallbackChannels || []);
      setStep("otp");
      startCooldown();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to send OTP"); }
    setLoading(false);
  };

  const sendEmailOtpDirect = async (em: string) => {
    setLoading(true); clearError();
    try {
      const res = await api.sendEmailOtp(em);
      setEmailDevOtp(res.otp || "");
      setOtpChannel("email");
      setFallbackChannels([]);
      setStep("otp");
      startCooldown();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to send OTP"); }
    setLoading(false);
  };

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => {
      setResendCooldown(c => {
        const next = c - 1;
        if (next <= 0) {
          try { localStorage.removeItem("vendor_otp_cooldown_expiry"); } catch { /* ignore */ }
        }
        return next;
      });
    }, 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  const startCooldown = () => {
    const expiry = Date.now() + 60 * 1000;
    try { localStorage.setItem("vendor_otp_cooldown_expiry", String(expiry)); } catch { /* ignore */ }
    setResendCooldown(60);
  };

  useEffect(() => {
    if (!regUsername || regUsername.length < 3) { setRegUsernameStatus("idle"); return; }
    if (regUsernameTimer.current) clearTimeout(regUsernameTimer.current);
    regUsernameTimer.current = setTimeout(async () => {
      if (regUsernameAbort.current) regUsernameAbort.current.abort();
      regUsernameAbort.current = new AbortController();
      setRegUsernameStatus("checking");
      try {
        const res = await api.checkAvailable({ username: regUsername }, regUsernameAbort.current?.signal);
        if (res.username && !res.username.available) setRegUsernameStatus("taken");
        else setRegUsernameStatus("available");
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return;
        setRegUsernameStatus("taken");
      }
    }, 600);
    return () => {
      if (regUsernameTimer.current) clearTimeout(regUsernameTimer.current);
      if (regUsernameAbort.current) regUsernameAbort.current.abort();
    };
  }, [regUsername]);

  useEffect(() => {
    if (regForm.name && !regUsername) {
      const suggested = regForm.name.trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
      if (suggested.length >= 3) setRegUsername(suggested);
    }
  }, [regForm.name]);

  interface AuthResponse {
    token: string;
    refreshToken?: string;
    pendingApproval?: boolean;
    requires2FA?: boolean;
    tempToken?: string;
    userId?: string;
    user?: { roles?: string[] | string; role?: string; status?: string };
  }

  const checkVendorRole = (res: AuthResponse): boolean => {
    if (res.requires2FA) return true;
    const raw = res.user?.roles ?? res.user?.role ?? "";
    const roles: string[] = Array.isArray(raw) ? raw : String(raw).split(",").map((r: string) => r.trim());
    if (!roles.includes("vendor")) {
      setError(T("accessDeniedVendor"));
      return false;
    }
    const status = res.user?.status;
    if (status === "banned" || status === "suspended") {
      setError(T("accountSuspended") || "Your account has been suspended. Please contact support.");
      return false;
    }
    return true;
  };

  const doLogin = async (res: AuthResponse) => {
    if (!checkVendorRole(res)) return;
    if (res.requires2FA && res.tempToken) {
      setTotpTempToken(res.tempToken);
      setTotpUserId(res.userId || "");
      setStep("2fa");
      return;
    }
    if (res.pendingApproval) { setStep("pending"); return; }
    api.storeTokens(res.token, res.refreshToken);
    try {
      const profile = await api.getMe();
      login(res.token, profile, res.refreshToken);
    } catch (e) {
      api.clearTokens();
      setError(e instanceof Error ? e.message : "Failed to load vendor profile. Please try again.");
    }
  };

  const verify2FA = async () => {
    const code = useBackupCode ? backupCode.trim() : totpCode.trim();
    if (!code) { setError("Please enter verification code"); return; }
    if (!totpTempToken) {
      setError("Session error: 2FA token is missing. Please go back and log in again.");
      return;
    }
    setLoading(true); clearError();
    try {
      const endpoint = useBackupCode ? "/auth/2fa/recovery" : "/auth/2fa/verify";
      const deviceFingerprint = getDeviceFingerprint();
      const body = useBackupCode
        ? { tempToken: totpTempToken, backupCode: code, deviceFingerprint }
        : { code, tempToken: totpTempToken, deviceFingerprint };
      const data = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await doLogin(data);
    } catch (e) { setError(e instanceof Error ? e.message : "2FA verification failed"); }
    setLoading(false);
  };

  const getCaptchaToken = async (action: string): Promise<string | undefined> => {
    if (!vendorAuth.captchaEnabled) return undefined;
    try { return await executeCaptcha(action, vendorAuth.captchaSiteKey); } catch { return undefined; }
  };

  const sendPhoneOtp = async (channel?: string) => {
    if (!phone || !isValidPhone(phone)) { setError(T("enterPhoneNumber")); return; }
    setLoading(true); clearError();
    try {
      const captchaToken = await getCaptchaToken("login_phone_otp");
      const res = await api.sendOtp(phone, channel, captchaToken);
      if (res.otpRequired === false) {
        if (res.token) { await doLogin(res as AuthResponse); setLoading(false); return; }
        setStep("otp");
        setBypassBannerDismissed(false);
        const bypass = await api.verifyOtp(phone, "000000", getDeviceFingerprint(), "vendor");
        await doLogin(bypass);
        setLoading(false); return;
      }
      setDevOtp(res.otp || "");
      setOtpChannel(res.channel || "sms");
      setFallbackChannels(res.fallbackChannels || []);
      setStep("otp");
      startCooldown();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to send OTP"); }
    setLoading(false);
  };

  const verifyPhoneOtp = async () => {
    if (!otp || otp.length < 6) { setError(T("enterOtp")); return; }
    setLoading(true); clearError();
    try { await doLogin(await api.verifyOtp(phone, otp, getDeviceFingerprint(), "vendor")); } catch (e) { handleAuthError(e); }
    setLoading(false);
  };

  const sendEmailOtp = async () => {
    if (!email || !email.includes("@")) { setError(T("enterEmail")); return; }
    setLoading(true); clearError();
    try {
      const captchaToken = await getCaptchaToken("login_email_otp");
      const res = await api.sendEmailOtp(email, captchaToken);
      setEmailDevOtp(res.otp || "");
      setOtpChannel("email");
      setFallbackChannels([]);
      setStep("otp");
      startCooldown();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to send OTP"); }
    setLoading(false);
  };

  const verifyEmailOtp = async () => {
    if (!emailOtp || emailOtp.length < 6) { setError(T("enterOtp")); return; }
    setLoading(true); clearError();
    try { await doLogin(await api.verifyEmailOtp(email, emailOtp, getDeviceFingerprint())); } catch (e) { handleAuthError(e); }
    setLoading(false);
  };

  const loginUsername = async () => {
    if (!username || username.length < 3) { setError(T("enterUsername")); return; }
    if (!password || password.length < 6) { setError(T("enterPassword")); return; }
    setLoading(true); clearError();
    try {
      const captchaToken = await getCaptchaToken("login_username");
      await doLogin(await api.loginUsername(username, password, getDeviceFingerprint(), captchaToken));
    } catch (e) { handleAuthError(e); }
    setLoading(false);
  };

  const handleSubmit = () => {
    if (method === "phone") step === "input" ? sendPhoneOtp() : verifyPhoneOtp();
    else if (method === "email") step === "input" ? sendEmailOtp() : verifyEmailOtp();
    else loginUsername();
  };

  const selectMethod = (m: LoginMethod) => {
    setMethod(m); setStep("input"); clearError();
    setOtp(""); setEmailOtp(""); setDevOtp(""); setEmailDevOtp("");
  };

  const sendForgotOtp = async () => {
    if (!forgotIdentifier || forgotIdentifier.length < 3) { setError("Enter your phone, email, or username"); return; }
    setLoading(true); clearError();
    try {
      const res = await api.forgotPassword({ identifier: forgotIdentifier.trim() });
      if (res.otp) setForgotDevOtp(res.otp);
      setStep("forgot-otp");
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); }
    setLoading(false);
  };

  const resetForgotPassword = async () => {
    if (!forgotOtp || forgotOtp.length < 6) { setError("Enter the 6-digit OTP code"); return; }
    if (!forgotNewPwd || forgotNewPwd.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (!/[A-Z]/.test(forgotNewPwd)) { setError("Password must contain an uppercase letter"); return; }
    if (!/[0-9]/.test(forgotNewPwd)) { setError("Password must contain a number"); return; }
    if (forgotNewPwd !== forgotConfirmPwd) { setError("Passwords do not match"); return; }
    setLoading(true); clearError();
    try {
      await api.resetPassword({ identifier: forgotIdentifier.trim(), otp: forgotOtp, newPassword: forgotNewPwd });
      setStep("forgot-done");
    } catch (e) { setError(e instanceof Error ? e.message : "Reset failed"); }
    setLoading(false);
  };

  const sendRegOtp = async () => {
    if (!regPhone || !isValidPhone(regPhone)) { setError(`Enter a valid phone number (${phoneHint})`); return; }
    setLoading(true); clearError();
    try {
      const captchaToken = await getCaptchaToken("register_phone_otp");
      const res = await api.sendOtp(regPhone, undefined, captchaToken);
      if (res.otpRequired === false) {
        /* OTP globally disabled — skip OTP step entirely.
           If no token was returned (new user bypass), call verify-otp immediately
           with a dummy code to create the provisional user record and get a token.
           verify-otp global bypass accepts any code. */
        if (res.token) {
          api.storeTokens(res.token, res.refreshToken);
        } else {
          try {
            const verifyRes = await api.verifyOtp(regPhone, "000000");
            if (verifyRes.token) api.storeTokens(verifyRes.token, verifyRes.refreshToken);
          } catch {
            /* If verify-otp fails, still proceed — vendor-register will give auth error */
          }
        }
        setStep("register-info");
        setLoading(false); return;
      }
      setRegDevOtp(res.otp || "");
      setStep("register-otp");
      startCooldown();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to send OTP"); }
    setLoading(false);
  };

  const verifyRegOtp = async () => {
    if (!regOtp || regOtp.length < 6) { setError(T("enterOtp")); return; }
    setLoading(true); clearError();
    try {
      const res = await api.verifyOtp(regPhone, regOtp, getDeviceFingerprint());
      if (res.token) api.storeTokens(res.token, res.refreshToken);
      setStep("register-info");
    } catch (e) { setError(e instanceof Error ? e.message : "Verification failed"); }
    setLoading(false);
  };

  const submitRegistration = async () => {
    if (!regForm.storeName.trim()) { setError("Store name is required"); return; }
    if (!regForm.name.trim()) { setError("Your name is required"); return; }
    if (!regUsername || regUsername.length < 3) { setError("Username is required (min 3 characters)"); return; }
    if (regUsernameStatus === "taken") { setError("Username is already taken"); return; }
    if (regUsernameStatus !== "available") { setError("Please wait for username availability check"); return; }
    if (!regTermsAccepted) { setError("Please accept the Terms & Conditions to continue"); return; }
    setLoading(true); clearError();
    try {
      const termsVersion = config.compliance?.termsVersion;
      const res = await api.vendorRegister({ phone: regPhone, ...regForm, username: regUsername.trim(), ...(termsVersion && { acceptedTermsVersion: termsVersion }) });
      if (res.status === "approved") {
        setStep("input");
        setError("Your vendor account is already approved! Please log in.");
      } else {
        setStep("register-submitted");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Registration failed"); }
    setLoading(false);
  };

  const INPUT_CLS = "w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-orange-400 transition-all";
  const SELECT_CLS = "w-full h-12 px-3 bg-gray-50 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-orange-400 transition-all appearance-none";
  const LABEL_CLS = "text-xs font-extrabold text-gray-400 mb-1.5 block uppercase tracking-wider";

  if (config.platform.appStatus === "maintenance") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-800 via-orange-700 to-amber-700 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-orange-400/10 rounded-full pointer-events-none" />
        <div className="absolute -bottom-16 -right-16 w-64 h-64 bg-amber-300/10 rounded-full pointer-events-none" />
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl relative z-10">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <Wrench size={36} className="text-amber-500" />
          </div>
          <h2 className="text-2xl font-extrabold text-gray-800 mb-3">Under Maintenance</h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-5">{config.content.maintenanceMsg || "We're performing scheduled maintenance. Back soon!"}</p>
          {(config.platform.supportPhone || config.platform.supportEmail) && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-left">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Need Help?</p>
              {config.platform.supportPhone && (
                <p className="text-sm font-bold text-gray-700 flex items-center gap-2"><Phone size={13} className="text-gray-400" /> {config.platform.supportPhone}</p>
              )}
              {config.platform.supportEmail && (
                <p className="text-xs text-gray-500 mt-0.5 ml-5">{config.platform.supportEmail}</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step === "pending") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-800 via-orange-700 to-amber-700 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-orange-400/10 rounded-full pointer-events-none" />
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl relative z-10">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <span className="text-4xl">⏳</span>
          </div>
          <h2 className="text-2xl font-extrabold text-gray-800 mb-3">{T("approvalPending")}</h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-5">
            {T("vendorApprovalMsg")}
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 text-left flex gap-2">
            <span className="text-amber-500 flex-shrink-0 mt-0.5">💡</span>
            <p className="text-amber-700 text-xs font-medium">{T("alreadyApproved")}</p>
          </div>
          <button onClick={() => setStep("continue")}
            className="w-full h-12 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2 shadow-sm shadow-orange-200">
            ← {T("backToLogin")}
          </button>
        </div>
      </div>
    );
  }

  if (step === "2fa") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-800 via-orange-700 to-amber-700 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-orange-400/10 rounded-full pointer-events-none" />
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl relative z-10">
          <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🔐</span>
          </div>
          <h2 className="text-xl font-extrabold text-gray-800 mb-1 text-center">Two-Factor Authentication</h2>
          <p className="text-gray-500 text-sm text-center mb-5">
            {useBackupCode ? "Enter a backup code" : "Enter code from your authenticator app"}
          </p>
          {!useBackupCode ? (
            <div>
              <div className="relative mb-3">
                <div className="flex gap-2 justify-center pointer-events-none select-none" aria-hidden>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className={`w-10 h-13 rounded-xl border-2 flex items-center justify-center text-xl font-bold transition-all ${
                      totpCode[i] ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-200 bg-gray-50 text-gray-300"
                    }`}>
                      {totpCode[i] || "·"}
                    </div>
                  ))}
                </div>
                <input type="text" inputMode="numeric" value={totpCode}
                  onChange={e => { setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6)); clearError(); }}
                  onKeyDown={e => e.key === "Enter" && verify2FA()}
                  className="absolute inset-0 opacity-0 w-full cursor-text" maxLength={6} autoFocus aria-label="6-digit 2FA code" />
              </div>
              <p className="text-center text-xs text-gray-400 mb-3">Tap above and type your 6-digit code</p>
            </div>
          ) : (
            <input type="text" placeholder="Enter backup code" value={backupCode}
              onChange={e => { setBackupCode(e.target.value); clearError(); }}
              onKeyDown={e => e.key === "Enter" && verify2FA()}
              className={INPUT_CLS + " mb-3"} autoFocus autoCapitalize="off" />
          )}
          {error && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
              <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-600 text-sm font-medium">{error}</p>
            </div>
          )}
          <button onClick={verify2FA} disabled={loading}
            className="w-full h-12 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm shadow-orange-200">
            {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Verify →"}
          </button>
          <button onClick={() => { setUseBackupCode(!useBackupCode); setBackupCode(""); setTotpCode(""); clearError(); }}
            className="w-full text-sm text-orange-600 hover:text-orange-700 font-bold mt-3 py-1 transition-colors">
            {useBackupCode ? "Use authenticator app" : "Use a backup code"}
          </button>
          <button onClick={() => { setStep("continue"); setTotpCode(""); setBackupCode(""); clearError(); }}
            className="w-full text-sm text-gray-400 hover:text-gray-600 mt-1 py-1 flex items-center justify-center gap-1 transition-colors">
            ← {T("backToLogin")}
          </button>
        </div>
      </div>
    );
  }

  if (step === "register-submitted") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-800 via-orange-700 to-amber-700 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-orange-400/10 rounded-full pointer-events-none" />
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl relative z-10">
          <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <span className="text-4xl">✅</span>
          </div>
          <h2 className="text-2xl font-extrabold text-gray-800 mb-3">Application Submitted!</h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-5">
            Your vendor registration for <strong className="text-gray-700">{regForm.storeName}</strong> has been submitted successfully. Admin will review and approve your account.
          </p>
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-5 text-left space-y-1.5">
            <p className="text-orange-700 text-xs font-bold mb-1">📋 What happens next:</p>
            <p className="text-orange-600 text-xs">1. Admin reviews your application</p>
            <p className="text-orange-600 text-xs">2. You'll be notified once approved</p>
            <p className="text-orange-600 text-xs">3. Login with your phone to start selling</p>
          </div>
          <button onClick={() => { setStep("continue"); setRegPhone(""); setRegOtp(""); setRegDevOtp(""); setRegForm({ storeName:"", storeCategory:"", name:"", cnic:"", address:"", city:"", bankName:"", bankAccount:"", bankAccountTitle:"" }); }}
            className="w-full h-12 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2 shadow-sm shadow-orange-200">
            ← Back to Login
          </button>
        </div>
      </div>
    );
  }

  if ((step === "register" || step === "register-otp" || step === "register-info") && !config.features.newUsers) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-800 via-orange-700 to-amber-700 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-orange-400/10 rounded-full pointer-events-none" />
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl relative z-10">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <span className="text-4xl">🔒</span>
          </div>
          <h2 className="text-2xl font-extrabold text-gray-800 mb-3">Registration Closed</h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-5">New vendor registrations are currently not available. Please try again later or contact support.</p>
          {(config.platform.supportPhone || config.platform.supportEmail) && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-left mb-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Contact Support</p>
              {config.platform.supportPhone && <p className="text-sm font-bold text-gray-700">{config.platform.supportPhone}</p>}
              {config.platform.supportEmail && <p className="text-xs text-gray-500 mt-0.5">{config.platform.supportEmail}</p>}
            </div>
          )}
          <button onClick={() => setStep("continue")}
            className="w-full h-12 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2 shadow-sm shadow-orange-200">
            ← Back to Login
          </button>
        </div>
      </div>
    );
  }

  if (step === "register" || step === "register-otp" || step === "register-info") {
    return (
      <div className="min-h-screen flex flex-col md:flex-row" style={{ paddingTop: "env(safe-area-inset-top,0px)" }}>

        {/* Left panel */}
        <div className="hidden md:flex md:w-1/2 lg:w-2/5 bg-gradient-to-br from-orange-700 via-orange-600 to-amber-600 flex-col justify-between p-10 relative overflow-hidden flex-shrink-0">
          <div className="absolute -top-24 -right-24 w-80 h-80 bg-white/10 rounded-full pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-amber-300/10 rounded-full pointer-events-none" />
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-12 h-12 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/20 shadow-lg"><span className="text-2xl">🏪</span></div>
            <div>
              <p className="text-white font-extrabold text-xl leading-tight">{appName}</p>
              <p className="text-orange-200 text-sm font-medium">Vendor Registration</p>
            </div>
          </div>
          <div className="relative z-10">
            <h1 className="text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-4">
              Start Selling on<br /><span className="text-orange-200">{appName}</span>
            </h1>
            <p className="text-orange-100 text-lg font-medium mb-10 leading-relaxed">
              Register your store and reach thousands of customers. Manage orders, products, and earnings — all in one place.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {FEATURES.map(f => (
                <div key={f.titleKey} className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                  <span className="text-2xl mb-2 block">{f.icon}</span>
                  <p className="text-white font-bold text-sm">{T(f.titleKey)}</p>
                  <p className="text-orange-100 text-xs mt-0.5">{T(f.descKey)}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="relative z-10">
            <p className="text-orange-300 text-sm">© {new Date().getFullYear()} {appName} · {businessAddress} · Keep {vendorEarningsPct}% earnings</p>
          </div>
        </div>

        {/* Right form area */}
        <div className="flex-1 bg-gradient-to-br from-orange-700 to-amber-600 md:bg-none md:bg-slate-50 flex flex-col items-center justify-center px-5 py-10 md:px-12 relative overflow-y-auto">
          <div className="md:hidden absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full -translate-y-16 translate-x-16 pointer-events-none" />

          <div className="w-full max-w-sm relative z-10">
            <div className="text-center mb-6 md:hidden">
              <div className="w-16 h-16 bg-white/20 rounded-[20px] flex items-center justify-center mx-auto mb-3 border border-white/30"><span className="text-3xl">🏪</span></div>
              <h1 className="text-2xl font-extrabold text-white">Become a Vendor</h1>
              <p className="text-orange-100 mt-1 font-medium text-sm">{appName} Business Partner</p>
            </div>

            <div className="hidden md:block mb-6">
              <h2 className="text-2xl font-extrabold text-gray-900">Register Your Store</h2>
              <p className="text-gray-500 mt-1 text-sm">
                {step === "register" ? "Step 1 of 2 — Verify your phone" :
                 step === "register-otp" ? "Step 1 of 2 — Enter OTP to verify" :
                 "Step 2 of 2 — Fill your store details"}
              </p>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-2xl">
              {/* Step progress */}
              <div className="flex items-center gap-3 mb-5">
                <div className="flex gap-1.5">
                  <div className={`h-1.5 rounded-full transition-all ${step === "register" || step === "register-otp" ? "w-10 bg-orange-500" : "w-10 bg-orange-400"}`} />
                  <div className={`h-1.5 rounded-full transition-all ${step === "register-info" ? "w-10 bg-orange-500" : "w-10 bg-gray-200"}`} />
                </div>
                <span className="text-xs text-gray-400 font-semibold">
                  {step === "register" || step === "register-otp" ? "Step 1 of 2" : "Step 2 of 2"}
                </span>
              </div>

              {step === "register" && (
                <>
                  <h2 className="text-lg font-extrabold text-gray-800 mb-1">Verify Phone Number</h2>
                  <p className="text-sm text-gray-500 mb-4">We'll send an OTP to verify your number</p>
                  <label className={LABEL_CLS}>Phone Number</label>
                  <div className="flex gap-2 mb-4">
                    <div className="h-12 px-3 bg-gray-100 border border-gray-200 rounded-xl flex items-center text-sm font-bold text-gray-600 flex-shrink-0">🇵🇰 +92</div>
                    <input type="tel" placeholder="3XX XXXXXXX" value={regPhone} onChange={e => setRegPhone(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && sendRegOtp()}
                      className={INPUT_CLS} autoFocus inputMode="tel" />
                  </div>
                </>
              )}

              {step === "register-otp" && (
                <>
                  <button onClick={() => { setStep("register"); clearError(); setRegDevOtp(""); }}
                    className="text-orange-600 text-sm font-bold mb-4 flex items-center gap-1.5 hover:text-orange-700 transition-colors">← Back</button>
                  <h2 className="text-lg font-extrabold text-gray-800 mb-1">{T("enterOtp")}</h2>
                  <p className="text-sm text-gray-500 mb-1">{T("sentTo_")} <strong className="text-gray-700">+92{regPhone}</strong></p>
                  {regDevOtp && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 mb-3">
                      <p className="text-xs text-orange-600 font-bold uppercase tracking-wide mb-0.5">{T("devOtp")}</p>
                      <p className="text-orange-700 font-extrabold text-xl tracking-[0.4em]">{regDevOtp}</p>
                    </div>
                  )}
                  {/* 6-box OTP */}
                  <div className="relative mb-2">
                    <div className="flex gap-2 justify-center pointer-events-none select-none" aria-hidden>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className={`w-11 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${
                          regOtp[i] ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-200 bg-gray-50 text-gray-300"
                        }`}>
                          {regOtp[i] || "·"}
                        </div>
                      ))}
                    </div>
                    <input type="text" inputMode="numeric" value={regOtp}
                      onChange={e => setRegOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={e => e.key === "Enter" && verifyRegOtp()}
                      className="absolute inset-0 opacity-0 w-full cursor-text" maxLength={6} autoFocus aria-label="Enter 6-digit OTP" />
                  </div>
                  <p className="text-center text-xs text-gray-400 mb-3">Tap above and type your 6-digit code</p>
                </>
              )}

              {step === "register-info" && (
                <>
                  <button onClick={() => { setStep("register"); clearError(); }}
                    className="text-orange-600 text-sm font-bold mb-4 flex items-center gap-1.5 hover:text-orange-700 transition-colors">← Back</button>
                  <h2 className="text-lg font-extrabold text-gray-800 mb-1">Store Information</h2>
                  <p className="text-sm text-gray-500 mb-4">Fill in your store details to complete registration</p>

                  <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                    <div>
                      <label className={LABEL_CLS}>Store Name *</label>
                      <input value={regForm.storeName} onChange={e => rf("storeName", e.target.value)} placeholder="e.g. Ali's Grocery Store" className={INPUT_CLS} />
                    </div>
                    <div>
                      <label className={LABEL_CLS}>Store Category</label>
                      <select value={regForm.storeCategory} onChange={e => rf("storeCategory", e.target.value)} className={SELECT_CLS}>
                        <option value="">Select category...</option>
                        {STORE_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL_CLS}>Your Full Name *</label>
                      <input value={regForm.name} onChange={e => rf("name", e.target.value)} placeholder="Muhammad Ali" className={INPUT_CLS} />
                    </div>
                    <div>
                      <label className={LABEL_CLS}>Username *</label>
                      <div className="relative">
                        <input value={regUsername}
                          onChange={e => { setRegUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20)); clearError(); }}
                          placeholder="e.g. alistore" className={INPUT_CLS + " pr-10"} autoCapitalize="none" autoCorrect="off" />
                        {regUsernameStatus === "checking" && <span className="absolute right-3 top-3.5 text-gray-400 text-sm animate-spin">⏳</span>}
                        {regUsernameStatus === "available" && <span className="absolute right-3 top-3.5 text-orange-500 text-sm font-bold">✓</span>}
                        {regUsernameStatus === "taken" && <span className="absolute right-3 top-3.5 text-red-500 text-sm font-bold">✗</span>}
                      </div>
                      {regUsernameStatus === "taken" && <p className="text-[10px] text-red-500 mt-0.5 font-medium">Username already taken</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={LABEL_CLS}>CNIC Number</label>
                        <input value={regForm.cnic} onChange={e => rf("cnic", e.target.value)} placeholder="xxxxx-xxxxxxx-x" className={INPUT_CLS} inputMode="numeric" />
                      </div>
                      <div>
                        <label className={LABEL_CLS}>City</label>
                        <select value={regForm.city} onChange={e => rf("city", e.target.value)} className={SELECT_CLS}>
                          <option value="">Select...</option>
                          {(config.cities?.length ? config.cities : CITIES).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className={LABEL_CLS}>Store Address</label>
                      <input value={regForm.address} onChange={e => rf("address", e.target.value)} placeholder="Full address..." className={INPUT_CLS} />
                    </div>
                    <div className="border-t border-gray-100 pt-3">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Bank / Wallet Details (Optional)</p>
                      <div className="space-y-3">
                        <div>
                          <label className={LABEL_CLS}>Bank / Wallet</label>
                          <select value={regForm.bankName} onChange={e => rf("bankName", e.target.value)} className={SELECT_CLS}>
                            <option value="">Select...</option>
                            {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={LABEL_CLS}>Account Number</label>
                            <input value={regForm.bankAccount} onChange={e => rf("bankAccount", e.target.value)} placeholder="Account #" className={INPUT_CLS} />
                          </div>
                          <div>
                            <label className={LABEL_CLS}>Account Title</label>
                            <input value={regForm.bankAccountTitle} onChange={e => rf("bankAccountTitle", e.target.value)} placeholder="Account holder" className={INPUT_CLS} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <label className="flex items-start gap-3 mt-4 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={regTermsAccepted}
                      onChange={e => setRegTermsAccepted(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-orange-500 flex-shrink-0 cursor-pointer"
                    />
                    <span className="text-xs text-gray-500 leading-relaxed">
                      I have read and agree to the{" "}
                      {config.content.tncUrl ? (
                        <a href={config.content.tncUrl} target="_blank" rel="noopener noreferrer" className="text-orange-600 font-semibold hover:underline">Terms & Conditions</a>
                      ) : (
                        <span className="text-orange-600 font-semibold">Terms & Conditions</span>
                      )}
                      {config.content.privacyUrl ? (
                        <> and <a href={config.content.privacyUrl} target="_blank" rel="noopener noreferrer" className="text-orange-600 font-semibold hover:underline">Privacy Policy</a></>
                      ) : null}
                    </span>
                  </label>
                </>
              )}

              {error && (
                <div className="mb-3 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                  <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-red-600 text-sm font-medium">{error}</p>
                </div>
              )}

              {step === "register" && (
                <button onClick={sendRegOtp} disabled={loading}
                  className="w-full h-12 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-all disabled:opacity-60 flex items-center justify-center gap-2 text-sm mt-2 shadow-sm shadow-orange-200">
                  {loading ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Please wait...</> : "Send OTP →"}
                </button>
              )}

              {step === "register-otp" && (
                <>
                  <button onClick={verifyRegOtp} disabled={loading}
                    className="w-full h-12 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-all disabled:opacity-60 flex items-center justify-center gap-2 text-sm shadow-sm shadow-orange-200">
                    {loading ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Verifying...</> : "Verify & Continue →"}
                  </button>
                  <button
                    onClick={() => { if (resendCooldown > 0) return; sendRegOtp(); }}
                    disabled={resendCooldown > 0}
                    className="w-full mt-3 text-sm text-gray-400 hover:text-orange-600 font-medium py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {resendCooldown > 0 ? `${T("resendOtp")} (${resendCooldown}s)` : T("resendOtp")}
                  </button>
                </>
              )}

              {step === "register-info" && (
                <button onClick={submitRegistration} disabled={loading || !regForm.storeName.trim() || !regForm.name.trim() || !regTermsAccepted}
                  className="w-full h-12 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-all disabled:opacity-60 flex items-center justify-center gap-2 text-sm mt-4 shadow-sm shadow-orange-200">
                  {loading ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Submitting...</> : "Submit Application ✓"}
                </button>
              )}

              <button onClick={() => { setStep("input"); clearError(); }}
                className="w-full mt-3 text-sm text-gray-400 hover:text-orange-600 font-medium py-2 transition-colors">
                ← Already have an account? Login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row" style={{ paddingTop: "env(safe-area-inset-top,0px)" }}>

      <div className="hidden md:flex md:w-1/2 lg:w-2/5 bg-gradient-to-br from-orange-700 via-orange-600 to-amber-600 flex-col justify-between p-10 relative overflow-hidden flex-shrink-0">
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-white/10 rounded-full pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-amber-300/10 rounded-full pointer-events-none" />
        <div className="absolute top-1/3 right-0 w-40 h-40 bg-white/5 rounded-full pointer-events-none" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-12 h-12 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/20 shadow-lg"><span className="text-2xl">🏪</span></div>
          <div>
            <p className="text-white font-extrabold text-xl leading-tight">{appName}</p>
            <p className="text-orange-200 text-sm font-medium">{T("vendorPortal")}</p>
          </div>
        </div>

        <div className="relative z-10">
          <h1 className="text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-4">
            {T("growBusiness")}<br /><span className="text-orange-200">{appName}</span>
          </h1>
          <p className="text-orange-100 text-lg font-medium mb-10 leading-relaxed">
            {T("manageDescription")}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {FEATURES.map(f => (
              <div key={f.titleKey} className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                <span className="text-2xl mb-2 block">{f.icon}</span>
                <p className="text-white font-bold text-sm">{T(f.titleKey)}</p>
                <p className="text-orange-100 text-xs mt-0.5">{T(f.descKey)}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 bg-orange-400/20 border border-orange-300/30 rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="text-2xl">💰</span>
            <div>
              <p className="text-white font-extrabold text-lg leading-tight">Keep {vendorEarningsPct}%</p>
              <p className="text-orange-100 text-xs">{T("vendorEarningsLabel")}</p>
            </div>
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-orange-300 text-sm">© {new Date().getFullYear()} {appName} · {businessAddress}</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-slate-50">

        {/* Mobile hero header */}
        <div className="md:hidden bg-gradient-to-br from-orange-700 to-amber-600 px-6 pt-10 pb-12 relative overflow-hidden flex-shrink-0">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full -translate-y-16 translate-x-16 pointer-events-none" />
          <div className="absolute -bottom-10 left-0 w-40 h-40 bg-amber-300/15 rounded-full pointer-events-none" />
          <div className="relative z-10 flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center border border-white/30"><span className="text-2xl">🏪</span></div>
            <div>
              <p className="text-white font-extrabold text-xl">{T("vendorPortal")}</p>
              <p className="text-orange-200 text-sm">{appName}</p>
            </div>
          </div>
          <p className="relative z-10 text-orange-100 text-sm font-medium">{appName} {T("businessPartner")}</p>
        </div>

        {/* Form area */}
        <div className="flex-1 flex items-start md:items-center justify-center px-5 py-6 md:p-10 -mt-6 md:mt-0">
          <div className="w-full max-w-sm">

            {/* Desktop heading */}
            <div className="hidden md:block mb-7">
              <h2 className="text-3xl font-extrabold text-gray-900">{T("vendorWelcome")} 👋</h2>
              <p className="text-gray-500 mt-1">{T("loginToVendor")}</p>
            </div>

            {/* White form card */}
            <div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-6">
              {config.content.vendorNotice && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2">
                  <AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-amber-700 text-xs font-medium leading-relaxed">{config.content.vendorNotice}</p>
                </div>
              )}

              {step === "continue" && (
                <>
                  <h2 className="text-xl font-extrabold text-gray-800 mb-1 md:hidden">Welcome Back 👋</h2>
                  <p className="text-sm text-gray-500 mb-5 md:hidden">Enter your credentials to continue</p>

                  <div className="mb-4">
                    <label className="text-xs font-extrabold text-gray-400 mb-2 block uppercase tracking-wider">Phone / Email / Username</label>
                    <div className="relative">
                      <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="+923001234567 · email · username"
                        value={identifier}
                        onChange={e => setIdentifier(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && checkIdentifier()}
                        className="w-full h-12 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                        autoFocus
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5">
                      <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-red-600 text-sm font-medium">{error}</p>
                    </div>
                  )}

                  <button onClick={checkIdentifier} disabled={loading}
                    className="w-full h-12 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-all disabled:opacity-60 flex items-center justify-center gap-2 text-sm shadow-sm shadow-orange-200">
                    {loading ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Checking...</> : "Continue →"}
                  </button>

                  {(hasSocial || hasMagicLink) && (
                    <>
                      <div className="flex items-center gap-3 my-4">
                        <div className="flex-1 h-px bg-gray-200" />
                        <span className="text-xs text-gray-400 font-medium">or continue with</span>
                        <div className="flex-1 h-px bg-gray-200" />
                      </div>
                      <div className="space-y-2.5">
                        {vendorAuth.google && (
                          <button onClick={handleSocialGoogle} disabled={loading || !googleClientId}
                            className="w-full h-11 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2.5 disabled:opacity-60">
                            <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
                            Sign in with Google
                          </button>
                        )}
                        {vendorAuth.facebook && (
                          <button onClick={handleSocialFacebook} disabled={loading || !facebookAppId}
                            className="w-full h-11 bg-[#1877F2] hover:bg-[#166FE5] rounded-xl text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2.5 disabled:opacity-60">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                            Sign in with Facebook
                          </button>
                        )}
                        {vendorAuth.magicLink && (
                          <div className="mt-1">
                            <MagicLinkSender onSend={handleMagicLinkSend} title="Magic Link Login" subtitle="Enter your email to receive a login link" />
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  <div className="mt-4 text-center">
                    <p className="text-sm text-gray-400">New vendor?{" "}
                      <button onClick={() => { clearError(); setStep("register"); }}
                        className="text-orange-600 font-bold hover:underline">Register your store</button>
                    </p>
                  </div>
                </>
              )}

              {step === "input" && (
                <>
                  <button onClick={() => { setStep("continue"); clearError(); setOtp(""); setEmailOtp(""); setDevOtp(""); setEmailDevOtp(""); }}
                    className="text-orange-600 text-sm font-bold mb-4 flex items-center gap-1.5 hover:text-orange-700 transition-colors">← Change identifier</button>
                  {availableMethods.length > 1 && (
                    <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 mb-5">
                      {availableMethods.map(m => (
                        <button key={m} onClick={() => selectMethod(m)}
                          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                            method === m ? "bg-white text-orange-700 shadow-sm ring-1 ring-gray-200" : "text-gray-400 hover:text-gray-600"
                          }`}>
                          {m === "phone" ? <><Phone size={12} /> {T("phone")}</> : m === "email" ? <><Mail size={12} /> {T("email")}</> : <><User size={12} /> {T("usernameLabel")}</>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {step === "otp" && (
                <button onClick={() => { setStep("continue"); clearError(); setDevOtp(""); setEmailDevOtp(""); }}
                  className="text-orange-600 text-sm font-bold mb-4 flex items-center gap-1.5 hover:text-orange-700 transition-colors">← {T("back")}</button>
              )}

              {method === "phone" && step === "input" && (
                <>
                  <h2 className="text-xl font-extrabold text-gray-800 mb-1 md:hidden">{T("welcomeBackExcl")}</h2>
                  <p className="text-sm text-gray-500 mb-4">{T("enterPhoneNumber")}</p>
                  <div className="mb-4">
                    <label className="text-xs font-extrabold text-gray-400 mb-2 block uppercase tracking-wider">{T("phoneNumberLabel")}</label>
                    <div className="flex gap-2">
                      <div className="h-12 px-3 bg-gray-100 border border-gray-200 rounded-xl flex items-center text-sm font-bold text-gray-600 flex-shrink-0 gap-1.5">🇵🇰 +92</div>
                      <div className="relative flex-1">
                        <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        <input type="tel" placeholder={phoneHint} value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()}
                          className="w-full h-12 pl-8 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all" autoFocus inputMode="tel" />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {method === "phone" && step === "otp" && (
                <>
                  {otpBypassActive && !bypassBannerDismissed && (
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-4 flex items-start gap-2">
                      <AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-amber-800 text-xs font-semibold leading-relaxed">
                          {otpBypassMessage || "OTP verification is temporarily disabled. You will be logged in automatically."}
                        </p>
                        {bypassRemainingSeconds > 0 && (
                          <p className="text-amber-600 text-[10px] mt-0.5">
                            Expires in {Math.floor(bypassRemainingSeconds / 60)}m {bypassRemainingSeconds % 60}s
                          </p>
                        )}
                      </div>
                      <button onClick={() => setBypassBannerDismissed(true)} className="text-amber-400 hover:text-amber-600 flex-shrink-0" aria-label="Dismiss">
                        <X size={13} />
                      </button>
                    </div>
                  )}
                  <h2 className="text-xl font-extrabold text-gray-800 mb-1">{T("enterOtp")}</h2>
                  <div className="flex items-center gap-2 mb-4">
                    <p className="text-sm text-gray-500">{T("sentTo_")} <strong className="text-gray-700">+92{phone}</strong></p>
                    {otpChannel && (
                      <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        via {otpChannel === "whatsapp" ? "📱 WhatsApp" : otpChannel === "email" ? "✉️ Email" : "💬 SMS"}
                      </span>
                    )}
                    {fallbackChannels.length > 0 && fallbackChannels.map(ch => (
                      <button key={ch} onClick={() => { if (resendCooldown <= 0) sendPhoneOtp(ch); }}
                        disabled={resendCooldown > 0}
                        className="text-xs text-orange-600 hover:text-orange-700 font-bold disabled:opacity-40">
                        · Via {ch === "whatsapp" ? "WhatsApp" : ch === "email" ? "Email" : "SMS"}
                      </button>
                    ))}
                  </div>
                  {devOtp && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 mb-4">
                      <p className="text-xs text-orange-600 font-bold uppercase tracking-wide mb-0.5">{T("devOtp")}</p>
                      <p className="text-orange-700 font-extrabold text-xl tracking-[0.4em]">{devOtp}</p>
                    </div>
                  )}
                  {/* 6-box OTP cells */}
                  <div className="relative mb-2">
                    <div className="flex gap-2 justify-center pointer-events-none select-none" aria-hidden>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className={`w-11 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${
                          otp[i] ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-200 bg-gray-50 text-gray-300"
                        }`}>
                          {otp[i] || "·"}
                        </div>
                      ))}
                    </div>
                    <input type="text" inputMode="numeric" value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={e => e.key === "Enter" && handleSubmit()}
                      className="absolute inset-0 opacity-0 w-full cursor-text" maxLength={6} autoFocus aria-label="Enter 6-digit OTP" />
                  </div>
                  <p className="text-center text-xs text-gray-400 mb-3">Tap above and type your 6-digit code</p>
                </>
              )}

              {method === "email" && step === "input" && (
                <>
                  <p className="text-sm text-gray-500 mb-4">{T("loginWith")} {T("email")}</p>
                  <label className="text-xs font-extrabold text-gray-400 mb-2 block uppercase tracking-wider">{T("emailAddress")}</label>
                  <div className="relative mb-4">
                    <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input type="email" placeholder="your@business.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()}
                      className="w-full h-12 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all" autoFocus />
                  </div>
                </>
              )}

              {method === "email" && step === "otp" && (
                <>
                  <h2 className="text-xl font-extrabold text-gray-800 mb-1">{T("enterEmailOtp")}</h2>
                  <p className="text-sm text-gray-500 mb-1">{T("sentTo_")} <strong className="text-gray-700">{email}</strong></p>
                  {otpChannel === "email" && (
                    <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full inline-block mb-4">via ✉️ Email</span>
                  )}
                  {emailDevOtp && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 mb-4">
                      <p className="text-xs text-orange-600 font-bold uppercase tracking-wide mb-0.5">{T("devOtp")}</p>
                      <p className="text-orange-700 font-extrabold text-xl tracking-[0.4em]">{emailDevOtp}</p>
                    </div>
                  )}
                  {/* 6-box OTP cells */}
                  <div className="relative mb-2">
                    <div className="flex gap-2 justify-center pointer-events-none select-none" aria-hidden>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className={`w-11 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${
                          emailOtp[i] ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-200 bg-gray-50 text-gray-300"
                        }`}>
                          {emailOtp[i] || "·"}
                        </div>
                      ))}
                    </div>
                    <input type="text" inputMode="numeric" value={emailOtp}
                      onChange={e => setEmailOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={e => e.key === "Enter" && handleSubmit()}
                      className="absolute inset-0 opacity-0 w-full cursor-text" maxLength={6} autoFocus aria-label="Enter 6-digit email OTP" />
                  </div>
                  <p className="text-center text-xs text-gray-400 mb-3">Tap above and type your 6-digit code</p>
                </>
              )}

              {method === "username" && step === "input" && (
                <>
                  <p className="text-sm text-gray-500 mb-4">Phone, email, or username</p>
                  <label className="text-xs font-extrabold text-gray-400 mb-2 block uppercase tracking-wider">Identifier</label>
                  <div className="relative mb-3">
                    <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input type="text" placeholder="Phone, email, or username" value={username} onChange={e => setUsername(e.target.value.trim())} onKeyDown={e => e.key === "Enter" && handleSubmit()}
                      className="w-full h-12 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all" autoFocus autoCapitalize="none" />
                  </div>
                  <label className="text-xs font-extrabold text-gray-400 mb-2 block uppercase tracking-wider">{T("passwordLabel")}</label>
                  <div className="relative mb-2">
                    <input type={showPwd ? "text" : "password"} placeholder="Your password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()}
                      className="w-full h-12 px-4 pr-12 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all" />
                    <button onClick={() => setShowPwd(v => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                      {showPwd ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  <button onClick={() => { setStep("forgot"); clearError(); setForgotIdentifier(username); }} className="text-sm text-orange-600 hover:text-orange-700 font-semibold mb-3 ml-auto block text-right transition-colors">
                    Forgot Password?
                  </button>
                </>
              )}

              {step === "forgot" && (
                <>
                  <button onClick={() => { setStep("input"); clearError(); }} className="text-sm text-orange-600 hover:text-orange-700 font-bold mb-4 flex items-center gap-1.5 transition-colors">← Back to Login</button>
                  <h2 className="text-xl font-extrabold text-gray-800 mb-1">Reset Password</h2>
                  <p className="text-sm text-gray-500 mb-4">Enter your phone, email, or username</p>
                  <div className="relative mb-4">
                    <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input type="text" placeholder="Phone, email, or username" value={forgotIdentifier} onChange={e => setForgotIdentifier(e.target.value.trim())} onKeyDown={e => e.key === "Enter" && sendForgotOtp()}
                      className="w-full h-12 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all" autoFocus autoCapitalize="none" />
                  </div>
                </>
              )}

              {step === "forgot-otp" && (
                <>
                  <button onClick={() => { setStep("forgot"); clearError(); }} className="text-sm text-orange-600 hover:text-orange-700 font-bold mb-4 flex items-center gap-1.5 transition-colors">← Back</button>
                  <h2 className="text-xl font-extrabold text-gray-800 mb-1">Enter Reset Code</h2>
                  <p className="text-sm text-gray-500 mb-1">A code was sent to your phone or email</p>
                  {forgotDevOtp && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 mb-3">
                      <p className="text-xs text-orange-600 font-bold uppercase tracking-wide mb-0.5">DEV OTP</p>
                      <p className="text-orange-700 font-extrabold text-xl tracking-[0.4em]">{forgotDevOtp}</p>
                    </div>
                  )}
                  {/* 6-box OTP cells */}
                  <div className="relative mb-2">
                    <div className="flex gap-2 justify-center pointer-events-none select-none" aria-hidden>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className={`w-11 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${
                          forgotOtp[i] ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-200 bg-gray-50 text-gray-300"
                        }`}>
                          {forgotOtp[i] || "·"}
                        </div>
                      ))}
                    </div>
                    <input type="text" inputMode="numeric" value={forgotOtp}
                      onChange={e => setForgotOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={e => e.key === "Enter" && setStep("forgot-reset")}
                      className="absolute inset-0 opacity-0 w-full cursor-text" maxLength={6} autoFocus aria-label="Enter reset code" />
                  </div>
                  <p className="text-center text-xs text-gray-400 mb-3">Tap above and type your 6-digit reset code</p>
                </>
              )}

              {step === "forgot-reset" && (
                <>
                  <button onClick={() => { setStep("forgot-otp"); clearError(); }} className="text-sm text-orange-600 hover:text-orange-700 font-bold mb-4 flex items-center gap-1.5 transition-colors">← Back</button>
                  <h2 className="text-xl font-extrabold text-gray-800 mb-1">Set New Password</h2>
                  <p className="text-sm text-gray-500 mb-4">Choose a strong password</p>
                  <label className="text-xs font-extrabold text-gray-400 mb-2 block uppercase tracking-wider">New Password</label>
                  <div className="relative mb-3">
                    <input type={showForgotPwd ? "text" : "password"} placeholder="Min 8 chars, 1 uppercase, 1 number" value={forgotNewPwd} onChange={e => setForgotNewPwd(e.target.value)}
                      className="w-full h-12 px-4 pr-12 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all" />
                    <button onClick={() => setShowForgotPwd(v => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                      {showForgotPwd ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  <label className="text-xs font-extrabold text-gray-400 mb-2 block uppercase tracking-wider">Confirm Password</label>
                  <input type="password" placeholder="Re-enter password" value={forgotConfirmPwd} onChange={e => setForgotConfirmPwd(e.target.value)} onKeyDown={e => e.key === "Enter" && resetForgotPassword()}
                    className="w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent mb-4 transition-all" />
                </>
              )}

              {step === "forgot-done" && (
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">✓</span>
                  </div>
                  <h2 className="text-xl font-extrabold text-gray-800 mb-2">Password Reset!</h2>
                  <p className="text-sm text-gray-500 mb-4">Your password has been changed successfully. You can now log in.</p>
                  <button onClick={() => { setStep("input"); setMethod("username"); clearError(); }}
                    className="text-orange-600 font-bold hover:text-orange-700 transition-colors">← Back to Login</button>
                </div>
              )}

              {vendorAuth.lockoutEnabled && failedAttempts > 0 && !isLockedOut && (step === "input" || step === "otp") && (() => {
                const remaining = (vendorAuth.lockoutMaxAttempts ?? 5) - failedAttempts;
                const alts: { m: LoginMethod; label: string; icon: ReactNode }[] = [];
                if (method !== "phone" && vendorAuth.phoneOtp) alts.push({ m: "phone", label: "Phone OTP", icon: <Phone size={11} /> });
                if (method !== "email" && vendorAuth.emailOtp) alts.push({ m: "email", label: "Email OTP", icon: <Mail size={11} /> });
                if (method !== "username" && vendorAuth.usernamePassword) alts.push({ m: "username", label: "Password", icon: <User size={11} /> });
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-3">
                    <p className="text-xs text-amber-700 font-semibold mb-1">
                      ⚠️ {failedAttempts} failed attempt{failedAttempts > 1 ? "s" : ""} &middot; {remaining} remaining
                    </p>
                    {alts.length > 0 && (
                      <>
                        <p className="text-[10px] text-amber-600 mb-1.5">Try a different sign-in method:</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {alts.map(({ m, label, icon }) => (
                            <button key={m} onClick={() => selectMethod(m)}
                              className="flex items-center gap-1 text-[11px] bg-white border border-amber-300 text-amber-800 rounded-lg px-2.5 py-1 font-semibold hover:bg-amber-100 transition-colors">
                              {icon} {label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}

              {step !== "continue" && error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5">
                  <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-red-600 text-sm font-medium">{error}</p>
                </div>
              )}

              {step !== "continue" && step !== "forgot-done" && method !== "google" && method !== "facebook" && (
                <button onClick={
                  step === "forgot" ? sendForgotOtp
                  : step === "forgot-otp" ? () => setStep("forgot-reset")
                  : step === "forgot-reset" ? resetForgotPassword
                  : handleSubmit
                } disabled={loading}
                  className="w-full h-12 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-all disabled:opacity-60 flex items-center justify-center gap-2 text-sm shadow-sm shadow-orange-200">
                  {loading
                    ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> {T("pleaseWait")}</>
                    : step === "forgot" ? "Send Reset Code →"
                    : step === "forgot-otp" ? "Continue →"
                    : step === "forgot-reset" ? "Reset Password ✓"
                    : method === "phone"
                      ? (step === "input" ? `${T("sendOtp")} →` : `${T("verifyLogin")} ✓`)
                      : method === "email"
                      ? (step === "input" ? `${T("sendOtp")} →` : `${T("verifyLogin")} ✓`)
                      : `${T("login")} →`
                  }
                </button>
              )}

              {step === "input" && (method === "google" || method === "facebook") && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500 text-center mb-2">
                    {method === "google" ? "Sign in with your Google account" : "Sign in with your Facebook account"}
                  </p>
                  {method === "google" && (
                    <button onClick={handleSocialGoogle} disabled={loading}
                      className="w-full h-11 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2.5 disabled:opacity-60">
                      <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
                      Sign in with Google
                    </button>
                  )}
                  {method === "facebook" && (
                    <button onClick={handleSocialFacebook} disabled={loading}
                      className="w-full h-11 bg-[#1877F2] hover:bg-[#166FE5] rounded-xl text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2.5 disabled:opacity-60">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                      Sign in with Facebook
                    </button>
                  )}
                  <button onClick={() => { setStep("continue"); clearError(); }}
                    className="w-full text-sm text-gray-400 hover:text-orange-600 font-medium py-2 transition-colors">
                    ← Back to login
                  </button>
                </div>
              )}

              {step === "otp" && (
                <button
                  onClick={() => { if (resendCooldown > 0) return; (method === "phone" ? sendPhoneOtp : sendEmailOtp)(); }}
                  disabled={resendCooldown > 0}
                  className="w-full mt-3 text-sm text-gray-400 hover:text-orange-600 font-medium py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {resendCooldown > 0 ? `${T("resendOtp")} (${resendCooldown}s)` : T("resendOtp")}
                </button>
              )}

              {step !== "continue" && (
                <div className="border-t border-gray-100 mt-5 pt-4">
                  <button onClick={() => { setStep("register"); clearError(); }}
                    className="w-full h-11 border-2 border-orange-200 text-orange-700 font-bold rounded-2xl transition-all hover:bg-orange-50 text-sm flex items-center justify-center gap-2">
                    🏪 Become a Vendor / Register
                  </button>
                </div>
              )}

              {(config.platform.supportPhone || config.platform.supportEmail || config.content.tncUrl || config.content.privacyUrl) && (
                <div className="border-t border-gray-100 mt-5 pt-4 space-y-2">
                  {(config.platform.supportPhone || config.platform.supportEmail) && (
                    <p className="text-center text-xs text-gray-400">
                      Support:{" "}
                      {config.platform.supportPhone && <span className="font-semibold text-gray-500">{config.platform.supportPhone}</span>}
                      {config.platform.supportPhone && config.platform.supportEmail && " · "}
                      {config.platform.supportEmail && <span className="text-gray-500">{config.platform.supportEmail}</span>}
                    </p>
                  )}
                  {(config.content.tncUrl || config.content.privacyUrl) && (
                    <div className="flex items-center justify-center gap-3">
                      {config.content.tncUrl && (
                        <a href={config.content.tncUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-gray-400 hover:text-orange-600 underline underline-offset-2">Terms</a>
                      )}
                      {config.content.tncUrl && config.content.privacyUrl && <span className="text-gray-300 text-xs">·</span>}
                      {config.content.privacyUrl && (
                        <a href={config.content.privacyUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-gray-400 hover:text-orange-600 underline underline-offset-2">Privacy Policy</a>
                      )}
                    </div>
                  )}
                </div>
              )}
              <p className="text-center text-xs text-gray-400 mt-4">{T("onlyVendorsAccess")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
