import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "wouter";
import { api, apiFetch } from "../lib/api";
import { usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
import { useAuth } from "../lib/auth";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { TwoFactorSetup, TwoFactorVerify } from "@workspace/auth-utils";
import {
  ArrowLeft, Shield, ShieldCheck, ShieldOff, Loader2, Lock, Eye, EyeOff,
} from "lucide-react";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "../components/ui/accordion";

function getPasswordStrength(pw: string): { level: number; label: TranslationKey; color: string } {
  if (!pw) return { level: 0, label: "passwordWeak", color: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { level: 1, label: "passwordWeak", color: "bg-red-500" };
  if (score <= 2) return { level: 2, label: "passwordFair", color: "bg-amber-400" };
  if (score <= 3) return { level: 3, label: "passwordGood", color: "bg-yellow-400" };
  return { level: 4, label: "passwordStrong", color: "bg-green-500" };
}

function PasswordChangeSection({ showToastFn, T }: { showToastFn: (msg: string) => void; T: (key: TranslationKey) => string }) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");
  const strength = getPasswordStrength(newPw);

  const handleChangePassword = async () => {
    setPwError("");
    if (!newPw || newPw.length < 8) { setPwError("Password must be at least 8 characters"); return; }
    if (newPw !== confirmPw) { setPwError("Passwords do not match"); return; }
    setPwLoading(true);
    try {
      await apiFetch("/auth/set-password", {
        method: "POST",
        body: JSON.stringify({ password: newPw, currentPassword: currentPw || undefined }),
      });
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      showToastFn("Password updated successfully");
    } catch (e: unknown) {
      setPwError(e instanceof Error ? e.message : "Failed to change password");
    }
    setPwLoading(false);
  };

  return (
    <div className="px-5 pb-1">
      <div className="space-y-3">
        <div className="relative">
          <input type={showCurrent ? "text" : "password"} value={currentPw} onChange={e => setCurrentPw(e.target.value)}
            placeholder="Current password (if set)" className="w-full h-11 px-4 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:bg-white transition-all" />
          <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <div>
          <div className="relative">
            <input type={showNew ? "text" : "password"} value={newPw} onChange={e => setNewPw(e.target.value)}
              placeholder="New password" className="w-full h-11 px-4 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:bg-white transition-all" />
            <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {newPw && (
            <div className="mt-1.5">
              <div className="flex gap-1 mb-1">
                {[1,2,3,4].map(i => (
                  <div key={i} className={`flex-1 h-1 rounded-full transition-all duration-300 ${i <= strength.level ? strength.color : "bg-gray-100"}`} />
                ))}
              </div>
              <p className={`text-[10px] font-bold ${strength.level <= 1 ? "text-red-500" : strength.level <= 2 ? "text-amber-500" : strength.level <= 3 ? "text-yellow-600" : "text-green-600"}`}>
                {T(strength.label)}
              </p>
            </div>
          )}
        </div>
        <div className="relative">
          <input type={showConfirm ? "text" : "password"} value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
            placeholder="Confirm new password" className="w-full h-11 px-4 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:bg-white transition-all" />
          <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {pwError && <p className="text-red-500 text-xs bg-red-50 rounded-lg px-3 py-2">{pwError}</p>}

        <button onClick={handleChangePassword} disabled={pwLoading || !newPw}
          className="w-full h-11 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-60">
          {pwLoading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
          {pwLoading ? T("pleaseWait") : "Update Password"}
        </button>
      </div>
    </div>
  );
}

type ViewState = "main" | "setup" | "verify-disable";

export default function SecuritySettings() {
  const { config } = usePlatformConfig();
  const { language } = useLanguage();
  const { user, refreshUser } = useAuth();
  const T = (key: TranslationKey) => tDual(key, language);

  const [view, setView] = useState<ViewState>("main");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [backupCodesSaved, setBackupCodesSaved] = useState(false);

  const [is2faEnabled, setIs2faEnabled] = useState(() => !!user?.twoFactorEnabled);

  const [setupData, setSetupData] = useState<{
    qrCodeDataUrl: string;
    secret: string;
    backupCodes: string[];
  } | null>(null);

  const [verifyError, setVerifyError] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(""), 3500);
  };

  const handleToggle2fa = async () => {
    if (is2faEnabled) {
      setView("verify-disable");
    } else {
      setLoading(true);
      setError("");
      try {
        const data = await api.twoFactorSetup();
        setSetupData({
          qrCodeDataUrl: data.qrDataUrl || data.qrCodeDataUrl || data.qrCode || "",
          secret: data.secret || "",
          backupCodes: data.backupCodes || [],
        });
        setBackupCodesSaved(false);
        setView("setup");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : T("sendOtpFailed"));
      }
      setLoading(false);
    }
  };

  const handleSetupVerify = useCallback(async (code: string) => {
    setVerifyLoading(true);
    setVerifyError("");
    try {
      const res = await api.twoFactorEnable({ code });
      if (res.backupCodes && setupData) {
        setSetupData({ ...setupData, backupCodes: res.backupCodes });
      }
      setIs2faEnabled(true);
      await refreshUser();
      showToast(T("twoFactorEnableSuccess"));
      if (!res.backupCodes || res.backupCodes.length === 0) {
        setView("main");
      }
      /* If backup codes are present, stay on setup screen until rider clicks Done */
    } catch (e: unknown) {
      setVerifyError(e instanceof Error ? e.message : T("verificationFailed"));
    }
    setVerifyLoading(false);
  }, [T, setupData, refreshUser]);

  const handleDisableVerify = useCallback(async (code: string) => {
    setVerifyLoading(true);
    setVerifyError("");
    try {
      await api.twoFactorDisable({ code });
      setIs2faEnabled(false);
      await refreshUser();
      setView("main");
      showToast(T("twoFactorDisableSuccess"));
    } catch (e: unknown) {
      setVerifyError(e instanceof Error ? e.message : T("verificationFailed"));
    }
    setVerifyLoading(false);
  }, [T, refreshUser]);


  if (view === "setup" && setupData) {
    const hasBackupCodes = setupData.backupCodes && setupData.backupCodes.length > 0;
    return (
      <div className="min-h-screen bg-[#F5F6F8]">
        <div className="bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800 px-5 pb-8 rounded-b-[2rem] relative overflow-hidden"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}>
          <div className="absolute top-[-30%] right-[-15%] w-64 h-64 rounded-full bg-white/[0.02]" />
          <div className="absolute bottom-[-20%] left-[-10%] w-48 h-48 rounded-full bg-green-500/[0.04]" />
          <button onClick={() => setView("main")} className="text-white/60 text-sm font-semibold mb-3 flex items-center gap-1 relative z-10">
            <ArrowLeft size={14} /> {T("back")}
          </button>
          <h1 className="text-xl font-bold text-white relative z-10">{T("twoFactorAuthentication")}</h1>
        </div>
        <div className="px-4 -mt-4 relative z-10 space-y-3">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
            <TwoFactorSetup
              qrCodeDataUrl={setupData.qrCodeDataUrl}
              secret={setupData.secret}
              backupCodes={setupData.backupCodes}
              onVerify={handleSetupVerify}
              verifyLoading={verifyLoading}
              verifyError={verifyError}
              appName={config.platform.appName}
            />
          </div>
          {is2faEnabled && hasBackupCodes && (
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-3">
              <p className="text-xs text-gray-500 leading-relaxed">
                2FA is now enabled. Make sure you have saved your backup codes above before continuing.
              </p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={backupCodesSaved}
                  onChange={e => setBackupCodesSaved(e.target.checked)}
                  className="w-4 h-4 rounded accent-gray-900"
                />
                <span className="text-sm font-semibold text-gray-700">I've saved my backup codes</span>
              </label>
              <button
                onClick={() => { if (backupCodesSaved) setView("main"); }}
                disabled={!backupCodesSaved}
                className="w-full h-11 bg-gray-900 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
              >
                <ShieldCheck size={16} /> Done — Return to Security Settings
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === "verify-disable") {
    return (
      <div className="min-h-screen bg-[#F5F6F8]">
        <div className="bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800 px-5 pb-8 rounded-b-[2rem] relative overflow-hidden"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}>
          <div className="absolute top-[-30%] right-[-15%] w-64 h-64 rounded-full bg-white/[0.02]" />
          <div className="absolute bottom-[-20%] left-[-10%] w-48 h-48 rounded-full bg-green-500/[0.04]" />
          <button onClick={() => setView("main")} className="text-white/60 text-sm font-semibold mb-3 flex items-center gap-1 relative z-10">
            <ArrowLeft size={14} /> {T("back")}
          </button>
          <h1 className="text-xl font-bold text-white relative z-10">{T("twoFactorVerification")}</h1>
        </div>
        <div className="px-4 -mt-4 relative z-10">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
            <TwoFactorVerify
              onVerify={handleDisableVerify}
              verifyLoading={verifyLoading}
              verifyError={verifyError}
              showTrustDevice={false}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F6F8]">
      <div className="bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800 px-5 pb-8 rounded-b-[2rem] relative overflow-hidden"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}>
        <div className="absolute top-[-30%] right-[-15%] w-64 h-64 rounded-full bg-white/[0.02]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-48 h-48 rounded-full bg-green-500/[0.04]" />
        <div className="flex items-center gap-3 mb-2 relative z-10">
          <Link href="/profile" className="text-white/60 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-xl font-bold text-white">{T("securitySettings")}</h1>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4 max-w-md mx-auto">
        <Accordion type="multiple" defaultValue={["password", "2fa"]}>
          <AccordionItem value="password" className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden mb-4">
            <AccordionTrigger className="px-5 py-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Lock size={20} className="text-blue-600" />
                </div>
                <div className="text-left">
                  <span className="text-[15px] font-bold text-gray-900 block">{T("password")}</span>
                  <span className="text-xs text-gray-500">Change your account password</span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <PasswordChangeSection showToastFn={showToast} T={T} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="2fa" className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <AccordionTrigger className="px-5 py-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${is2faEnabled ? "bg-green-100" : "bg-gray-100"}`}>
                  {is2faEnabled ? <ShieldCheck size={20} className="text-green-600" /> : <Shield size={20} className="text-gray-400" />}
                </div>
                <div className="text-left">
                  <span className="text-[15px] font-bold text-gray-900 block">{T("twoFactorAuthentication")}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${is2faEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {is2faEnabled ? T("twoFactorEnabled") : T("twoFactorDisabled")}
                  </span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="px-5 pb-1">
                <p className="text-xs text-gray-500 leading-relaxed mb-4">{T("twoFactorDesc")}</p>
                <button onClick={handleToggle2fa} disabled={loading}
                  className={`w-full h-11 font-bold rounded-xl transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-60 ${is2faEnabled
                      ? "border-2 border-red-200 text-red-500 hover:bg-red-50"
                      : "bg-gray-900 hover:bg-gray-800 text-white"
                    }`}>
                  {loading ? <Loader2 size={16} className="animate-spin" /> : is2faEnabled ? <ShieldOff size={16} /> : <ShieldCheck size={16} />}
                  {loading ? T("pleaseWait") : is2faEnabled ? T("disable2fa") : T("enable2fa")}
                </button>
                {error && <p className="text-red-500 text-sm mt-3 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {toast && (
        <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
          style={{ paddingTop: "calc(env(safe-area-inset-top,0px) + 12px)", paddingLeft: "16px", paddingRight: "16px" }}>
          <div className="bg-gray-900 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-2xl max-w-sm w-full text-center pointer-events-auto">{toast}</div>
        </div>
      )}
    </div>
  );
}
