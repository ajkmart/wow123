import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff,
  Loader2, ShoppingBag, XCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";

function getTokenFromQuery(): string {
  if (typeof window === "undefined") return "";
  try {
    return new URLSearchParams(window.location.search).get("token") ?? "";
  } catch { return ""; }
}

function validateStrength(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(pw)) return "Password must contain at least 1 uppercase letter";
  if (!/[0-9]/.test(pw)) return "Password must contain at least 1 number";
  return null;
}

type ValidationState =
  | { status: "checking" }
  | { status: "valid"; expiresAt: string | null; adminName: string | null }
  | { status: "invalid"; reason: "missing_token" | "invalid_or_expired" | "network" };

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const token = useMemo(getTokenFromQuery, []);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationState>({ status: "checking" });
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setValidation({ status: "invalid", reason: "missing_token" });
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/admin/auth/reset-password/validate?token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({})) as { valid?: boolean; reason?: string; expiresAt?: string; adminName?: string };
        if (cancelled) return;
        if (res.ok && data.valid) {
          setValidation({ status: "valid", expiresAt: data.expiresAt ?? null, adminName: data.adminName ?? null });
        } else {
          setValidation({ status: "invalid", reason: data.reason === "missing_token" ? "missing_token" : "invalid_or_expired" });
        }
      } catch {
        if (!cancelled) setValidation({ status: "invalid", reason: "network" });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (password !== confirmPassword) { setError("The two passwords do not match."); return; }
    const strengthError = validateStrength(password);
    if (strengthError) { setError(strengthError); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error || "We couldn't reset your password. Please try again."); return; }
      setSuccess(true);
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = setTimeout(() => setLocation("/login"), 2200);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0f1117] relative overflow-hidden px-4">

      {/* Background glows */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-15%] left-[-10%] h-[45%] w-[45%] rounded-full bg-amber-500/10 blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-10%] h-[45%] w-[45%] rounded-full bg-orange-500/8 blur-[120px]" />
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
      </div>

      <div className="relative z-10 w-full max-w-[400px]">

        {/* Brand */}
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/30">
            <ShoppingBag className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Choose new password</h1>
          <p className="mt-1.5 text-[13px] text-white/50">
            {success ? "All done — signing you in" : "Create a strong, unique password"}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.04] p-7 shadow-2xl backdrop-blur-md">

          {/* Success */}
          {success ? (
            <div className="space-y-4 text-center" data-testid="reset-password-success">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-white/90">Password updated</p>
                <p className="mt-1.5 text-[13px] text-white/45">Redirecting you to sign in…</p>
              </div>
            </div>

          /* Checking */
          ) : validation.status === "checking" ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-white/40" data-testid="reset-password-checking">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying your reset link…
            </div>

          /* Invalid token */
          ) : validation.status === "invalid" ? (
            <div className="space-y-4" data-testid="reset-password-invalid">
              <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3.5">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <p className="text-[13px] leading-snug text-red-300/90">
                  {validation.reason === "missing_token"
                    ? "This reset link is missing its token."
                    : validation.reason === "network"
                    ? "Couldn't reach the server. Check your connection and try again."
                    : "This reset link is invalid or has expired."}
                </p>
              </div>
              <p className="text-[12px] leading-relaxed text-white/35">
                Reset links expire 30 minutes after being sent and can only be used once.
              </p>
              <Link href="/forgot-password">
                <a className="inline-flex items-center gap-1.5 text-[13px] font-medium text-amber-400/80 hover:text-amber-300 transition-colors" data-testid="link-request-new-reset">
                  Request a new reset link
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </Link>
            </div>

          /* Form */
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <Link href="/login">
                <a className="inline-flex items-center gap-1.5 text-[12px] font-medium text-white/40 hover:text-white/70 transition-colors" data-testid="link-back-to-login">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to sign in
                </a>
              </Link>

              {validation.adminName && (
                <p className="text-[13px] text-white/45">
                  Resetting password for <span className="font-semibold text-white/70">{validation.adminName}</span>
                </p>
              )}

              {/* New password */}
              <div className="space-y-1.5">
                <label htmlFor="rp-new" className="block text-[11px] font-semibold uppercase tracking-widest text-white/40">
                  New password
                </label>
                <div className="relative">
                  <Input
                    id="rp-new"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 chars, 1 uppercase, 1 number"
                    className="h-11 rounded-xl border-white/10 bg-white/[0.06] pr-10 text-sm text-white placeholder:text-white/25 focus:border-amber-400/60 focus:ring-amber-400/15 focus:bg-white/[0.08] transition-all"
                    required
                    data-testid="input-new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-white/30 hover:text-white/60 transition-colors focus-visible:outline-none"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm */}
              <div className="space-y-1.5">
                <label htmlFor="rp-confirm" className="block text-[11px] font-semibold uppercase tracking-widest text-white/40">
                  Confirm password
                </label>
                <Input
                  id="rp-confirm"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter the new password"
                  className="h-11 rounded-xl border-white/10 bg-white/[0.06] text-sm text-white placeholder:text-white/25 focus:border-amber-400/60 focus:ring-amber-400/15 focus:bg-white/[0.08] transition-all"
                  required
                  data-testid="input-confirm-password"
                />
              </div>

              {error && (
                <p className="rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-[13px] text-red-400" data-testid="text-reset-error">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !password || !confirmPassword}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-[14px] font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:bg-amber-400 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                data-testid="button-reset-password"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Update password
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-white/20">
          AJKMart Admin &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
