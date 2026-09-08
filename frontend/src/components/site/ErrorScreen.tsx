import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SportFooter, SportHeader } from "../SportHeader";
import { useSiteConfig } from "./SiteConfigProvider";
import { Button } from "../primitives/Button";
import { PageMeta } from "./PageMeta";

/**
 * The shared shape for a page that cannot show what was asked for. Before this, a typo'd
 * URL landed on Next's unstyled default 404 -- no header, no footer, no way back.
 */

type Props = {
  code?: string;
  title: string;
  message: string;
  /** Rendered instead of the default "Race calendar" action when supplied. */
  action?: React.ReactNode;
};

export function ErrorScreen({ code, title, message, action }: Props) {
  const { config } = useSiteConfig();
  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: config.background_color }}>
      <PageMeta title={title} description={message} noindex />
      <SportHeader />
      <main className="mx-auto flex min-h-[62vh] max-w-[1200px] flex-col justify-center px-5 py-20 sm:px-8">
        {code && (
          <p className="font-mono text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: config.primary_color }}>
            Error {code}
          </p>
        )}
        <h1 className="sport-display mt-4 text-6xl uppercase leading-[0.85] tracking-[-0.03em] sm:text-8xl">{title}</h1>
        <p className="mt-5 max-w-md text-sm font-medium leading-6 text-white/60">{message}</p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          {action || (
            <>
              <Button href="/events">Race calendar <ArrowRight className="h-4 w-4" /></Button>
              <Link href="/" className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/60 underline underline-offset-4 transition hover:text-white">
                Back to the club
              </Link>
            </>
          )}
        </div>
      </main>
      <SportFooter />
    </div>
  );
}
