import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { api } from "../../../lib/api";

const roleRank = { USER: 0, STAFF: 1, ADMIN: 2, SUPER_ADMIN: 3 } as const;

function safeRedirect(raw: unknown) {
  return typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
}

function requiredRank(path: string) {
  if (path.startsWith("/admin/users")) return roleRank.SUPER_ADMIN;
  if (path.startsWith("/admin/events") || path.startsWith("/admin/audit-logs")) return roleRank.ADMIN;
  if (path.startsWith("/admin")) return roleRank.STAFF;
  return roleRank.USER;
}

export default function GoogleOAuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    let active = true;
    api.refreshToken()
      .then((result) => {
        if (!active) return;
        const user = result.user;
        const requested = safeRedirect(router.query.redirect);
        const rank = user ? roleRank[user.role] ?? roleRank.USER : roleRank.USER;
        if (rank >= requiredRank(requested)) {
          router.replace(requested);
        } else if (user && rank >= roleRank.STAFF) {
          router.replace("/admin");
        } else {
          router.replace("/dashboard");
        }
      })
      .catch(() => {
        if (active) setError("The Google session could not be completed. Start the sign-in again.");
      });
    return () => { active = false; };
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#111] px-5 text-white">
      <div className="w-full max-w-sm border-l-4 border-[#d9ff00] bg-[#191919] p-7">
        <p className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-[#d9ff00]">Account access</p>
        <h1 className="sport-display mt-3 text-4xl uppercase leading-[0.9]">{error ? "Sign-in stopped" : "Connecting your race wallet"}</h1>
        <p className="mt-4 text-sm leading-6 text-white/55">{error || "Google verified your account. Restoring your Unity Runn Club session now."}</p>
        {error && <Link href="/auth/login" className="mt-6 inline-flex border-b border-white pb-1 text-[10px] font-black uppercase tracking-[0.12em]">Return to sign in</Link>}
      </div>
    </main>
  );
}
