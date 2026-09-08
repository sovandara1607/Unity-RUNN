import type { GetServerSideProps } from "next";

/**
 * Served at /robots.txt. Dynamic only so the Sitemap directive can carry an absolute URL,
 * which the sitemaps spec requires -- a relative path is silently ignored by crawlers.
 */
export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const lines = [
    "User-agent: *",
    "Allow: /",
    // Operator and runner-private areas; nothing here belongs in an index.
    "Disallow: /admin",
    "Disallow: /auth",
    "Disallow: /dashboard",
    "Disallow: /profile",
  ];
  if (site) lines.push("", `Sitemap: ${site}/sitemap.xml`);

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400");
  res.write(lines.join("\n") + "\n");
  res.end();
  return { props: {} };
};

export default function Robots() {
  return null;
}
