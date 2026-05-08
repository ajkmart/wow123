import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Eye, EyeOff, KeyRound, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAdminAuth } from "@/lib/adminAuthContext";
import { useToast } from "@/hooks/use-toast";

function validateStrength(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(pw)) return "Password must contain at least 1 uppercase letter";
  if (!/[0-9]/.test(pw)) return "Password must contain at least 1 number";
  return null;
}

type StrengthLevel = 0 | 1 | 2 | 3 | 4;

function computeStrength(pw: string): StrengthLevel {
  if (!pw) return 0;
  if (pw.length < 8) return 1;
  if (!/[A-Z]/.test(pw)) return 2;
  if (!/[0-9]/.test(pw)) return 3;
  return 4;
}

const STRENGTH_META: Record<StrengthLevel, { label: string; bar: string; text: string }> = {
  0: { label: "", bar: "", text: "" },
  1: { label: "Weak",   bar: "bg-red-500",    text: "text-red-400" },
  2: { label: "Fair",   bar: "bg-orange-400",  text: "text-orange-400" },
  3: { label: "Good",   bar: "bg-amber-400",   text: "text-amber-400" },
  4: { label: "Strong", bar: "bg-emerald-500", text: "text-emerald-400" },
};

export default function SetNewPassword() {
  const [, setLocation] = useLocation();
  const { state, changePassword, logout } = useAdminAuth();
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.isLoading && !state.accessToken) setLocation("/login");
  }, [state.isLoading, state.accessToken, setLocation]);

  const strengthLevel = computeStrength(newPassword);
  const sm = STRENGTH_META[strengthLevel];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) { setError("The two new passwords do not match."); return; }
    const strengthError = validateStrength(newPassword);
    if (strengthError) { setError(strengthError); return; }
    if (newPassword === currentPassword) { setError("Your new password must be different from your current password."); return; }
    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast({ title: "Password updated", description: "Welcome aboard. You're all set." });
      setLocation("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    try { await logout(); } finally { setLocation("/login"); }
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
            <KeyRound className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Set new password</h1>
          <p className="mt-1.5 text-[13px] text-white/50">Update your admin password anytime</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.04] p-7 shadow-2xl backdrop-blur-md">

          {/* Info banner */}
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/8 px-4 py-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-[12px] leading-snug text-white/50">
              This step is optional — your current password keeps working until you change it.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Current password */}
            <div className="space-y-1.5">
              <label htmlFor="snp-current" className="block text-[11px] font-semibold uppercase tracking-widest text-white/40">
                Current password
              </label>
              <Input
                id="snp-current"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Your current password"
                className="h-11 rounded-xl border-white/10 bg-white/[0.06] text-sm text-white placeholder:text-white/25 focus:border-amber-400/60 focus:ring-amber-400/15 focus:bg-white/[0.08] transition-all"
                required
                data-testid="input-current-password"
              />
            </div>

            {/* New password */}
            <div className="space-y-1.5">
              <label htmlFor="snp-new" className="block text-[11px] font-semibold uppercase tracking-widest text-white/40">
                New password
              </label>
              <div className="relative">
                <Input
                  id="snp-new"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
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

              {/* Strength meter */}
              {newPassword.length > 0 && (
                <div className="space-y-1.5 pt-0.5">
                  <div className="flex gap-1">
                    {([1, 2, 3, 4] as const).map((bar) => (
                      <div
                        key={bar}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${strengthLevel >= bar ? sm.bar : "bg-white/10"}`}
                      />
                    ))}
                  </div>
                  {strengthLevel > 0 && (
                    <p className={`text-[11px] font-semibold ${sm.text}`}>{sm.label}</p>
                  )}
                </div>
              )}
            </div>

            {/* Confirm */}
            <div className="space-y-1.5">
              <label htmlFor="snp-confirm" className="block text-[11px] font-semibold uppercase tracking-widest text-white/40">
                Confirm password
              </label>
              <Input
                id="snp-confirm"
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
              <p className="rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-[13px] text-red-400" data-testid="text-change-password-error">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !currentPassword || !newPassword || !confirmPassword}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-[14px] font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:bg-amber-400 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              data-testid="button-update-password"
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

            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center justify-center gap-1.5 text-[12px] font-medium text-white/30 hover:text-white/60 transition-colors focus-visible:outline-none"
              data-testid="button-sign-out"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out instead
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[11px] text-white/20">
          AJKMart Admin &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
