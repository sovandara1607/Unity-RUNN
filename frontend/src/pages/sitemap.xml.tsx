import type { GetServerSideProps } from "next";

/**
 * Served at /sitemap.xml. Built from the published event list so every race is
 * discoverable; the API is the source of truth rather than a hand-maintained file.
 */

const STATIC_PATHS = ["/", "/events", "/about"];

function urlEntry(loc: string, lastmod?: string): string {
  return `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const api = (process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:8080").replace(/\/$/, "");

  let events: Array<{ slug: string; updated_at?: string }> = [];
  try {
    const response = await fetch(`${api}/api/v1/events/?limit=200`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      const body = await response.json();
      events = body?.data?.events || [];
    }
  } catch {
    // A sitemap listing only the static pages beats a 500.
  }

  const entries = [
    ...STATIC_PATHS.map((path) => urlEntry(`${site}${path}`)),
    ...events.map((event) => urlEntry(`${site}/events/${event.slug}`, event.updated_at?.slice(0, 10))),
  ];

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600");
  res.write(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`);
  res.end();
  return { props: {} };
};

export default function Sitemap() {
  return null;
}
