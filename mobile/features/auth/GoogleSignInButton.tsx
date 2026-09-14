import { useState } from "react";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Button, Copy } from "../../components/ui";
import { colors } from "../../constants/theme";
import { useApi } from "../../services/api/provider";

const REDIRECT_URL = "unityrun://auth/callback";

/**
 * Browser-based Google Sign-In: reuses the same OAuth flow the web app already has (see
 * backend/internal/auth/google_oauth.go), opened in an OS-level ephemeral browser session
 * (ASWebAuthenticationSession on iOS, Custom Tabs on Android) instead of the native
 * Google Sign-In SDK. No GoogleService-Info.plist, no per-platform OAuth client, no extra
 * Google Cloud Console setup -- just the web OAuth client the backend already has.
 *
 * The backend redirects the browser straight to REDIRECT_URL with a short-lived, single-use
 * code (see completeMobileGoogleLogin); we hand that code back to the backend to exchange it
 * for the actual bearer session (see MobileGoogleCallback).
 */
export function GoogleSignInButton({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const { session, apiOrigin } = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const signIn = async () => {
    setBusy(true);
    setError("");
    try {
      const startUrl = `${apiOrigin}/api/v1/auth/google?platform=mobile`;
      const result = await WebBrowser.openAuthSessionAsync(
        startUrl,
        REDIRECT_URL,
      );
      if (result.type !== "success") return; // user cancelled/dismissed
      const redirect = new URL(result.url);
      const code = redirect.searchParams.get("code");
      if (redirect.searchParams.get("error") || !code) {
        setError("Could not sign in with Google.");
        return;
      }
      await session.loginWithGoogle(code);
      router.replace("/(tabs)/account");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not sign in with Google.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        secondary
        title="Continue with Google"
        busy={busy}
        disabled={disabled}
        onPress={() => {
          void signIn();
        }}
      />
      {Boolean(error) && (
        <Copy accessibilityRole="alert" style={{ color: colors.error }}>
          {error}
        </Copy>
      )}
    </>
  );
}
