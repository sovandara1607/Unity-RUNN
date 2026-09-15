import React, { useEffect, useRef, useState } from "react";
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

function cameraErrorMessage(error: unknown) {
  const detail = error instanceof Error ? `${error.name} ${error.message}` : String(error || "");
  if (/notallowed|permission|denied/i.test(detail)) {
    return "Camera access is blocked. Allow camera permission in your browser settings, then retry.";
  }
  if (/notfound|devicesnotfound|no camera/i.test(detail)) {
    return "No camera was found. Connect a camera or use ticket lookup below.";
  }
  if (/notreadable|trackstarterror|in use/i.test(detail)) {
    return "The camera is already in use. Close the other camera app, then retry.";
  }
  return "The camera could not start. Retry it or use ticket lookup below.";
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
        const message = cameraErrorMessage(err);
        setCameraError(message);
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
    <div className="relative flex min-h-[360px] flex-col items-center justify-center overflow-hidden rounded-lg border border-black bg-black sm:min-h-[430px]">
      <div id={regionId} className="w-full max-w-lg overflow-hidden" />

      {!cameraActive && !cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black p-6 text-center">
          <div aria-hidden className="mb-5 h-8 w-8 border-2 border-white/25 border-t-[#d9ff00] motion-safe:animate-spin" />
          <p className="text-base font-bold text-white">Connecting to camera</p>
          <p className="mt-2 max-w-sm text-sm leading-5 text-white/60">Your browser may ask for camera permission.</p>
        </div>
      )}

      {cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black p-6 text-center" role="alert">
          <h3 className="text-lg font-bold text-white">Camera unavailable</h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-white/65">{cameraError}</p>
          <button
            type="button"
            onClick={() => { setCameraError(null); setRetryKey((key) => key + 1); }}
            className="mt-6 min-h-11 rounded-md bg-[#d9ff00] px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-white"
          >
            Retry camera
          </button>
          <p className="mt-4 text-xs text-white/45">Ticket lookup remains available below.</p>
        </div>
      )}

      {cameraActive && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="relative h-56 w-56 sm:h-64 sm:w-64">
            <div className="absolute left-0 top-0 h-9 w-9 border-l-[3px] border-t-[3px] border-[#d9ff00]" />
            <div className="absolute right-0 top-0 h-9 w-9 border-r-[3px] border-t-[3px] border-[#d9ff00]" />
            <div className="absolute bottom-0 left-0 h-9 w-9 border-b-[3px] border-l-[3px] border-[#d9ff00]" />
            <div className="absolute bottom-0 right-0 h-9 w-9 border-b-[3px] border-r-[3px] border-[#d9ff00]" />
          </div>
        </div>
      )}

      {cameraActive && <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-white/15 bg-black/85 px-4 py-3 text-center text-sm text-white/70">Hold the ticket QR inside the corners</div>}
    </div>
  );
}
