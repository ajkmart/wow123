import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors, { spacing, radii, shadows, typography } from "@/constants/colors";
import { useLanguage } from "@/context/LanguageContext";
import { usePlatformConfig, isMethodEnabled } from "@/context/PlatformConfigContext";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { API_BASE as API } from "@/utils/api";
import { normalizePhone, isValidPakistaniPhone, buildPhoneValidator } from "@/utils/phone";

import {
  OtpDigitInput,
  AuthButton,
  AlertBox,
  PhoneInput,
  InputField,
  PasswordStrengthBar,
  StepProgress,
  DevOtpBanner,
  authColors as C,
} from "@/components/auth-shared";

type ForgotStep = "method" | "otp" | "newPassword" | "totp" | "done";
type ResetMethod = "phone" | "email";

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { config } = usePlatformConfig();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const validatePhone = buildPhoneValidator(config.regional?.phoneFormat);
  const phoneHint = config.regional?.phoneHint ?? "03XXXXXXXXX";

  const phoneEnabled = isMethodEnabled(config.auth.phoneOtpEnabled);
  const emailEnabled = isMethodEnabled(config.auth.emailOtpEnabled);
  const defaultMethod: ResetMethod = phoneEnabled ? "phone" : "email";

  const [step, setStep] = useState<ForgotStep>("method");
  const [method, setMethod] = useState<ResetMethod>(defaultMethod);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const clearError = () => setError("");

  const stepNumber = step === "method" ? 1 : step === "otp" ? 2 : step === "newPassword" || step === "totp" ? 3 : 4;

  const handleSendResetCode = async () => {
    clearError();
    if (method === "phone" && !validatePhone(phone)) {
      setError(`Please enter a valid phone number (e.g. ${phoneHint})`);
      return;
    }
    /* FIX 15: Proper email regex validation */
    if (method === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }
    if (resendCooldown > 0) return;

    setLoading(true);
    try {
      const body: any = {};
      if (method === "phone") body.phone = normalizePhone(phone);
      else body.email = email.trim().toLowerCase();

      const res = await fetch(`${API}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Request failed."); setLoading(false); return; }
      if (data.otp) setDevOtp(data.otp);
      setResendCooldown(60);
      setStep("otp");
    } catch (e: any) { setError(e.message || "Please try again."); }
    setLoading(false);
  };

  /* FIX 1: Actually verify OTP against the server before proceeding to password step */
  const handleVerifyOtp = async () => {
    clearError();
    if (!otp || otp.length < 6) { setError("Please enter the 6-digit code"); return; }
    setLoading(true);
    try {
      const body: Record<string, string> = { otp };
      if (method === "phone") body.phone = normalizePhone(phone);
      else body.email = email.trim().toLowerCase();
      const res = await fetch(`${API}/auth/verify-reset-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid verification code. Please try again.");
        setLoading(false);
        return;
      }
      setStep("newPassword");
    } catch (e: any) {
      setError(e.message || "Verification failed. Please try again.");
    }
    setLoading(false);
  };

  const handleResetPassword = async () => {
    clearError();
    if (!newPassword || newPassword.length < 8) { setError("New password must be at least 8 characters"); return; }
    if (!/[A-Z]/.test(newPassword)) { setError("Password must contain an uppercase letter"); return; }
    if (!/[0-9]/.test(newPassword)) { setError("Password must contain a number"); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }

    setLoading(true);
    try {
      const body: any = { otp, newPassword };
      if (method === "phone") body.phone = normalizePhone(phone);
      else body.email = email.trim().toLowerCase();
      if (totpCode) body.totpCode = totpCode;

      const res = await fetch(`${API}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.requires2FA) {
          setStep("totp");
          setLoading(false);
          return;
        }
        setError(data.error || "Reset failed.");
        setLoading(false);
        return;
      }
      setStep("done");
    } catch (e: any) { setError(e.message || "Please try again."); }
    setLoading(false);
  };

  const handleTotpSubmit = async () => {
    if (!totpCode || totpCode.length < 6) { setError("Please enter the 6-digit 2FA code"); return; }
    await handleResetPassword();
  };

  const goBack = () => {
    if (step === "method") router.back();
    else if (step === "otp") setStep("method");
    else if (step === "newPassword") setStep("otp");
    else if (step === "totp") setStep("newPassword");
    clearError();
  };

  if (step === "done") {
    return (
      <LinearGradient colors={[C.primaryDark, C.primary, C.primaryLight]} style={s.gradient}>
        <View style={s.doneCenter}>
          <View style={s.doneCard}>
            <View style={s.doneIconWrap}>
              <View style={s.doneIconCircle}>
                <Ionicons name="checkmark" size={40} color="#fff" />
              </View>
            </View>
            <Text style={s.doneTitle}>Password Reset!</Text>
            <Text style={s.doneSub}>
              Your password has been successfully changed. Please log in with your new password.
            </Text>
            <AuthButton label="Go to Login" onPress={() => router.replace("/auth")} icon="log-in-outline" />
          </View>
        </View>
      </LinearGradient>
    );
  }

  const stepDescriptions: Record<string, string> = {
    method: "Enter your phone or email to receive a reset code",
    otp: "Enter the verification code we sent you",
    newPassword: "Create a strong new password",
    totp: "Enter your authenticator app code",
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <LinearGradient colors={[C.primaryDark, C.primary, C.primaryLight]} style={s.gradient}>
        <View style={[s.topSection, { paddingTop: topPad + 16 }]}>
          <TouchableOpacity activeOpacity={0.7}
            onPress={goBack}
            style={s.backBtn}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>

          <View style={s.headerIcon}>
            <Ionicons name="lock-closed" size={28} color="rgba(255,255,255,0.95)" />
          </View>
          <Text style={s.headerTitle}>Reset Password</Text>
          <Text style={s.headerSub}>{stepDescriptions[step] || ""}</Text>

          <View style={s.progressRow}>
            <StepProgress total={4} current={stepNumber} />
          </View>
        </View>

        <ScrollView style={s.card} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {step === "method" && (
            <>
              <View style={s.methodTabs} accessibilityRole="tablist">
                {isMethodEnabled(config.auth.phoneOtpEnabled) && (
                  <TouchableOpacity activeOpacity={0.7}
                    onPress={() => { setMethod("phone"); clearError(); }}
                    style={[s.methodTab, method === "phone" && s.methodTabActive]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: method === "phone" }}
                  >
                    <Ionicons name="call-outline" size={16} color={method === "phone" ? C.primary : C.textMuted} />
                    <Text style={[s.methodTabText, method === "phone" && s.methodTabTextActive]}>Phone</Text>
                  </TouchableOpacity>
                )}
                {isMethodEnabled(config.auth.emailOtpEnabled) && (
                  <TouchableOpacity activeOpacity={0.7}
                    onPress={() => { setMethod("email"); clearError(); }}
                    style={[s.methodTab, method === "email" && s.methodTabActive]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: method === "email" }}
                  >
                    <Ionicons name="mail-outline" size={16} color={method === "email" ? C.primary : C.textMuted} />
                    <Text style={[s.methodTabText, method === "email" && s.methodTabTextActive]}>Email</Text>
                  </TouchableOpacity>
                )}
              </View>

              {method === "phone" && (
                <>
                  <Text style={s.fieldLabel}>Phone Number</Text>
                  <PhoneInput
                    value={phone}
                    onChangeText={v => { setPhone(v); clearError(); }}
                    autoFocus
                  />
                </>
              )}

              {method === "email" && (
                <InputField
                  label="Email Address"
                  value={email}
                  onChangeText={v => { setEmail(v); clearError(); }}
                  placeholder="your@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoFocus
                />
              )}
            </>
          )}

          {step === "otp" && (
            <>
              <View style={s.sentToRow}>
                <Ionicons name={method === "phone" ? "call-outline" : "mail-outline"} size={16} color={C.textMuted} />
                <Text style={s.sentToText}>
                  Code sent to {method === "phone" ? `+92 ${phone}` : email}
                </Text>
              </View>

              <OtpDigitInput
                value={otp}
                onChangeText={v => { setOtp(v); clearError(); }}
                hasError={!!error}
                onComplete={() => handleVerifyOtp()}
              />

              <DevOtpBanner otp={devOtp} />

              <TouchableOpacity activeOpacity={0.7}
                onPress={handleSendResetCode}
                style={[s.resendBtn, resendCooldown > 0 && s.resendDisabled]}
                disabled={resendCooldown > 0}
                accessibilityRole="button"
              >
                <Ionicons name="refresh-outline" size={16} color={resendCooldown > 0 ? C.textMuted : C.primary} />
                <Text style={[s.resendText, resendCooldown > 0 && { color: C.textMuted }]}>
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Code"}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === "newPassword" && (
            <>
              <InputField
                label="New Password"
                value={newPassword}
                onChangeText={v => { setNewPassword(v); clearError(); }}
                placeholder="Enter new password"
                secureTextEntry={!showPwd}
                rightIcon={showPwd ? "eye-off-outline" : "eye-outline"}
                onRightIconPress={() => setShowPwd(v => !v)}
                autoFocus
              />
              <PasswordStrengthBar password={newPassword} />

              <InputField
                label="Confirm Password"
                value={confirmPassword}
                onChangeText={v => { setConfirmPassword(v); clearError(); }}
                placeholder="Re-enter new password"
                secureTextEntry={!showConfirmPwd}
                rightIcon={showConfirmPwd ? "eye-off-outline" : "eye-outline"}
                onRightIconPress={() => setShowConfirmPwd(v => !v)}
                error={!!confirmPassword && newPassword !== confirmPassword}
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <Text style={s.mismatchText}>Passwords do not match</Text>
              )}
            </>
          )}

          {step === "totp" && (
            <>
              <View style={s.totpHeader}>
                <View style={s.totpIconWrap}>
                  <Ionicons name="shield-checkmark" size={32} color={C.primary} />
                </View>
                <Text style={s.totpTitle}>Two-Factor Authentication</Text>
                <Text style={s.totpSub}>Enter the 6-digit code from your authenticator app</Text>
              </View>

              <OtpDigitInput
                value={totpCode}
                onChangeText={v => { setTotpCode(v); clearError(); }}
                hasError={!!error}
                onComplete={() => handleTotpSubmit()}
              />
            </>
          )}

          {error ? <AlertBox type="error" message={error} /> : null}

          <AuthButton
            label={
              step === "method" ? "Send Reset Code"
                : step === "otp" ? "Verify Code"
                : step === "newPassword" ? "Reset Password"
                : step === "totp" ? "Verify & Reset"
                : ""
            }
            onPress={
              step === "method" ? handleSendResetCode
                : step === "otp" ? handleVerifyOtp
                : step === "newPassword" ? handleResetPassword
                : step === "totp" ? handleTotpSubmit
                : () => {}
            }
            loading={loading}
            icon={step === "newPassword" ? "lock-closed-outline" : step === "otp" ? "checkmark-circle-outline" : undefined}
          />

          <TouchableOpacity activeOpacity={0.7}
            onPress={() => router.replace("/auth")}
            style={s.loginLink}
            accessibilityLabel="Back to login"
            accessibilityRole="link"
          >
            <Text style={s.loginLinkText}>Back to Login</Text>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  gradient: { flex: 1 },
  topSection: { alignItems: "center", paddingBottom: spacing.xl, paddingHorizontal: spacing.xl },
  backBtn: {
    position: "absolute", left: spacing.lg,
    top: Platform.OS === "web" ? 67 : 50,
    width: 40, height: 40, borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  headerIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center", marginBottom: spacing.md,
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 26, color: "#fff", marginBottom: 4 },
  headerSub: { ...typography.body, color: "rgba(255,255,255,0.85)", textAlign: "center", marginBottom: spacing.lg },
  progressRow: { marginBottom: spacing.sm },

  card: { backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xxl, flex: 1 },

  methodTabs: { flexDirection: "row", backgroundColor: C.surfaceSecondary, borderRadius: radii.lg, padding: 3, marginBottom: spacing.xl, gap: 2 },
  methodTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: radii.md },
  methodTabActive: { backgroundColor: C.surface, ...shadows.sm },
  methodTabText: { ...typography.captionMedium, color: C.textMuted },
  methodTabTextActive: { color: C.text, fontFamily: "Inter_600SemiBold" },

  fieldLabel: { ...typography.captionMedium, color: C.textSecondary, marginBottom: spacing.sm },

  sentToRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.surfaceSecondary, borderRadius: radii.md, padding: 12, marginBottom: spacing.lg },
  sentToText: { ...typography.caption, color: C.textMuted, flex: 1 },

  resendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, marginBottom: spacing.md },
  resendDisabled: { opacity: 0.5 },
  resendText: { ...typography.bodyMedium, color: C.primary },

  mismatchText: { ...typography.caption, color: C.danger, marginTop: -8, marginBottom: spacing.md, paddingLeft: 4 },

  totpHeader: { alignItems: "center", marginBottom: spacing.xl },
  totpIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  totpTitle: { ...typography.subtitle, color: C.text, marginBottom: 6, textAlign: "center" },
  totpSub: { ...typography.caption, color: C.textMuted, textAlign: "center" },

  loginLink: { alignItems: "center", marginTop: spacing.xl },
  loginLinkText: { ...typography.bodyMedium, color: C.primary },

  doneCenter: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xxl },
  doneCard: { backgroundColor: C.surface, borderRadius: radii.xxl, padding: spacing.xxxl, alignItems: "center", width: "100%", ...shadows.lg },
  doneIconWrap: { marginBottom: spacing.xl },
  doneIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.success, alignItems: "center", justifyContent: "center" },
  doneTitle: { ...typography.h2, color: C.text, marginBottom: spacing.sm, textAlign: "center" },
  doneSub: { ...typography.body, color: C.textMuted, textAlign: "center", marginBottom: spacing.xxl, lineHeight: 22 },
});
