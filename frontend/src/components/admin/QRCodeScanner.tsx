import React, { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, RefreshCw } from "lucide-react";
import type { Html5Qrcode } from "html5-qrcode";

interface QRCodeScannerProps {
  onScan: (decodedText: string) => void;
  onError?: (errorMessage: string) => void;
  paused?: boolean;
}

function showCameraPreviewNormally(regionId: string) {
  const video = document.querySelector<HTMLVideoElement>(`#${regionId} video`);
  if (!video) return;
  video.style.setProperty("transform", "none", "important");
  video.style.setProperty("-webkit-transform", "none", "important");
}

export function QRCodeScanner({ onScan, onError, paused = false }: QRCodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const regionId = "unity-qr-reader";
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const lastScannedRef = useRef<string>("");
  const lastScannedTimeRef = useRef<number>(0);
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  const pausedRef = useRef(paused);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;
    let disposed = false;

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (disposed) return;
        html5QrCode = new Html5Qrcode(regionId, { verbose: false });
        scannerRef.current = html5QrCode;

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        };

        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          (decodedText: string) => {
            if (pausedRef.current) return;
            const now = Date.now();
            if (
              decodedText !== lastScannedRef.current ||
              now - lastScannedTimeRef.current > 5000
            ) {
              lastScannedRef.current = decodedText;
              lastScannedTimeRef.current = now;
              onScanRef.current(decodedText);
            }
          },
          () => {
          }
        );

        showCameraPreviewNormally(regionId);
        requestAnimationFrame(() => showCameraPreviewNormally(regionId));

        if (disposed) {
          await html5QrCode.stop();
          return;
        }
        setCameraActive(true);
        setCameraError(null);
      } catch (err: unknown) {
        if (disposed) return;
        // Permission denial is an expected station fallback, not an app crash.
        console.warn("Camera scanner unavailable:", err);
        const message = err instanceof Error
          ? err.message
          : typeof err === "string" && err.trim()
            ? err
            : "Could not start camera. Check permission or use the registration number below.";
        setCameraError(
          message
        );
        setCameraActive(false);
        onErrorRef.current?.(message);
      }
    }

    startScanner();

    return () => {
      disposed = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (!scanner) return;
      const cleanup = async () => {
        try {
          if (scanner.isScanning) await scanner.stop();
          scanner.clear();
        } catch {
          // The camera may already have stopped during navigation.
        }
      };
      void cleanup();
    };
  }, [retryKey]);

  return (
    <div className="relative flex min-h-[390px] flex-col items-center justify-center overflow-hidden rounded-[22px] border border-white/10 bg-black shadow-[inset_0_0_80px_rgba(0,0,0,.65)]">
      <div id={regionId} className="w-full max-w-lg overflow-hidden" />

      {!cameraActive && !cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-6 text-center text-white/70 backdrop-blur-sm">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-[#d9ff00] text-black"><Camera className="h-6 w-6 animate-pulse" /></span>
          <p className="mt-4 text-sm font-black uppercase tracking-[0.08em] text-white">Starting camera</p>
          <p className="mt-1 text-xs text-white/35">Allow camera access to scan runner tickets.</p>
        </div>
      )}

      {cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black p-6 text-center text-white/70">
          <CameraOff className="mb-3 h-10 w-10 text-rose-500" />
          <p className="text-sm font-black uppercase tracking-[0.08em] text-rose-400">Camera unavailable</p>
          <p className="mt-1 max-w-xs text-xs text-white/45">{cameraError}</p>
          <button
            type="button"
            onClick={() => { setCameraError(null); setRetryKey((key) => key + 1); }}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#d9ff00] px-4 py-2.5 text-xs font-black text-black transition hover:bg-white"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Try camera again
          </button>
          <p className="mt-3 text-xs text-white/35">Use the desk lookup below while the camera is unavailable.</p>
        </div>
      )}

      {/* Targeting Overlay Frame */}
      {cameraActive && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="relative h-60 w-60 rounded-[28px] border border-[#d9ff00]/35 shadow-[0_0_60px_rgba(217,255,0,.12)]">
            <div className="absolute -left-1 -top-1 h-7 w-7 rounded-tl-xl border-l-4 border-t-4 border-[#d9ff00]" />
            <div className="absolute -right-1 -top-1 h-7 w-7 rounded-tr-xl border-r-4 border-t-4 border-[#d9ff00]" />
            <div className="absolute -bottom-1 -left-1 h-7 w-7 rounded-bl-xl border-b-4 border-l-4 border-[#d9ff00]" />
            <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-br-xl border-b-4 border-r-4 border-[#d9ff00]" />
            <div className="absolute inset-x-5 top-1/2 h-px bg-[#d9ff00] shadow-[0_0_14px_#d9ff00] animate-pulse" />
          </div>
        </div>
      )}

      {cameraActive && <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/65 px-3 py-1.5 font-mono text-[8px] font-black uppercase tracking-[0.16em] text-white/55 backdrop-blur">Hold QR inside the frame</div>}
    </div>
  );
}
