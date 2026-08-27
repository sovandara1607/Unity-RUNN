import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../../lib/api";
import { getRealtimeSocket } from "../../lib/realtime";
import type { SiteConfig } from "../../types";

export const defaultSiteConfig: SiteConfig = {
  club_name: "Unity Runn Club",
  location_label: "Phnom Penh · KH",
  logo_url: "/Unity-Logos/logo%20UNTR-02.png",
  primary_color: "#d9ff00",
  accent_color: "#3155ff",
  background_color: "#111111",
  announcement_enabled: false,
  announcement_text: "",
  announcement_href: "",
  announcement_event_id: null,
  announcement_event_name: "",
  announcement_event_slug: "",
  hero_intro: "Run loud, together — quality training and real race days for Phnom Penh’s running community.",
  hero_title_primary: "Unity",
  hero_title_secondary: "Run Club",
  mission_eyebrow: "Founded 2026 · Phnom Penh, Cambodia",
  mission_text: "Unity Runn Club is a Cambodia-born crew making running more social, more useful, and more fun.",
  mission_supporting_text: "We create quality training and events, then turn that energy into real opportunities for young runners.",
  primary_cta_label: "Explore events",
  primary_cta_href: "/events",
  footer_text: "Unity Runn Club · Phnom Penh, Cambodia",
  value_messages: ["Grow the sport", "Back the next wave", "Connect the good stuff"],
  hero_slides: [
    { image_url: "/images/club/riverside-run.jpg", alt: "Unity runners moving together along the Phnom Penh riverside at dawn", eyebrow: "Dawn miles · Riverside", title: "Move as a crew.", copy: "Easy starts, honest effort, and enough company to make the next kilometre feel possible." },
    { image_url: "/images/club/race-start.jpg", alt: "Runners accelerating together at a community race start in Phnom Penh", eyebrow: "Race morning · Phnom Penh", title: "Earn the start line.", copy: "Training turns into something real when the road closes, the clock starts, and everyone commits." },
    { image_url: "/images/club/finish-together.jpg", alt: "Run club members recovering and celebrating together after a morning run", eyebrow: "After the run · Together", title: "Stay for the people.", copy: "The finish matters. So do the conversations, encouragement, and friendships that follow it." },
  ],
};

interface SiteConfigContextValue {
  config: SiteConfig;
  setConfig: (config: SiteConfig) => void;
  loading: boolean;
  realtimeConnected: boolean;
}

const SiteConfigContext = createContext<SiteConfigContextValue | null>(null);

export function SiteConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState(defaultSiteConfig);
  const [loading, setLoading] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  useEffect(() => {
    let active = true;
    const applyConfig = (value: SiteConfig) => {
      if (!active) return;
      setConfig((current) => {
        const currentTime = current.updated_at ? Date.parse(current.updated_at) : 0;
        const incomingTime = value.updated_at ? Date.parse(value.updated_at) : Date.now();
        return currentTime > incomingTime ? current : { ...defaultSiteConfig, ...value };
      });
    };
    const refresh = () => api.getSiteConfig().then(applyConfig).catch(() => undefined);
    const realtime = getRealtimeSocket();
    const markConnected = () => setRealtimeConnected(true);
    const markDisconnected = () => setRealtimeConnected(false);

    refresh().finally(() => { if (active) setLoading(false); });
    realtime?.on("site-config:updated", applyConfig);
    // Redis Pub/Sub is intentionally ephemeral. Refresh after every reconnect
    // so a browser that was offline cannot miss the latest published version.
    realtime?.on("connect", markConnected);
    realtime?.on("connect", refresh);
    realtime?.on("disconnect", markDisconnected);
    realtime?.connect();

    return () => {
      active = false;
      realtime?.off("site-config:updated", applyConfig);
      realtime?.off("connect", markConnected);
      realtime?.off("connect", refresh);
      realtime?.off("disconnect", markDisconnected);
      realtime?.disconnect();
    };
  }, []);

  const value = useMemo(() => ({ config, setConfig, loading, realtimeConnected }), [config, loading, realtimeConnected]);
  return <SiteConfigContext.Provider value={value}>{children}</SiteConfigContext.Provider>;
}

export function useSiteConfig() {
  const context = useContext(SiteConfigContext);
  if (!context) throw new Error("useSiteConfig must be used within SiteConfigProvider");
  return context;
}
