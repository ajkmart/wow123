import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { api, isApiError } from "../lib/api";
import { riderIsDev } from "../lib/envValidation";
import { usePlatformConfig, getRiderAuthConfig, buildPhoneValidator } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { executeCaptcha, loadGoogleGSIToken, loadFacebookAccessToken, decodeGoogleJwtPayload, formatPhoneForApi } from "@workspace/auth-utils";
import { useAuth, type AuthUser } from "../lib/auth";
import {
  Bike, ArrowLeft, ArrowRight, Loader2, Eye, EyeOff,
  Clock, User, Phone, Mail, FileText, Car, Shield, Lightbulb,
  MapPin, AlertCircle, Camera, Upload, X, CheckCircle2, Image, Wrench, Lock,
} from "lucide-react";
import { SafeImage } from "../components/ui/SafeImage";

function formatPhoneForRegister(localDigits: string): string {
  const digits = localDigits.replace(/\D/g, "");
  const raw = digits.startsWith("0") ? digits : `0${digits}`;
  if (raw.length === 11) return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  return raw;
}

function getPasswordStrength(pw: string): { level: number; label: TranslationKey; color: string; width: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { level: 1, label: "passwordWeak", color: "bg-red-500", width: "w-1/4" };
  if (score <= 2) return { level: 2, label: "passwordFair", color: "bg-orange-500", width: "w-2/4" };
  if (score <= 3) return { level: 3, label: "passwordGood", color: "bg-yellow-500", width: "w-3/4" };
  return { level: 4, label: "passwordStrong", color: "bg-green-500", width: "w-full" };
}

