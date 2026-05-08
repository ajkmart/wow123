export { executeCaptcha, isRecaptchaLoaded } from "./captcha/index";
export { canonicalizePhone, formatPhoneForApi, isValidPhone } from "./phone";
export {
  GoogleOAuthProvider,
  useGoogleLogin,
  useFacebookLogin,
  initFacebookSDK,
  loadGoogleGSIToken,
  loadFacebookAccessToken,
  decodeGoogleJwtPayload,
  type OAuthResult,
  type OAuthError,
} from "./oauth/index";
export { TwoFactorSetup, TwoFactorVerify } from "./two-factor/index";
export type { TwoFactorSetupProps, TwoFactorVerifyProps } from "./two-factor/types";
export { MagicLinkSender } from "./magic-link/index";
export type { MagicLinkSenderProps } from "./magic-link/types";
export { useAuthConfig, invalidateAuthConfigCache } from "./useAuthConfig";
export type { AuthConfig } from "./useAuthConfig";
