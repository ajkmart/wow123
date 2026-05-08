import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ShoppingBag,
  ArrowRight,
  Loader2,
  Eye,
  EyeOff,
  ShieldCheck,
  KeyRound,
  ChevronLeft,
} from "lucide-react";
import { useAdminAuth } from "@/lib/adminAuthContext";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";

export default function Login() {
  const [, setLocation] = useLocation();
  const { state, login, clearError } = useAdminAuth();
  const { toast } = useToast();

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [totp, setTotp] = useState("");
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [step, setStep] = useState<"credentials" | "mfa">("credentials");

  useEffect(() => {
    if (state.user && state.accessToken) setLocation("/dashboard");
  }, [state.user, state.accessToken, setLocation]);

  useEffect(() => {
    if (state.error) {
      toast({ title: "Login Error", description: state.error, variant: "destructive" });
      clearError();
    }
  }, [state.error, toast, clearError]);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    try {
      await login(username.trim(), password);
      toast({ title: "Welcome back", description: "Successfully logged into admin panel." });
    } catch (err: any) {
      if (err.requiresMfa && err.tempToken) {
        setTempToken(err.tempToken);
        setStep("mfa");
        setTotp("");
        toast({ title: "MFA Required", description: "Enter your authenticator code" });
      }
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totp.trim() || !tempToken) return;
    try {
      await login(username, password, totp, tempToken);
      toast({ title: "Welcome back", description: "Successfully logged into admin panel." });
    } catch (_) {}
  };

  const handleBackToCredentials = () => {
    setStep("credentials");
    setTotp("");
    setTempToken(null);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0f1117] relative overflow-hidden px-4">

      {/* ── Background glows ───────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-15%] left-[-10%] h-[45%] w-[45%] rounded-full bg-amber-500/10 blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-10%] h-[45%] w-[45%] rounded-full bg-orange-500/8 blur-[120px]" />
        {/* subtle dot grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle, #fff 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      {/* ── Card ───────────────────────────────────────────── */}
      <div className="relative z-10 w-full max-w-[400px]">

        {/* Brand header */}
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/30">
            <ShoppingBag className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            AJKMart Admin
          </h1>
          <p className="mt-1.5 text-[13px] text-white/50">
            {step === "credentials"
              ? "Sign in to your admin panel"
              : "Two-factor authentication"}
          </p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.04] p-7 shadow-2xl backdrop-blur-md">

          {step === "credentials" ? (
            <form onSubmit={handleCredentialsSubmit} className="space-y-5">

              {/* Username */}
              <div className="space-y-1.5">
                <label
                  htmlFor="login-username"
                  className="block text-[11px] font-semibold uppercase tracking-widest text-white/40"
                >
                  Username
                </label>
                <Input
                  id="login-username"
                  type="text"
                  name="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                  autoFocus
                  disabled={state.isLoading}
                  className="h-11 rounded-xl border-white/10 bg-white/[0.06] text-sm text-white placeholder:text-white/25 focus:border-amber-400/60 focus:ring-amber-400/15 focus:bg-white/[0.08] transition-all"
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label
                  htmlFor="login-password"
                  className="block text-[11px] font-semibold uppercase tracking-widest text-white/40"
                >
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    disabled={state.isLoading}
                    className="h-11 rounded-xl border-white/10 bg-white/[0.06] pr-10 text-sm text-white placeholder:text-white/25 focus:border-amber-400/60 focus:ring-amber-400/15 focus:bg-white/[0.08] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-white/30 hover:text-white/60 transition-colors focus-visible:outline-none"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Forgot password */}
              <div className="flex justify-end -mt-2">
                <button
                  type="button"
                  onClick={() => setLocation("/forgot-password")}
                  className="text-[12px] font-medium text-amber-400/80 hover:text-amber-300 transition-colors focus-visible:outline-none"
                  data-testid="link-forgot-password"
                >
                  Forgot password?
                </button>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={state.isLoading || !username.trim() || !password.trim()}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-[14px] font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:bg-amber-400 hover:shadow-amber-400/30 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-amber-500 disabled:active:scale-100"
              >
                {state.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

          ) : (
            <form onSubmit={handleMfaSubmit} className="space-y-5">

              {/* MFA icon + info */}
              <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/8 px-4 py-3.5">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400/15">
                  <ShieldCheck className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white/90">
                    Verification required
                  </p>
                  <p className="mt-0.5 text-[12px] text-white/45 leading-snug">
                    Enter the 6-digit code from your authenticator app.
                  </p>
                </div>
              </div>

              {/* OTP input */}
              <div className="space-y-1.5">
                <label
                  htmlFor="login-totp"
                  className="block text-[11px] font-semibold uppercase tracking-widest text-white/40"
                >
                  Authenticator code
                </label>
                <Input
                  id="login-totp"
                  type="text"
                  inputMode="numeric"
                  placeholder="000 000"
                  value={totp}
                  onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="h-12 rounded-xl border-white/10 bg-white/[0.06] text-center text-xl font-mono tracking-[0.4em] text-white placeholder:text-white/20 focus:border-amber-400/60 focus:ring-amber-400/15 focus:bg-white/[0.08] transition-all"
                  autoComplete="off"
                  disabled={state.isLoading}
                  autoFocus
                  maxLength={6}
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={handleBackToCredentials}
                  disabled={state.isLoading}
                  className="flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-[13px] font-medium text-white/60 hover:bg-white/[0.08] hover:text-white/90 transition-all disabled:opacity-40 focus-visible:outline-none"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="submit"
                  disabled={state.isLoading || totp.length !== 6}
                  className="group flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-[14px] font-bold text-white shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-400 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  {state.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Verify
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Default creds notice */}
        <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/25" />
          <p className="text-[11.5px] leading-relaxed text-white/30">
            {step === "credentials" ? (
              <>
                Default super-admin —{" "}
                <span className="font-semibold text-white/45">admin</span> /{" "}
                <span className="font-semibold text-white/45">Toqeerkhan@123.com</span>.
                {" "}Update from the post-login security prompt.
              </>
            ) : (
              "Don't have your authenticator code? Contact your administrator."
            )}
          </p>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-[11px] text-white/20">
          AJKMart Admin &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
