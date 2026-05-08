import { useState, useCallback } from "react";
import { Link } from "wouter";
import { api } from "../lib/api";
import { usePlatformConfig, getRiderAuthConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { TwoFactorVerify, executeCaptcha, formatPhoneForApi } from "@workspace/auth-utils";
import {
  ArrowLeft, Loader2, Eye, EyeOff, Phone, Mail,
  CheckCircle, KeyRound,
} from "lucide-react";

type ForgotStep = "choose-method" | "send-otp" | "enter-otp" | "new-password" | "totp-verify" | "success";

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

const INPUT = "w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:bg-white transition-all";

export default function ForgotPassword() {
  const { config } = usePlatformConfig();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const auth = getRiderAuthConfig(config);
  const captchaSiteKey = config.auth?.captchaSiteKey;
  const phoneHint = config.regional?.phoneHint ?? "03XXXXXXXXX";
  const isValidPhone = (() => {
    try {
      if (config.regional?.phoneFormat) {
        const re = new RegExp(config.regional.phoneFormat);
        return (p: string) => re.test(p);
      }
    } catch { /* invalid regex — fall through to hardcoded regex */ }
    return (p: string) => /^0?3\d{9}$/.test(p.replace(/[\s\-()+]/g, ""));
  })();

  const [step, setStep] = useState<ForgotStep>("choose-method");
  const [method, setMethod] = useState<"phone" | "email">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const [twoFaError, setTwoFaError] = useState("");
  const [twoFaLoading, setTwoFaLoading] = useState(false);

  const clearError = () => setError("");

  const hasPhoneOtp = auth.phoneOtp;
  const hasEmailOtp = auth.emailOtp;

  const sendOtp = async () => {
    clearError();
    if (method === "phone" && (!phone || !isValidPhone(phone))) { setError(`${T("enterValidPhone")} (e.g. ${phoneHint})`); return; }
    if (method === "email" && (!email || !email.includes("@"))) { setError(T("enterValidEmail")); return; }
    setLoading(true);
    try {
      let captchaToken: string | undefined;
      if (auth.captchaEnabled) {
        try { captchaToken = await executeCaptcha("forgot_password", captchaSiteKey); } catch { /* noop */ }
        if (!captchaToken) { setError(T("captchaRequired")); setLoading(false); return; }
      }
      const res = await api.forgotPassword({
        method,
        ...(method === "phone" ? { phone: formatPhoneForApi(phone) } : { email }),
        captchaToken,
      });
      if (res.otp) setDevOtp(res.otp);
      setStep("enter-otp");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : T("sendOtpFailed")); }
    setLoading(false);
  };

  const verifyOtpAndSetPassword = async (totpCode?: string) => {
    clearError();
    if (!otp || otp.length < 6) { setError(T("enterOtpDigits")); return; }
    if (newPassword.length < 8) { setError(T("passwordMinLength")); return; }
    if (newPassword !== confirmPw) { setError(T("passwordsDoNotMatch")); return; }
    setLoading(true);
    try {
      let captchaToken: string | undefined;
      if (auth.captchaEnabled) {
        try { captchaToken = await executeCaptcha("reset_password", captchaSiteKey); } catch { /* noop */ }
        if (!captchaToken) { setError(T("captchaRequired")); setLoading(false); return; }
      }
      await api.resetPassword({
        ...(method === "phone" ? { phone: formatPhoneForApi(phone) } : { email }),
        otp,
        newPassword,
        captchaToken,
        ...(totpCode ? { totpCode } : {}),
      });
      setStep("success");
    } catch (e: unknown) {
      const errObj = e as { responseData?: { requires2FA?: boolean } };
      if (errObj?.responseData?.requires2FA) {
        setStep("totp-verify");
        setLoading(false);
        return;
      }
      setError(e instanceof Error ? e.message : T("verificationFailed"));
    }
    setLoading(false);
  };

  const handle2faVerify = useCallback(async (code: string) => {
    setTwoFaLoading(true);
    setTwoFaError("");
    try {
      let captchaToken: string | undefined;
      if (auth.captchaEnabled) {
        try { captchaToken = await executeCaptcha("reset_password_2fa", captchaSiteKey); } catch { /* noop */ }
      }
      await api.resetPassword({
        ...(method === "phone" ? { phone: formatPhoneForApi(phone) } : { email }),
        otp,
        newPassword,
        totpCode: code,
        captchaToken,
      });
      setStep("success");
    } catch (e: unknown) {
      setTwoFaError(e instanceof Error ? e.message : T("verificationFailed"));
    }
    setTwoFaLoading(false);
  }, [method, phone, email, otp, newPassword, auth.captchaEnabled, captchaSiteKey, T]);

  const handle2faBackup = useCallback(async (code: string) => {
    handle2faVerify(code);
  }, [handle2faVerify]);

  if (step === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-72 h-72 rounded-full bg-white/[0.02]" />
        <div className="absolute bottom-[-15%] left-[-10%] w-64 h-64 rounded-full bg-green-500/[0.04]" />
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl relative z-10">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle size={40} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-3">{T("passwordResetSuccess")}</h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-5">{T("passwordResetSuccessMsg")}</p>
          <Link href="/" className="w-full h-11 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl transition-colors text-sm flex items-center justify-center gap-2">
            <ArrowLeft size={15} /> {T("goToLogin")}
          </Link>
        </div>
      </div>
    );
  }

  if (step === "totp-verify") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-72 h-72 rounded-full bg-white/[0.02]" />
        <div className="absolute bottom-[-15%] left-[-10%] w-64 h-64 rounded-full bg-green-500/[0.04]" />
        <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl relative z-10">
          <button onClick={() => setStep("new-password")}
            className="text-gray-900 text-sm font-semibold mb-4 flex items-center gap-1">
            <ArrowLeft size={14} /> {T("back")}
          </button>
          <TwoFactorVerify
            onVerify={handle2faVerify}
            onBackupCode={handle2faBackup}
            verifyLoading={twoFaLoading}
            verifyError={twoFaError}
            showTrustDevice={false}
          />
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
            <KeyRound size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">{T("forgotPassword")}</h1>
          <p className="text-white/40 mt-1 text-sm">{T("forgotPasswordDesc")}</p>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-2xl">
          {step !== "choose-method" && (
            <button onClick={() => {
              if (step === "send-otp") setStep("choose-method");
              else if (step === "enter-otp") setStep("send-otp");
              else if (step === "new-password") setStep("enter-otp");
              clearError();
            }}
              className="text-gray-900 text-sm font-semibold mb-4 flex items-center gap-1">
              <ArrowLeft size={14} /> {T("back")}
            </button>
          )}

          {step === "choose-method" && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-gray-800 mb-1">{T("chooseResetMethod")}</h3>
              {hasPhoneOtp && (
                <button onClick={() => { setMethod("phone"); setStep("send-otp"); }}
                  className="w-full h-14 border-2 border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:border-gray-900 hover:bg-gray-50 transition-all flex items-center gap-3 px-4">
                  <Phone size={20} className="text-gray-900" />
                  <div className="text-left">
                    <div className="font-bold">{T("resetViaPhone")}</div>
                    <div className="text-[11px] text-gray-400">OTP via SMS</div>
                  </div>
                </button>
              )}
              {hasEmailOtp && (
                <button onClick={() => { setMethod("email"); setStep("send-otp"); }}
                  className="w-full h-14 border-2 border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:border-gray-900 hover:bg-gray-50 transition-all flex items-center gap-3 px-4">
                  <Mail size={20} className="text-gray-900" />
                  <div className="text-left">
                    <div className="font-bold">{T("resetViaEmail")}</div>
                    <div className="text-[11px] text-gray-400">OTP via Email</div>
                  </div>
                </button>
              )}
            </div>
          )}

          {step === "send-otp" && (
            <div className="space-y-3">
              {method === "phone" ? (
                <>
                  <h3 className="text-lg font-bold text-gray-800 mb-1">{T("resetViaPhone")}</h3>
                  <div className="flex gap-2">
                    <div className="h-12 px-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center text-sm font-medium text-gray-600">+92</div>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder={phoneHint}
                      onKeyDown={e => e.key === "Enter" && sendOtp()}
                      className={`flex-1 ${INPUT}`} autoFocus />
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-gray-800 mb-1">{T("resetViaEmail")}</h3>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com"
                    onKeyDown={e => e.key === "Enter" && sendOtp()}
                    className={INPUT} autoFocus />
                </>
              )}
              <button onClick={sendOtp} disabled={loading}
                className="w-full h-12 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                {loading ? T("pleaseWait") : T("sendResetOtp")}
              </button>
            </div>
          )}

          {step === "enter-otp" && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-gray-800 mb-1">{T("enterResetOtp")}</h3>
              <p className="text-sm text-gray-500">{method === "phone" ? `+92${phone}` : email}</p>
              {devOtp && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700">
                  <strong>{T("devOtp")}:</strong> {devOtp}
                </div>
              )}
              <input type="number" placeholder={T("enterOtpDigits")} value={otp} onChange={e => setOtp(e.target.value)}
                onKeyDown={e => e.key === "Enter" && setStep("new-password")}
                className="w-full h-14 px-4 bg-gray-50 border border-gray-200 rounded-xl text-center text-2xl font-bold tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-gray-900"
                maxLength={6} autoFocus />
              <button onClick={() => { if (otp.length >= 6) setStep("new-password"); else setError(T("enterOtpDigits")); }}
                disabled={loading}
                className="w-full h-12 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {T("nextStep")}
              </button>
              <button onClick={sendOtp} className="w-full text-sm text-gray-400 hover:text-gray-900 py-1">
                {T("resendOtp")}
              </button>
            </div>
          )}

          {step === "new-password" && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-gray-800 mb-1">{T("newPassword")}</h3>
              <div className="relative">
                <input type={showPwd ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder={T("newPassword")} className={`${INPUT} pr-12`} autoFocus />
                <button onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-3 text-gray-400 hover:text-gray-600">
                  {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {newPassword && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${getPasswordStrength(newPassword).color} ${getPasswordStrength(newPassword).width}`} />
                  </div>
                  <span className="text-[10px] font-bold text-gray-500">{T(getPasswordStrength(newPassword).label)}</span>
                </div>
              )}
              <input type={showPwd ? "text" : "password"} value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                placeholder={T("confirmNewPassword")} className={INPUT} />
              {confirmPw && newPassword !== confirmPw && (
                <p className="text-[10px] text-red-500">{T("passwordsDoNotMatch")}</p>
              )}
              <button onClick={() => verifyOtpAndSetPassword()} disabled={loading}
                className="w-full h-12 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                {loading ? T("pleaseWait") : T("resetPassword")}
              </button>
            </div>
          )}

          {error && <p className="text-red-500 text-sm mt-3 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="mt-5 text-center">
            <Link href="/" className="text-sm text-gray-900 font-semibold hover:text-gray-700">
              {T("backToLogin")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
