import { useState } from "react";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Button, Copy } from "../../components/ui";
import { colors } from "../../constants/theme";
import { useApi } from "../../services/api/provider";

// Must match mobile/app.json's "scheme" plus the path the backend's
// completeMobileGoogleLogin redirects to.
const DEEP_LINK_REDIRECT = "unityrun://auth/callback";

/**
 * Opens the *same* /auth/google flow the website uses, in a system browser tab — same Google
 * OAuth client, no separate native client to register in Cloud Console. The backend recognizes
 * ?platform=mobile and, instead of setting a cookie and redirecting to the web app, hands back
 * a short-lived one-time code via DEEP_LINK_REDIRECT, which this screen exchanges for the
 * actual bearer session.
 */
export function GoogleSignInButton() {
  const { apiOrigin, session } = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const signIn = async () => {
    setBusy(true);
    setError("");
    try {
      const startUrl = `${apiOrigin}/api/v1/auth/google?platform=mobile`;
      const result = await WebBrowser.openAuthSessionAsync(startUrl, DEEP_LINK_REDIRECT);
      if (result.type !== "success" || !result.url) {
        if (result.type !== "cancel" && result.type !== "dismiss")
          setError("Could not complete Google sign-in.");
        return;
      }
      const url = new URL(result.url);
      const oauthError = url.searchParams.get("error");
      if (oauthError) {
        setError(
          oauthError === "access_denied"
            ? "Google sign-in was cancelled."
            : "Could not sign in with Google. Please try again.",
        );
        return;
      }
      const code = url.searchParams.get("code");
      if (!code) {
        setError("Google sign-in did not return a code.");
        return;
      }
      await session.loginWithGoogle(code);
      router.replace("/(tabs)/account");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in with Google.");
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
