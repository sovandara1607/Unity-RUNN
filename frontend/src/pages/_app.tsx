import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { AlertProvider } from "../components/alerts/AlertSystem";
import { SiteConfigProvider } from "../components/site/SiteConfigProvider";
import { CookieConsent } from "../components/site/CookieConsent";
import "../styles/globals.css";
import "leaflet/dist/leaflet.css";

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isPublicClubPage =
    router.pathname === "/" || router.pathname === "/about" || router.pathname.startsWith("/events");

  const page = isPublicClubPage
    ? <div className="public-shell"><Component {...pageProps} /><CookieConsent /></div>
    : <Component {...pageProps} />;

  return <AlertProvider><SiteConfigProvider>{page}</SiteConfigProvider></AlertProvider>;
}
