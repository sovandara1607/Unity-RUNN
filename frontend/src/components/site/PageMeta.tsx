import Head from "next/head";
import { useRouter } from "next/router";
import { useSiteConfig } from "./SiteConfigProvider";
import { resolveApiAssetUrl } from "../../lib/api";

/**
 * Every public page shipped without a <Head> of any kind -- no title, no description, no
 * canonical, no Open Graph. The event page has a "Share race" button, so every link a
 * runner sent to Telegram, Messenger or WhatsApp unfurled as a blank card.
 *
 * Pass `image` for pages that have their own artwork (an event poster); everything else
 * falls back to the club's hero slide.
 */

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");

type Props = {
  title: string;
  description: string;
  image?: string | null;
  /** Keep search engines off pages that resolved to nothing. */
  noindex?: boolean;
};

export function PageMeta({ title, description, image, noindex }: Props) {
  const { config } = useSiteConfig();
  const router = useRouter();

  const fullTitle = title ? `${title} · ${config.club_name}` : config.club_name;
  const path = router.asPath.split("?")[0].split("#")[0];
  const canonical = SITE_URL ? `${SITE_URL}${path}` : undefined;
  const rawImage = image || config.hero_slides?.[0]?.image_url || config.logo_url;
  const resolved = resolveApiAssetUrl(rawImage);
  const absoluteImage = resolved && !/^https?:\/\//i.test(resolved) && SITE_URL
    ? `${SITE_URL}${resolved.startsWith("/") ? "" : "/"}${resolved}`
    : resolved;

  return (
    <Head>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {canonical && <link rel="canonical" href={canonical} />}
      {noindex && <meta name="robots" content="noindex" />}

      <meta property="og:type" content="website" key="og:type" />
      <meta property="og:site_name" content={config.club_name} key="og:site_name" />
      <meta property="og:title" content={fullTitle} key="og:title" />
      <meta property="og:description" content={description} key="og:description" />
      {canonical && <meta property="og:url" content={canonical} key="og:url" />}
      {absoluteImage && <meta property="og:image" content={absoluteImage} key="og:image" />}

      <meta name="twitter:card" content={absoluteImage ? "summary_large_image" : "summary"} key="tw:card" />
      <meta name="twitter:title" content={fullTitle} key="tw:title" />
      <meta name="twitter:description" content={description} key="tw:description" />
      {absoluteImage && <meta name="twitter:image" content={absoluteImage} key="tw:image" />}
    </Head>
  );
}
