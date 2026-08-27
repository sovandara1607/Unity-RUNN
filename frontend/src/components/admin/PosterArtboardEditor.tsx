import { useEffect, useRef, useState } from "react";
import { Crop, Loader2, MoveHorizontal, MoveVertical, RotateCcw, X } from "lucide-react";

const PREVIEW_LONG_EDGE = 800;

const artboardPresets = [
  { label: "Portrait", detail: "4:5", width: 1200, height: 1500 },
  { label: "Classic", detail: "2:3", width: 1200, height: 1800 },
  { label: "Square", detail: "1:1", width: 1200, height: 1200 },
  { label: "Landscape", detail: "3:2", width: 1500, height: 1000 },
  { label: "Story", detail: "9:16", width: 1080, height: 1920 },
] as const;

interface PosterArtboardEditorProps {
  file: File;
  onCancel: () => void;
  onConfirm: (file: File, artboard: { width: number; height: number }) => Promise<void> | void;
}

function drawPoster(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  zoom: number,
  positionX: number,
  positionY: number,
) {
  const coverScale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * zoom;
  const cropWidth = width / coverScale;
  const cropHeight = height / coverScale;
  const sourceX = (image.naturalWidth - cropWidth) * (positionX / 100);
  const sourceY = (image.naturalHeight - cropHeight) * (positionY / 100);

  context.fillStyle = "#111111";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, width, height);
}

