import { useRef, useState } from "react";
import { ImagePlus, Link2, Loader2, Replace, Trash2, UploadCloud } from "lucide-react";
import { api, resolveApiAssetUrl } from "../../lib/api";

const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];
const maxBytes = 8 * 1024 * 1024;

interface EventPosterFieldProps {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  onUploadStateChange?: (uploading: boolean) => void;
  onUploadError?: (message: string | null) => void;
}

export function EventPosterField({
  value,
  onChange,
  disabled = false,
  onUploadStateChange,
  onUploadError,
}: EventPosterFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseFile = () => inputRef.current?.click();

  const reportError = (message: string | null) => {
    setError(message);
    onUploadError?.(message);
  };

  const uploadFile = async (file?: File) => {
    if (!file) return;
    reportError(null);
    if (!acceptedTypes.includes(file.type)) {
      reportError("Use a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > maxBytes) {
      reportError("Poster must be no larger than 8 MB.");
      return;
    }

    try {
      setUploading(true);
      onUploadStateChange?.(true);
      const result = await api.uploadEventPoster(file);
      const uploadedUrl = result?.url?.trim();
      if (!uploadedUrl) throw new Error("The poster uploaded, but the server did not return its URL.");
      onChange(uploadedUrl);
      reportError(null);
    } catch (err: unknown) {
      reportError(err instanceof Error ? err.message : "Could not upload the poster.");
    } finally {
      setUploading(false);
      onUploadStateChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700">Event poster</label>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-400">JPG, PNG or WebP · up to 8 MB · landscape artwork works best</p>
        </div>
        {value && <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-600">Ready</span>}
      </div>

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={disabled || uploading} onChange={(event) => uploadFile(event.target.files?.[0])} />

      {value ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
          <div className="relative aspect-[16/7] min-h-44">
            {/* Event posters may come from the API server or an external CDN. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resolveApiAssetUrl(value)} alt="Event poster preview" className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/80 to-transparent p-4 pt-12">
              <p className="min-w-0 truncate text-[10px] font-semibold text-white/65">{value}</p>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={chooseFile} disabled={disabled || uploading} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-[11px] font-bold text-slate-900 transition hover:bg-[#d9ff00] disabled:opacity-50">
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Replace className="h-3.5 w-3.5" />} Replace
                </button>
                <button type="button" onClick={() => { onChange(""); reportError(null); }} disabled={disabled || uploading} className="grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white transition hover:bg-rose-600 disabled:opacity-50" aria-label="Remove event poster">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={chooseFile}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); uploadFile(event.dataTransfer.files?.[0]); }}
          className={`group flex min-h-52 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-50 ${dragging ? "border-orange-500 bg-orange-50" : "border-slate-200 bg-slate-50 hover:border-slate-400 hover:bg-white"}`}
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-900 text-white transition group-hover:bg-orange-600">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
          </span>
          <span className="mt-4 text-sm font-bold text-slate-900">{uploading ? "Uploading poster…" : "Drop poster here or choose an image"}</span>
          <span className="mt-1 text-[11px] text-slate-400">The artwork will appear on the event page and race calendar.</span>
        </button>
      )}

      {error && <p className="mt-2 text-[11px] font-semibold text-rose-600" role="alert">{error}</p>}

      <details className="mt-3 text-[11px] text-slate-500">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 font-semibold hover:text-slate-800"><Link2 className="h-3.5 w-3.5" /> Use an image URL instead</summary>
        <div className="relative mt-2">
          <ImagePlus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          {/* Uploaded assets intentionally use origin-neutral paths such as
              /api/v1/media/events/.... A native type="url" input rejects
              those paths and prevents the parent event form from submitting. */}
          <input type="text" inputMode="url" value={value} disabled={disabled || uploading} onChange={(event) => { onChange(event.target.value); reportError(null); }} placeholder="/api/v1/media/… or https://example.com/poster.jpg" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
      </details>
    </div>
  );
}
