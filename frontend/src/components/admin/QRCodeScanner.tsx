import React, { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, RefreshCw } from "lucide-react";

interface QRCodeScannerProps {
  onScan: (decodedText: string) => void;
  onError?: (errorMessage: string) => void;
  paused?: boolean;
}

export function QRCodeScanner({ onScan, onError, paused = false }: QRCodeScannerProps) {
  const scannerRef = useRef<any>(null);
  const regionId = "unity-qr-reader";
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const lastScannedRef = useRef<string>("");
  const lastScannedTimeRef = useRef<number>(0);

  useEffect(() => {
    let html5QrCode: any = null;

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        html5QrCode = new Html5Qrcode(regionId);
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
            const now = Date.now();
            // Prevent spamming the exact same scan within 2 seconds
            if (
              decodedText !== lastScannedRef.current ||
              now - lastScannedTimeRef.current > 2000
            ) {
              lastScannedRef.current = decodedText;
              lastScannedTimeRef.current = now;
              onScan(decodedText);
            }
          },
          (err: any) => {
            // Ignored individual frame errors during continuous video feed
          }
        );

        setCameraActive(true);
        setCameraError(null);
      } catch (err: any) {
        console.error("Camera scanner error:", err);
        setCameraError(
          err?.message || "Could not start camera. Please ensure camera permissions are granted."
        );
        setCameraActive(false);
        if (onError) onError(err?.message || "Camera start failed");
      }
    }

    startScanner();

    return () => {
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current.stop().then(() => {
              scannerRef.current.clear();
            });
          }
        } catch (e) {
          // ignore cleanup errors
        }
      }
    };
  }, [onScan, onError]);

  return (
    <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-xl flex flex-col items-center justify-center min-h-[320px]">
      <div id={regionId} className="w-full max-w-sm overflow-hidden" />

      {!cameraActive && !cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/90 backdrop-blur-sm text-slate-300">
          <Camera className="w-10 h-10 text-orange-500 animate-pulse mb-3" />
          <p className="text-sm font-medium">Requesting camera access...</p>
          <p className="text-xs text-slate-500 mt-1">Point your camera at a runner's ticket QR code</p>
        </div>
      )}

      {cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900 text-slate-300">
          <CameraOff className="w-10 h-10 text-rose-500 mb-3" />
          <p className="text-sm font-semibold text-rose-400">Camera Unavailable</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">{cameraError}</p>
          <p className="text-xs text-slate-500 mt-3">You can still type or paste the QR token manually below.</p>
        </div>
      )}

      {/* Targeting Overlay Frame */}
      {cameraActive && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="w-56 h-56 border-2 border-orange-500/80 rounded-2xl relative">
            <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-orange-500 -mt-1 -ml-1 rounded-tl" />
            <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-orange-500 -mt-1 -mr-1 rounded-tr" />
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-orange-500 -mb-1 -ml-1 rounded-bl" />
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-orange-500 -mb-1 -mr-1 rounded-br" />
          </div>
        </div>
      )}
    </div>
  );
}