export function PosterArtboardEditor({ file, onCancel, onConfirm }: PosterArtboardEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [positionX, setPositionX] = useState(50);
  const [positionY, setPositionY] = useState(50);
  const [width, setWidth] = useState(1200);
  const [height, setHeight] = useState(1500);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewScale = PREVIEW_LONG_EDGE / Math.max(width, height);
  const previewWidth = Math.max(1, Math.round(width * previewScale));
  const previewHeight = Math.max(1, Math.round(height * previewScale));
  const artboardValid = width >= 400 && width <= 2400 && height >= 400 && height <= 2400 && width * height <= 4_500_000;

  useEffect(() => {
    const objectURL = URL.createObjectURL(file);
    const nextImage = new Image();
    nextImage.onload = () => setImage(nextImage);
    nextImage.onerror = () => setError("This image could not be opened. Choose another poster.");
    nextImage.src = objectURL;
    return () => URL.revokeObjectURL(objectURL);
  }, [file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    drawPoster(context, image, previewWidth, previewHeight, zoom, positionX, positionY);
  }, [image, positionX, positionY, previewHeight, previewWidth, zoom]);

  const reset = () => {
    setZoom(1);
    setPositionX(50);
    setPositionY(50);
  };

  const useArtboard = async () => {
    if (!image || !artboardValid) {
      setError("Keep the custom artboard between 400 and 2400 pixels per side and below 4.5 megapixels.");
      return;
    }
    setPreparing(true);
    setError(null);
    try {
      const output = document.createElement("canvas");
      output.width = width;
      output.height = height;
      const context = output.getContext("2d");
      if (!context) throw new Error("The poster editor is not supported by this browser.");
      drawPoster(context, image, width, height, zoom, positionX, positionY);
      const blob = await new Promise<Blob>((resolve, reject) => {
        // Send a lossless artboard to the API; the server performs the single
        // final JPEG encode before storage, avoiding double-compression.
        output.toBlob((result) => result ? resolve(result) : reject(new Error("Could not prepare the poster.")), "image/png");
      });
      const baseName = file.name.replace(/\.[^.]+$/, "") || "event-poster";
      await onConfirm(new File([blob], `${baseName}-${width}x${height}.png`, { type: "image/png", lastModified: Date.now() }), { width, height });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not prepare the poster.");
      setPreparing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm sm:p-8" role="dialog" aria-modal="true" aria-labelledby="poster-artboard-title">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[28px] border border-white/15 bg-[#f7f7f3] shadow-2xl">
        <header className="flex items-start justify-between gap-6 border-b border-black/10 px-5 py-5 sm:px-7">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#3155ff]">Poster artboard · Your format</p>
            <h2 id="poster-artboard-title" className="mt-1 text-xl font-black tracking-[-0.025em] text-slate-950">Set the final poster frame</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">Choose a format first, then frame exactly what should appear on the final poster.</p>
          </div>
          <button type="button" onClick={onCancel} disabled={preparing} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-black/10 bg-white text-slate-600 transition hover:border-black/30 hover:text-black disabled:opacity-40" aria-label="Close poster editor"><X className="h-4 w-4" /></button>
        </header>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_270px]">
          <div className="bg-[#111] p-4 sm:p-7">
            <div className="flex justify-center">
              <div className="relative w-fit overflow-hidden border border-white/25 bg-black shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
                <canvas ref={canvasRef} width={previewWidth} height={previewHeight} className="block h-auto max-h-[65vh] max-w-full" aria-label="Final event poster crop preview" />
                {!image && !error && <div className="absolute inset-0 grid place-items-center text-white/60"><Loader2 className="h-6 w-6 animate-spin" /></div>}
                <span className="pointer-events-none absolute left-3 top-3 h-6 w-6 border-l-2 border-t-2 border-[#d9ff00]" />
                <span className="pointer-events-none absolute right-3 top-3 h-6 w-6 border-r-2 border-t-2 border-[#d9ff00]" />
                <span className="pointer-events-none absolute bottom-3 left-3 h-6 w-6 border-b-2 border-l-2 border-[#d9ff00]" />
                <span className="pointer-events-none absolute bottom-3 right-3 h-6 w-6 border-b-2 border-r-2 border-[#d9ff00]" />
                <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/75 px-2 py-1 font-mono text-[8px] font-black uppercase tracking-[0.16em] text-white">{width} × {height} output</span>
              </div>
            </div>
            {error && <p className="mt-3 text-xs font-bold text-rose-400" role="alert">{error}</p>}
          </div>

          <aside className="flex flex-col border-l border-black/10 bg-white p-5 sm:p-6">
            <div className="mb-6">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600">Artboard format</p>
              <div className="grid grid-cols-2 gap-2">
                {artboardPresets.map((preset) => {
                  const active = width === preset.width && height === preset.height;
                  return <button key={preset.label} type="button" onClick={() => { setWidth(preset.width); setHeight(preset.height); }} className={`border px-3 py-2.5 text-left transition ${active ? "border-[#3155ff] bg-[#3155ff] text-white" : "border-black/10 bg-white text-slate-700 hover:border-black/30"}`}><span className="block text-[9px] font-black uppercase tracking-[0.1em]">{preset.label}</span><span className={`mt-0.5 block font-mono text-[9px] ${active ? "text-white/65" : "text-slate-400"}`}>{preset.detail} · {preset.width}×{preset.height}</span></button>;
                })}
              </div>
              <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <DimensionField label="Width" value={width} onChange={setWidth} />
                <span className="pb-2.5 text-xs font-black text-slate-300">×</span>
                <DimensionField label="Height" value={height} onChange={setHeight} />
              </div>
              {!artboardValid && <p className="mt-2 text-[9px] font-bold leading-4 text-rose-600">Custom artboard is too large. Keep it below 4.5 megapixels.</p>}
            </div>
            <div className="space-y-6">
              <ArtboardRange icon={<Crop />} label="Zoom" value={zoom} min={1} max={3} step={0.01} display={`${Math.round(zoom * 100)}%`} onChange={setZoom} />
              <ArtboardRange icon={<MoveHorizontal />} label="Horizontal position" value={positionX} min={0} max={100} step={1} display={`${positionX}%`} onChange={setPositionX} />
              <ArtboardRange icon={<MoveVertical />} label="Vertical position" value={positionY} min={0} max={100} step={1} display={`${positionY}%`} onChange={setPositionY} />
            </div>
            <button type="button" onClick={reset} disabled={preparing} className="mt-6 inline-flex items-center justify-center gap-2 border border-black/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 transition hover:border-black/30 hover:text-black disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" />Reset frame</button>
            <div className="mt-8 border-t border-black/10 pt-5 lg:mt-auto">
              <p className="mb-4 text-[10px] font-semibold leading-4 text-slate-400">Use 400–2400 px per side. Position the frame to protect faces, headlines, and sponsor marks.</p>
              <button type="button" onClick={useArtboard} disabled={!image || preparing || !artboardValid} className="flex h-13 w-full items-center justify-center gap-2 bg-[#d9ff00] px-5 text-[11px] font-black uppercase tracking-[0.12em] text-black transition hover:bg-[#c9ed00] disabled:cursor-wait disabled:opacity-50">
                {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crop className="h-4 w-4" />}
                {preparing ? "Preparing poster…" : "Use this artboard"}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function DimensionField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label><span className="mb-1 block text-[8px] font-black uppercase tracking-[0.1em] text-slate-400">{label}</span><input type="number" min={400} max={2400} value={value} onChange={(event) => onChange(Math.min(2400, Math.max(400, Number(event.target.value) || 400)))} className="h-10 w-full border border-black/10 px-2 font-mono text-[11px] font-bold outline-none focus:border-[#3155ff]" /></label>;
}

function ArtboardRange({ icon, label, value, min, max, step, display, onChange }: { icon: React.ReactNode; label: string; value: number; min: number; max: number; step: number; display: string; onChange: (value: number) => void }) {
  return <label className="block"><span className="mb-2 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600"><span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>{label}</span><span className="font-mono text-[10px] font-black text-slate-950">{display}</span></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-[#3155ff]" /></label>;
}
