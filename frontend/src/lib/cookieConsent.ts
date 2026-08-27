export const COOKIE_CONSENT_NAME = "unity_cookie_consent";
export const COOKIE_PREFERENCES_EVENT = "unity:open-cookie-preferences";
export const COOKIE_CONSENT_CHANGED_EVENT = "unity:cookie-consent-changed";

export type CookieConsentChoice = "essential" | "all";

export function readCookieConsent(): CookieConsentChoice | null {
  if (typeof document === "undefined") return null;
  const prefix = `${COOKIE_CONSENT_NAME}=`;
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  return value === "essential" || value === "all" ? value : null;
}

export function saveCookieConsent(choice: CookieConsentChoice) {
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_CONSENT_NAME}=${choice}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_CHANGED_EVENT, { detail: choice }));
}

export function openCookiePreferences() {
  window.dispatchEvent(new Event(COOKIE_PREFERENCES_EVENT));
}
