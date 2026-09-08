import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { Anton, Inter } from "next/font/google";
import { AlertProvider } from "../components/alerts/AlertSystem";
import { SiteConfigProvider } from "../components/site/SiteConfigProvider";
import { CookieConsent } from "../components/site/CookieConsent";
import "../styles/globals.css";
import "leaflet/dist/leaflet.css";

// Self-hosted through next/font, which emits the files as static assets -- no request
// leaves for Google at runtime.
//
// What these replace:
//  - `.sport-display` was `Impact, Haettenschweiler, "Arial Narrow Bold"`, a system stack
//    absent from most Android devices, where every headline silently reflowed into a
//    non-condensed sans. Anton is the closest condensed heavy face.
//  - `--font-secondary` was "TT Norms Pro" with no @font-face and no file in public/, so
//    the site's stated typeface never loaded anywhere.
//
// `.font-mono` is left as the same face on purpose: the shell rules pair it with
// `tabular-nums slashed-zero`, so it is a numeric role rather than a typeface. Swapping in
// a true monospace would change the art direction, not just fix the loading.
const display = Anton({ subsets: ["latin"], weight: "400", variable: "--font-display", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  // 404/500 render the public header and footer, so they need the public shell's type rules.
  const isPublicClubPage =
    router.pathname === "/" || router.pathname === "/about" || router.pathname.startsWith("/events")
    || router.pathname === "/404" || router.pathname === "/500";

  const page = isPublicClubPage
    ? <div className="public-shell"><Component {...pageProps} /><CookieConsent /></div>
    : <Component {...pageProps} />;

  return (
    <div className={`app-root ${display.variable} ${body.variable}`}>
      <AlertProvider><SiteConfigProvider>{page}</SiteConfigProvider></AlertProvider>
    </div>
  );
}
