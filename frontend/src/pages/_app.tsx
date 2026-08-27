import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { AlertProvider } from "../components/alerts/AlertSystem";
import { SiteConfigProvider } from "../components/site/SiteConfigProvider";
import "../styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isPublicClubPage =
    router.pathname === "/" || router.pathname === "/about" || router.pathname.startsWith("/events");

  const page = isPublicClubPage
    ? <div className="public-shell"><Component {...pageProps} /></div>
    : <Component {...pageProps} />;

  return <AlertProvider><SiteConfigProvider>{page}</SiteConfigProvider></AlertProvider>;
}