function formatCnic(val: string): string {
  const digits = val.replace(/\D/g, "").slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

const VEHICLE_TYPES = [
  { value: "bike", labelKey: "bikeMotorcycle" as TranslationKey },
  { value: "car", labelKey: "carVehicle" as TranslationKey },
  { value: "rickshaw", labelKey: "rickshawVan" as TranslationKey },
  { value: "van", labelKey: "vanVehicle" as TranslationKey },
];

const AJK_CITIES = [
  "Muzaffarabad", "Mirpur", "Rawalakot", "Bagh", "Kotli",
  "Bhimber", "Pallandri", "Hajira", "Athmuqam", "Hattian Bala",
  "Neelum", "Haveli", "Jhelum Valley", "Other",
];

const INPUT = "w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:bg-white transition-all";
const SELECT = "w-full h-12 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 appearance-none transition-all";

interface UploadedDoc {
  label: string;
  url: string;
  preview: string;
}

function FileUploadBox({ label, icon, value, onChange, required, uploading, error }: {
  label: string; icon: React.ReactNode; value: UploadedDoc | null;
  onChange: (file: File) => void; required?: boolean; uploading?: boolean; error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  return (
    <div>
      <div className={`border-2 border-dashed rounded-xl p-3 transition-all ${error ? "border-red-400 bg-red-50/50" : value ? "border-green-300 bg-green-50/50" : "border-gray-200 bg-gray-50/50 hover:border-gray-400"}`}>
        <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => { if (e.target.files?.[0]) onChange(e.target.files[0]); }} />
        {value ? (
          <div className="flex items-center gap-3">
            <SafeImage src={value.preview} alt={label} className="w-14 h-14 rounded-lg object-cover border border-green-200" loading="eager" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-green-700 flex items-center gap-1"><CheckCircle2 size={12} /> {label}</p>
              <p className="text-[10px] text-green-600 truncate">{value.url ? T("photoUploaded") : T("photoReady2")}</p>
            </div>
            <button onClick={() => inputRef.current?.click()} className="text-[10px] text-gray-600 font-bold hover:text-gray-900 px-2 py-1 rounded-lg hover:bg-gray-100">
              {T("changePhoto")}
            </button>
          </div>
        ) : (
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            className="w-full flex flex-col items-center gap-1.5 py-2 disabled:opacity-50">
            {uploading ? <Loader2 size={20} className="text-gray-500 animate-spin" /> : icon}
            <span className={`text-xs font-semibold ${error ? "text-red-600" : "text-gray-600"}`}>{label} {required && <span className="text-red-500">*</span>}</span>
            <span className="text-[10px] text-gray-400">{T("tapCaptureUpload")}</span>
          </button>
        )}
      </div>
      {error && <p className="text-[10px] text-red-500 mt-1 font-medium">{error}</p>}
    </div>
  );
}

export default function Register() {
  const { config } = usePlatformConfig();
  const { login: authLogin } = useAuth();
  const [, navigate] = useLocation();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  const auth = getRiderAuthConfig(config);
  const captchaSiteKey = config.auth?.captchaSiteKey;
  const isValidPhone = buildPhoneValidator(config);
  const phoneHint = config.regional?.phoneHint ?? "03XXXXXXXXX";

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [existingAccountError, setExistingAccountError] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [customCity, setCustomCity] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");

  const [cnic, setCnic] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleReg, setVehicleReg] = useState("");
  const [drivingLicense, setDrivingLicense] = useState("");

  const [vehiclePhoto, setVehiclePhoto] = useState<UploadedDoc | null>(null);
  const [cnicPhoto, setCnicPhoto] = useState<UploadedDoc | null>(null);
  const [cnicBackPhoto, setCnicBackPhoto] = useState<UploadedDoc | null>(null);
  const [licensePhoto, setLicensePhoto] = useState<UploadedDoc | null>(null);
  const [uploadingField, setUploadingField] = useState("");
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [registrationNote, setRegistrationNote] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [verifyChannel, setVerifyChannel] = useState<"phone" | "email">("phone");
  const [otpSendFailed, setOtpSendFailed] = useState(false);
  const [resendingOtp, setResendingOtp] = useState(false);

  const [completed, setCompleted] = useState(false);

  const availabilityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [availabilityStatus, setAvailabilityStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");

  const clearError = () => { setError(""); setExistingAccountError(false); };

  const handleFileUpload = useCallback(async (file: File, field: string, setter: (doc: UploadedDoc) => void) => {
    setUploadingField(field);
    setUploadErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
    try {
      const preview = URL.createObjectURL(file);
      const res = await api.uploadRegistrationDoc(file);
      setter({ label: file.name, url: res.url, preview });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : T("uploadFailed");
      setUploadErrors(prev => ({ ...prev, [field]: msg }));
    }
    setUploadingField("");
  }, []);

  const usernameAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!username || username.length < 3) { setUsernameStatus("idle"); return; }
    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    usernameTimer.current = setTimeout(async () => {
      /* Abort any in-flight request from a previous keystroke */
      if (usernameAbortRef.current) usernameAbortRef.current.abort();
      usernameAbortRef.current = new AbortController();
      setUsernameStatus("checking");
      try {
        const res = await api.checkAvailable({ username }, usernameAbortRef.current?.signal);
        if (res.username && !res.username.available) setUsernameStatus("taken");
        else setUsernameStatus("available");
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return;
        setUsernameStatus("taken");
      }
    }, 600);
    return () => {
      if (usernameTimer.current) clearTimeout(usernameTimer.current);
      if (usernameAbortRef.current) usernameAbortRef.current.abort();
    };
  }, [username]);

  useEffect(() => {
    if (name && !username) {
      const suggested = name.trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
      if (suggested.length >= 3) setUsername(suggested);
    }
  }, [name]);

  useEffect(() => {
    if (!phone || phone.length < 10 || !email || !email.includes("@")) {
      setAvailabilityStatus("idle");
      return;
    }
    if (availabilityTimer.current) clearTimeout(availabilityTimer.current);
    availabilityTimer.current = setTimeout(async () => {
      setAvailabilityStatus("checking");
      try {
        await api.checkAvailable({ phone: formatPhoneForApi(phone), email });
        setAvailabilityStatus("available");
      } catch {
        setAvailabilityStatus("taken");
      }
    }, 800);
    return () => { if (availabilityTimer.current) clearTimeout(availabilityTimer.current); };
  }, [phone, email]);

  const handleSocialAutofill = async (provider: "google" | "facebook") => {
    const googleClientId = config.auth?.googleClientId;
    const facebookAppId = config.auth?.facebookAppId;
    if (provider === "google" && !googleClientId) { setError(T("socialLoginComingSoon")); return; }
    if (provider === "facebook" && !facebookAppId) { setError(T("socialLoginComingSoon")); return; }
    setLoading(true); clearError();
    try {
      if (provider === "google") {
        const idToken = await loadGoogleGSIToken(googleClientId!);
        const payload = decodeGoogleJwtPayload(idToken);
        if (payload.name) setName(payload.name);
        if (payload.email) setEmail(payload.email);
      } else {
        const accessToken = await loadFacebookAccessToken(facebookAppId!);
        const fbRes = await fetch(`https://graph.facebook.com/me?fields=name,email&access_token=${accessToken}`);
        if (!fbRes.ok) throw new Error("Failed to fetch Facebook profile");
        const fbData = await fbRes.json();
        if (fbData.error) throw new Error(fbData.error.message || "Facebook profile error");
        if (fbData.name) setName(fbData.name);
        if (fbData.email) setEmail(fbData.email);
      }
      setStep(2);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : T("loginFailed")); }
    setLoading(false);
  };

  const validateStep1 = (): boolean => {
    if (!name.trim()) { setError(T("nameRequired")); return false; }
    if (!phone || !isValidPhone(phone)) { setError(`${T("enterValidPhone")} (e.g. ${phoneHint})`); return false; }
    if (!email || !email.includes("@")) { setError(T("enterValidEmail")); return false; }
    if (!address.trim()) { setError(T("homeAddressRequired")); return false; }
    if (!city) { setError(T("selectCity")); return false; }
    if (city === "Other" && !customCity.trim()) { setError(T("enterCityName")); return false; }
    if (!emergencyContact.trim() || emergencyContact.replace(/\D/g, "").length < 10) {
      setError(T("emergencyContactRequired")); return false;
    }
    if (availabilityStatus === "taken") { setError(T("alreadyRegistered")); return false; }
    if (!username || username.length < 3) { setError(T("usernameRequired") || "Username is required (min 3 characters)"); return false; }
    if (usernameStatus === "taken") { setError(T("usernameTaken")); return false; }
    if (usernameStatus === "checking" || usernameStatus === "idle") {
      setError(T("usernameCheckWait")); return false;
    }
    return true;
  };

  const validateStep2 = (): boolean => {
    const cnicDigits = cnic.replace(/\D/g, "");
    if (cnicDigits.length !== 13) { setError(T("cnicRequired")); return false; }
    if (!vehicleType) { setError(T("vehicleTypeRequired")); return false; }
    if (!vehicleReg.trim()) { setError(T("vehicleRegRequired")); return false; }
    if (!drivingLicense.trim()) { setError(T("drivingLicenseRequired")); return false; }
    if (!vehiclePhoto) { setError(T("vehiclePhotoRequired")); return false; }
    if (!cnicPhoto) { setError(T("cnicFrontRequired")); return false; }
    if (!cnicBackPhoto) { setError(T("cnicBackRequired")); return false; }
    if (!licensePhoto) { setError(T("licensePhotoRequired")); return false; }
    return true;
  };

  const validateStep3 = (): boolean => {
    if (password.length < 8) { setError(T("passwordMinLength")); return false; }
    if (password !== confirmPw) { setError(T("passwordsDoNotMatch")); return false; }
    if (!acceptedTerms) { setError(T("termsRequired")); return false; }
    return true;
  };

  const checkAvailability = async (): Promise<boolean> => {
    try {
      await api.checkAvailable({ phone: formatPhoneForApi(phone), email, ...(username ? { username } : {}) });
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : T("loginFailed"));
      return false;
    }
  };

  const goNextStep = async () => {
    clearError();
    if (step === 1) {
      if (!validateStep1()) return;
      setLoading(true);
      const available = await checkAvailability();
      setLoading(false);
      if (!available) return;
      setStep(2);
    } else if (step === 2) {
      if (!validateStep2()) return;
      setStep(3);
    } else if (step === 3) {
      if (!validateStep3()) return;
      setLoading(true);
      try {
        let captchaToken: string | undefined;
        if (auth.captchaEnabled) {
          try { captchaToken = await executeCaptcha("register", captchaSiteKey); } catch { /* noop */ }
          if (!captchaToken) { setError(T("captchaRequired")); setLoading(false); return; }
        }
        const selectedChannel = (() => {
          if (!auth.phoneOtp && auth.emailOtp) return "email" as const;
          if (auth.phoneOtp && !auth.emailOtp) return "phone" as const;
          return verifyChannel;
        })();
        setVerifyChannel(selectedChannel);

        const docsPayload: { files: { type: string; url: string; label: string }[]; note?: string } = { files: [] };
        if (cnicPhoto?.url) docsPayload.files.push({ type: "cnic_front", url: cnicPhoto.url, label: "CNIC Front" });
        if (cnicBackPhoto?.url) docsPayload.files.push({ type: "cnic_back", url: cnicBackPhoto.url, label: "CNIC Back" });
        if (licensePhoto?.url) docsPayload.files.push({ type: "driving_license", url: licensePhoto.url, label: "Driving License" });
        /* vehiclePhoto is sent as a top-level field — do NOT duplicate it inside documents JSON */
        if (registrationNote.trim()) docsPayload.note = registrationNote.trim();

        const regData = {
          name: name.trim(),
          phone: formatPhoneForRegister(phone),
          email: email.trim(),
          cnic: cnic.trim(),
          vehicleType,
          vehicleRegistration: vehicleReg.trim(),
          drivingLicense: drivingLicense.trim(),
          password,
          captchaToken,
          address: address.trim(),
          city: city === "Other" ? customCity.trim() : city.trim(),
          emergencyContact: emergencyContact.trim(),
          vehiclePhoto: vehiclePhoto?.url || undefined,
          documents: JSON.stringify(docsPayload),
          ...(username ? { username: username.trim() } : {}),
        };
        if (selectedChannel === "email") {
          try {
            await api.emailRegisterRider(regData);
          } catch (e: unknown) { setError(e instanceof Error ? e.message : T("loginFailed")); setLoading(false); return; }
          try {
            const emailRes = await api.sendEmailOtp(email.trim(), captchaToken);
            setDevOtp(emailRes.otp || "");
            setOtpSendFailed(false);
          } catch {
            setOtpSendFailed(true);
          }
          setVerifyChannel("email");
        } else {
          try {
            const res = await api.registerRider(regData);
            if (res.otpRequired === false) {
              /* OTP globally bypassed by admin — skip Step 4 */
              if (res.token) {
                api.storeTokens(res.token, res.refreshToken);
                if (res.pendingApproval) {
                  setCompleted(true);
                  setLoading(false); return;
                }
                let profile: AuthUser | null = res.user ?? null;
                if (!profile) {
                  try { profile = await api.getMe() as AuthUser; } catch { api.clearTokens(); setCompleted(true); setLoading(false); return; }
                }
                authLogin(res.token, profile!, res.refreshToken);
                navigate("/");
              } else {
                /* No token yet — pending OTP-less registration (needs approval) */
                setCompleted(true);
              }
              setLoading(false); return;
            }
            setDevOtp(res.otp || "");
          } catch (e: unknown) {
            const err = e instanceof Error ? e : new Error(T("loginFailed"));
            const apiErr = isApiError(e) ? e : null;
            const isExisting = apiErr?.status === 409 || apiErr?.responseData?.existingAccount === true;
            if (isExisting) {
              /* Account already exists — show friendly message with login link */
              setError(err.message || T("alreadyRegistered"));
              setExistingAccountError(true);
              setLoading(false); return;
            }
            setError(err.message);
            setLoading(false); return;
          }
        }
        setStep(4);
      } catch (e: unknown) { setError(e instanceof Error ? e.message : T("loginFailed")); }
      setLoading(false);
    } else if (step === 4) {
      if (!otp || otp.length < 6) { setError(T("enterOtpDigits")); return; }
      setLoading(true);
      try {
        let captchaToken: string | undefined;
        if (auth.captchaEnabled) {
          captchaToken = await executeCaptcha("register_verify_otp", config.auth?.captchaSiteKey || "");
        }
        type OtpVerifyResponse = {
          token?: string; refreshToken?: string;
          user?: AuthUser;
          pendingApproval?: boolean;
        };
        let res: OtpVerifyResponse;
        if (verifyChannel === "phone") {
          res = await api.verifyOtp(formatPhoneForApi(phone), otp, undefined, captchaToken) as OtpVerifyResponse;
        } else {
          res = await api.verifyEmailOtp(email, otp, undefined, captchaToken) as OtpVerifyResponse;
        }
        /* If server returns a token the rider was auto-approved, log them in directly.
           Backend may return a token without an embedded user object; in that case,
           store the token and fetch the full profile via getMe(). */
        if (res?.token) {
          api.storeTokens(res.token, res.refreshToken);
          let profile: AuthUser | null = res.user ?? null;
          if (!profile) {
            try {
              profile = await api.getMe() as AuthUser;
            } catch (getMeErr: unknown) {
              /* getMe failed after OTP verify — treat as pending to avoid partial login state */
              if (riderIsDev) console.warn("[Register] getMe failed after OTP verify:", getMeErr instanceof Error ? getMeErr.message : getMeErr);
              setCompleted(true);
              return;
            }
          }
          authLogin(res.token, profile, res.refreshToken);
          navigate("/");
        } else {
          setCompleted(true);
        }
      } catch (e: unknown) { setError(e instanceof Error ? e.message : T("verificationFailed")); }
      setLoading(false);
    }
  };

  const stepLabels: TranslationKey[] = ["step1PersonalInfo", "step2VehicleInfo", "step3Security", "step4Verification"];

  if (config.platform.appStatus === "maintenance") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-72 h-72 rounded-full bg-white/[0.02]" />
        <div className="absolute bottom-[-15%] left-[-10%] w-64 h-64 rounded-full bg-amber-500/[0.04]" />
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl relative z-10">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <Wrench size={36} className="text-amber-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-3">Under Maintenance</h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-5">{config.content.maintenanceMsg || "We're performing scheduled maintenance. Back soon!"}</p>
          {(config.platform.supportPhone || config.platform.supportEmail) && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-left mb-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Need Help?</p>
              {config.platform.supportPhone && <p className="text-sm font-bold text-gray-700 flex items-center gap-2"><Phone size={13} className="text-gray-400" /> {config.platform.supportPhone}</p>}
              {config.platform.supportEmail && <p className="text-xs text-gray-500 mt-0.5 ml-5">{config.platform.supportEmail}</p>}
            </div>
          )}
          <Link href="/" className="w-full h-11 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl transition-colors text-sm flex items-center justify-center gap-2">
            <ArrowLeft size={15} /> Back to Login
          </Link>
        </div>
      </div>
    );
  }

  if (!config.features.newUsers) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-72 h-72 rounded-full bg-white/[0.02]" />
        <div className="absolute bottom-[-15%] left-[-10%] w-64 h-64 rounded-full bg-red-500/[0.04]" />
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl relative z-10">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <Lock size={36} className="text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-3">Registration Closed</h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-5">New rider registrations are currently not available. Please try again later or contact support.</p>
          {(config.platform.supportPhone || config.platform.supportEmail) && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-left mb-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Contact Support</p>
              {config.platform.supportPhone && <p className="text-sm font-bold text-gray-700 flex items-center gap-2"><Phone size={13} className="text-gray-400" /> {config.platform.supportPhone}</p>}
              {config.platform.supportEmail && <p className="text-xs text-gray-500 mt-0.5 ml-5">{config.platform.supportEmail}</p>}
            </div>
          )}
          <Link href="/" className="w-full h-11 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl transition-colors text-sm flex items-center justify-center gap-2">
            <ArrowLeft size={15} /> Back to Login
          </Link>
        </div>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-72 h-72 rounded-full bg-white/[0.02]" />
        <div className="absolute bottom-[-15%] left-[-10%] w-64 h-64 rounded-full bg-green-500/[0.04]" />
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl relative z-10">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <Clock size={40} className="text-amber-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-3">{T("pendingAdminApproval")}</h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-5">{T("pendingApprovalMsg")}</p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-left flex gap-2">
            <Lightbulb size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-amber-700 text-xs font-medium">{T("approvalTakes")}</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-5 text-left flex gap-2">
            <Shield size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-blue-700 text-xs font-medium">
              Admin will review your documents and vehicle photo before activating your account.
            </p>
          </div>
          <Link href="/" className="w-full h-11 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl transition-colors text-sm flex items-center justify-center gap-2">
            <ArrowLeft size={15} /> {T("goToLogin")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] right-[-10%] w-72 h-72 rounded-full bg-white/[0.02]" />
      <div className="absolute bottom-[-15%] left-[-10%] w-64 h-64 rounded-full bg-green-500/[0.04]" />
      <div className="absolute top-[30%] left-[5%] w-40 h-40 rounded-full bg-white/[0.015]" />

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-white/[0.08] backdrop-blur-sm border border-white/[0.06] rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-xl">
            <Bike size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">{T("registerAsRider")}</h1>
          <p className="text-white/40 mt-1 text-sm">{T("joinAsDeliveryPartner")}</p>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-2xl">
          {config.content.riderNotice && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2">
              <AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-amber-700 text-xs font-medium leading-relaxed">{config.content.riderNotice}</p>
            </div>
          )}
          <div className="flex items-center gap-1 mb-6">
            {[1, 2, 3, 4].map(s => (
              <button key={s} type="button"
                onClick={() => { if (s < step) { clearError(); setStep(s); } }}
                className={`flex-1 flex flex-col items-center gap-1 ${s < step ? "cursor-pointer" : "cursor-default"}`}>
                <div className={`w-full h-1.5 rounded-full transition-all ${s <= step ? "bg-gray-900" : "bg-gray-200"}`} />
                <span className={`text-[10px] font-semibold ${s <= step ? "text-gray-900" : "text-gray-400"} ${s < step ? "underline underline-offset-2" : ""}`}>
                  {T(stepLabels[s - 1])}
                </span>
              </button>
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                  <User size={11} /> {T("nameRequired")}
                </label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder={T("fullName")} className={INPUT} autoFocus />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                  <Phone size={11} /> {T("phoneRequired")}
                </label>
                <div className="flex gap-2">
                  <div className="h-12 px-3 bg-gray-100 border border-gray-200 rounded-xl flex items-center text-sm font-bold text-gray-700 select-none gap-1">🇵🇰 +92</div>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="03XX-XXXXXXX" inputMode="numeric" className={`flex-1 ${INPUT}`} />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Format: 03XX-XXXXXXX</p>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                  <Mail size={11} /> {T("emailRequired")}
                </label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" className={INPUT} />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                  <MapPin size={11} /> Home Address <span className="text-red-500">*</span>
                </label>
                <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Full home address" className={INPUT} />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                  <MapPin size={11} /> City <span className="text-red-500">*</span>
                </label>
                <select value={city} onChange={e => setCity(e.target.value)} className={SELECT}>
                  <option value="">Select your city</option>
                  {AJK_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {city === "Other" && (
                  <input value={customCity} onChange={e => setCustomCity(e.target.value)}
                    placeholder="Enter your city name" className={`${INPUT} mt-2`} />
                )}
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                  <Phone size={11} /> Emergency Contact <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="h-12 px-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center text-sm font-medium text-gray-600">+92</div>
                  <input type="tel" value={emergencyContact} onChange={e => setEmergencyContact(e.target.value)}
                    placeholder="Family member / friend" className={`flex-1 ${INPUT}`} />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">In case of emergency during delivery</p>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                  <User size={11} /> Username *
                </label>
                <input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  placeholder="e.g. rider_ali" className={INPUT} maxLength={20} />
                {usernameStatus !== "idle" && (
                  <p className={`text-[10px] mt-1 font-medium ${
                    usernameStatus === "checking" ? "text-gray-400" :
                    usernameStatus === "available" ? "text-green-600" : "text-red-500"
                  }`}>
                    {usernameStatus === "checking" ? T("checkingAvailability") :
                     usernameStatus === "available" ? T("usernameAvailable") : T("usernameTakenShort")}
                  </p>
                )}
                <p className="text-[10px] text-gray-400 mt-0.5">You can use this to log in with username + password later</p>
              </div>

              {availabilityStatus !== "idle" && (
                <div className={`text-xs font-medium px-3 py-1.5 rounded-lg ${
                  availabilityStatus === "checking" ? "bg-gray-50 text-gray-500" :
                  availabilityStatus === "available" ? "bg-green-50 text-green-700" :
                  "bg-red-50 text-red-600"
                }`}>
                  {availabilityStatus === "checking" ? T("checkingAvailability") :
                   availabilityStatus === "available" ? T("phoneEmailAvailable") :
                   T("alreadyRegistered")}
                </div>
              )}

              {(auth.google || auth.facebook) && (
                <div className="pt-2">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400 font-medium">{T("orContinueWith")}</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                  <div className="space-y-2">
                    {auth.google && (() => {
                      const hasClientId = !!config.auth?.googleClientId;
                      return (
                        <button onClick={() => handleSocialAutofill("google")} disabled={loading}
                          className="w-full h-11 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 relative">
                          {T("signInWithGoogle")}
                          {!hasClientId && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 border border-gray-200">
                              {T("socialLoginComingSoon")}
                            </span>
                          )}
                        </button>
                      );
                    })()}
                    {auth.facebook && (() => {
                      const hasAppId = !!config.auth?.facebookAppId;
                      return (
                        <button onClick={() => handleSocialAutofill("facebook")} disabled={loading}
                          className="w-full h-11 bg-[#1877F2] rounded-xl text-sm font-semibold text-white hover:bg-[#166FE5] transition-colors flex items-center justify-center gap-2 disabled:opacity-60 relative">
                          {T("signInWithFacebook")}
                          {!hasAppId && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/20 text-white border border-white/30">
                              {T("socialLoginComingSoon")}
                            </span>
                          )}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                  <FileText size={11} /> {T("cnicRequired")}
                </label>
                <input value={cnic} onChange={e => setCnic(formatCnic(e.target.value))} placeholder="00000-0000000-0"
                  className={INPUT} inputMode="numeric" autoFocus />
                <p className="text-[10px] text-gray-400 mt-1">{T("cnicFormat")}</p>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                  <Car size={11} /> {T("vehicleTypeRequired")}
                </label>
                <select value={vehicleType} onChange={e => setVehicleType(e.target.value)} className={SELECT}>
                  <option value="">{T("selectVehicleType")}</option>
                  {VEHICLE_TYPES.map(v => (
                    <option key={v.value} value={v.value}>{T(v.labelKey)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                  <Car size={11} /> Registration / Plate # <span className="text-red-500">*</span>
                </label>
                <input value={vehicleReg} onChange={e => setVehicleReg(e.target.value.toUpperCase())} placeholder="e.g. AJK 1234"
                  className={`${INPUT} uppercase`} />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
                  {T("drivingLicenseRequired")}
                </label>
                <input value={drivingLicense} onChange={e => setDrivingLicense(e.target.value)} placeholder="License number"
                  className={INPUT} />
              </div>

              <div className="border-t border-gray-100 pt-3 mt-1">
                <p className="text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Camera size={12} /> KYC Documents <span className="text-red-500">*</span>
                </p>
                <div className="space-y-2">
                  <FileUploadBox
                    label="Vehicle Photo"
                    icon={<Image size={20} className="text-gray-500" />}
                    value={vehiclePhoto}
                    onChange={f => handleFileUpload(f, "vehicle", setVehiclePhoto)}
                    required
                    uploading={uploadingField === "vehicle"}
                    error={uploadErrors["vehicle"]}
                  />
                  <FileUploadBox
                    label="CNIC Front"
                    icon={<FileText size={20} className="text-blue-500" />}
                    value={cnicPhoto}
                    onChange={f => handleFileUpload(f, "cnic", setCnicPhoto)}
                    required
                    uploading={uploadingField === "cnic"}
                    error={uploadErrors["cnic"]}
                  />
                  <FileUploadBox
                    label="CNIC Back"
                    icon={<FileText size={20} className="text-blue-400" />}
                    value={cnicBackPhoto}
                    onChange={f => handleFileUpload(f, "cnicBack", setCnicBackPhoto)}
                    required
                    uploading={uploadingField === "cnicBack"}
                    error={uploadErrors["cnicBack"]}
                  />
                  <FileUploadBox
                    label="Driving License Photo"
                    icon={<FileText size={20} className="text-purple-500" />}
                    value={licensePhoto}
                    onChange={f => handleFileUpload(f, "license", setLicensePhoto)}
                    required
                    uploading={uploadingField === "license"}
                    error={uploadErrors["license"]}
                  />
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-2.5 mt-2 flex items-start gap-2">
                  <AlertCircle size={13} className="text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-blue-700 leading-relaxed">
                    <strong>All 4 documents are mandatory.</strong> Upload clear, legible photos for faster admin approval. Your account will be activated after document verification.
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3 mt-1">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                  <FileText size={11} /> Additional Notes (Optional)
                </label>
                <textarea
                  value={registrationNote}
                  onChange={e => setRegistrationNote(e.target.value)}
                  placeholder="Any additional information you'd like to share with the admin (e.g., experience, availability, preferred areas...)"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:bg-white transition-all resize-none"
                  rows={3}
                  maxLength={500}
                />
                <p className="text-[10px] text-gray-400 mt-1 text-right">{registrationNote.length}/500</p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                  <Shield size={11} /> {T("passwordRequired")}
                </label>
                <div className="relative">
                  <input type={showPwd ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder={T("passwordRequired")} className={`${INPUT} pr-12`} autoFocus />
                  <button onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-3 text-gray-400 hover:text-gray-600">
                    {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {password && (
                  <div className="mt-2">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${getPasswordStrength(password).color} ${getPasswordStrength(password).width}`} />
                      </div>
                      <span className="text-[10px] font-bold text-gray-500">{T(getPasswordStrength(password).label)}</span>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
                  {T("confirmPassword")}
                </label>
                <input type={showPwd ? "text" : "password"} value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                  placeholder={T("confirmPassword")} className={INPUT} />
                {confirmPw && password !== confirmPw && (
                  <p className="text-[10px] text-red-500 mt-1">{T("passwordsDoNotMatch")}</p>
                )}
              </div>
              <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer">
                <input type="checkbox" checked={acceptedTerms} onChange={e => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-gray-900" />
                <span className="text-xs text-gray-600 leading-relaxed">
                  {T("acceptTerms")}
                  {config.content.tncUrl && (
                    <> — <a href={config.content.tncUrl} target="_blank" rel="noopener noreferrer" className="text-gray-900 underline font-semibold">Terms</a></>
                  )}
                  {config.content.privacyUrl && (
                    <> | <a href={config.content.privacyUrl} target="_blank" rel="noopener noreferrer" className="text-gray-900 underline font-semibold">Privacy</a></>
                  )}
                </span>
              </label>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="text-center mb-2">
                <h3 className="text-lg font-bold text-gray-800">{T("enterOtp")}</h3>
                <p className="text-sm text-gray-500">
                  {verifyChannel === "phone" ? `+92${phone}` : email}
                </p>
              </div>
              {auth.phoneOtp && auth.emailOtp && (
                <div className="flex gap-2 justify-center mb-2">
                  <button type="button" onClick={async () => {
                    if (verifyChannel === "phone") return;
                    setVerifyChannel("phone"); setOtp(""); setDevOtp("");
                    try {
                      const res = await api.sendOtp(formatPhoneForApi(phone));
                      if (res.otp) setDevOtp(res.otp);
                    } catch (e: unknown) {
                      setError(e instanceof Error ? e.message : "Failed to send phone OTP. Please try again.");
                    }
                  }}
                    className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors ${verifyChannel === "phone" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    {T("verifyViaPhone")}
                  </button>
                  <button type="button" onClick={async () => {
                    if (verifyChannel === "email") return;
                    setVerifyChannel("email"); setOtp(""); setDevOtp("");
                    try {
                      const res = await api.sendEmailOtp(email.trim());
                      if (res.otp) setDevOtp(res.otp);
                    } catch (e: unknown) {
                      setError(e instanceof Error ? e.message : "Failed to send email OTP. Please try again.");
                    }
                  }}
                    className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors ${verifyChannel === "email" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    {T("verifyViaEmail")}
                  </button>
                </div>
              )}
              {otpSendFailed && verifyChannel === "email" && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs text-amber-800 font-semibold mb-2">OTP sending failed. Your account was registered — please resend the OTP to verify your email.</p>
                  <button type="button" disabled={resendingOtp}
                    onClick={async () => {
                      setResendingOtp(true); setError("");
                      try {
                        let captchaToken: string | undefined;
                        if (auth.captchaEnabled) {
                          captchaToken = await executeCaptcha("resend_email_otp", config.auth?.captchaSiteKey || "");
                        }
                        const emailRes = await api.sendEmailOtp(email.trim(), captchaToken);
                        if (emailRes.otp) setDevOtp(emailRes.otp);
                        setOtpSendFailed(false);
                      } catch (e: unknown) {
                        setError(e instanceof Error ? e.message : "Failed to resend OTP");
                      }
                      setResendingOtp(false);
                    }}
                    className="text-xs font-bold bg-amber-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-60">
                    {resendingOtp ? T("sending") : T("resendOtp")}
                  </button>
                </div>
              )}
              {devOtp && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 mb-2">
                  <p className="text-xs text-orange-600 font-bold uppercase tracking-wide mb-0.5">{T("devOtp")}</p>
                  <p className="text-orange-700 font-extrabold text-xl tracking-[0.4em]">{devOtp}</p>
                </div>
              )}
              <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder={T("enterOtpDigits")} value={otp} onChange={e => setOtp(e.target.value)}
                onKeyDown={e => e.key === "Enter" && goNextStep()}
                className="w-full h-14 px-4 bg-gray-50 border border-gray-200 rounded-xl text-center text-2xl font-bold tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-gray-900"
                maxLength={6} autoFocus />
            </div>
          )}

          {error && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-red-600 text-sm">{error}</p>
              {existingAccountError && (
                <Link href="/" className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-gray-900 underline underline-offset-2 hover:text-gray-700">
                  <ArrowLeft size={13} /> {T("goToLogin")}
                </Link>
              )}
            </div>
          )}

          <div className="flex gap-2 mt-5">
            {step > 1 && (
              <button onClick={() => { setStep(step - 1); clearError(); }}
                className="h-12 px-5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1">
                <ArrowLeft size={14} /> {T("previousStep")}
              </button>
            )}
            <button onClick={goNextStep} disabled={loading || !!uploadingField}
              className="flex-1 h-12 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              {loading ? T("pleaseWait") :
                step === 4 ? T("verifyAndLogin") :
                  step === 3 ? T("submitRegistration") :
                    <>{T("nextStep")} <ArrowRight size={14} /></>
              }
            </button>
          </div>

          <div className="mt-4 text-center">
            <Link href="/" className="text-sm text-gray-900 font-semibold hover:text-gray-700">
              {T("alreadyHaveAccount")} {T("login")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
