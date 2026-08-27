import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { eventPosterVariantUrl, resolveApiAssetUrl } from "../lib/api";

interface EventArtworkProps {
  coverImage?: string;
  eventName: string;
  imageClassName?: string;
  accentColor?: string;
  fit?: "cover" | "contain";
  variant?: "original" | "card" | "hero";
}

export function EventArtwork({ coverImage, eventName, imageClassName = "", accentColor = "#d9ff00", fit = "contain", variant = "hero" }: EventArtworkProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const posterRef = useRef<HTMLImageElement>(null);
  const hasCover = Boolean(coverImage?.trim());
  const originalSource = resolveApiAssetUrl(coverImage);
  const preferredSource = variant === "original" ? originalSource : eventPosterVariantUrl(coverImage, variant);
  const [source, setSource] = useState(preferredSource);

  useEffect(() => {
    setFailed(false);
    setSource(preferredSource);
    const poster = posterRef.current;
    setLoaded(Boolean(poster?.complete && poster.naturalWidth > 0));
  }, [preferredSource]);

  const handleImageError = () => {
    if (source !== originalSource) {
      setLoaded(false);
      setSource(originalSource);
      return;
    }
    setFailed(true);
  };

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
      {hasCover && !failed && fit === "contain" && <>
        {/* The ambient layer fills wide website surfaces without cropping the actual poster. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={source} alt="" aria-hidden="true" style={{ opacity: loaded ? 0.35 : 0 }} className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl transition-opacity duration-500" />
        <div className="absolute inset-0 bg-black/30" />
      </>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {hasCover && !failed && <img ref={posterRef} src={source} alt={`${eventName} event poster`} onLoad={() => setLoaded(true)} onError={handleImageError} style={{ opacity: loaded ? 1 : 0 }} className={`absolute inset-0 h-full w-full transition duration-500 ${fit === "contain" ? "object-contain" : "object-cover"} ${imageClassName}`} />}
    </div>
  );
}
