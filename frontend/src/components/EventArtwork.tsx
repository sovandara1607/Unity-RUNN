import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { resolveApiAssetUrl } from "../lib/api";

interface EventArtworkProps {
  coverImage?: string;
  eventName: string;
  imageClassName?: string;
  accentColor?: string;
}

export function EventArtwork({ coverImage, eventName, imageClassName = "", accentColor = "#d9ff00" }: EventArtworkProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const hasCover = Boolean(coverImage?.trim());

  useEffect(() => { setFailed(false); setLoaded(false); }, [coverImage]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#202020]">
      {hasCover && !failed && !loaded && (
        <div className="topo-surface absolute inset-0 animate-pulse" aria-label={`${eventName} poster loading`}>
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
        </div>
      )}
      {(!hasCover || failed) && <div className="topo-surface absolute inset-0" aria-label={`${eventName} event artwork not available`}>
        <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full border border-white/10" />
        <div className="absolute -bottom-12 left-1/3 h-44 w-44 rounded-full border border-white/10" />
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <div>
            <ImageOff className="mx-auto h-6 w-6 text-white/25" />
            <p className="mt-4 font-mono text-[8px] font-black uppercase tracking-[0.2em]" style={{ color: accentColor }}>Unity Runn Club</p>
            <p className="sport-display mt-2 max-w-xs text-3xl uppercase leading-[0.9] tracking-[-0.03em] text-white/30">{failed ? "Poster unavailable" : "Poster coming soon"}</p>
          </div>
        </div>
      </div>}
      {/* Event artwork can be uploaded to the API server or hosted externally. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {hasCover && !failed && <img src={resolveApiAssetUrl(coverImage)} alt={`${eventName} event poster`} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} className={`absolute inset-0 transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"} ${imageClassName}`} />}
    </div>
  );
}
