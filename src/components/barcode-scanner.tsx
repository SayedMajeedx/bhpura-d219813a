import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { Camera, Upload, X } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDetected: (code: string) => void;
};

const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
];

export function BarcodeScanner({ open, onOpenChange, onDetected }: Props) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const containerId = "barcode-scanner-region";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    stoppedRef.current = false;
    setError(null);
    setStarting(true);

    let cancelled = false;

    const stop = async () => {
      const s = scannerRef.current;
      scannerRef.current = null;
      if (!s) return;
      try {
        if (s.isScanning) await s.stop();
        await s.clear();
      } catch {
        /* noop */
      }
    };

    const start = async () => {
      try {
        // 1) Explicitly trigger the browser's native camera permission prompt.
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            isAr
              ? "المتصفح لا يدعم الوصول إلى الكاميرا."
              : "This browser does not support camera access.",
          );
        }
        const probeStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        // Release the probe stream — html5-qrcode will open its own.
        probeStream.getTracks().forEach((t) => t.stop());

        if (cancelled) return;

        // Wait a tick to ensure the container div is mounted.
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        const el = document.getElementById(containerId);
        if (!el || cancelled) return;

        const scanner = new Html5Qrcode(containerId, {
          verbose: false,
          formatsToSupport: SUPPORTED_FORMATS,
        });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: { ideal: "environment" } },
          {
            fps: 10,
            qrbox: (w, h) => {
              const min = Math.min(w, h);
              const size = Math.floor(min * 0.75);
              return { width: size, height: Math.floor(size * 0.6) };
            },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            if (stoppedRef.current) return;
            stoppedRef.current = true;
            onDetected(decodedText.trim());
            stop().finally(() => onOpenChange(false));
          },
          () => { /* ignore per-frame decode errors */ },
        );

        // Ensure the injected <video> plays inline on iOS Safari.
        const video = el.querySelector("video");
        if (video) {
          video.setAttribute("playsinline", "true");
          video.setAttribute("webkit-playsinline", "true");
          video.muted = true;
        }

        setStarting(false);
      } catch (e: any) {
        setStarting(false);
        const name = e?.name;
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setError(
            isAr
              ? "تم رفض إذن الكاميرا. فعّل الإذن من إعدادات المتصفح، أو استخدم زر التقاط صورة الكود."
              : "Camera permission denied. Enable it in your browser settings, or use the Upload/Take Photo option.",
          );
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setError(
            isAr
              ? "لم يتم العثور على كاميرا خلفية. استخدم زر التقاط صورة الكود."
              : "No suitable camera found. Use the Upload/Take Photo option.",
          );
        } else {
          setError(
            e?.message ||
              (isAr
                ? "تعذر تشغيل الكاميرا. جرّب التقاط صورة الكود."
                : "Unable to start the camera. Try the Upload/Take Photo option."),
          );
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      stoppedRef.current = true;
      void stop();
    };
  }, [open, isAr, onDetected, onOpenChange]);

  const handleFile = async (file: File) => {
    setError(null);
    // Stop the live scanner if it's running so scanFile can operate.
    const s = scannerRef.current;
    if (s?.isScanning) {
      try { await s.stop(); } catch { /* noop */ }
    }
    const decoder = scannerRef.current ?? new Html5Qrcode(containerId, {
      verbose: false,
      formatsToSupport: SUPPORTED_FORMATS,
    });
    scannerRef.current = decoder;
    try {
      const text = await decoder.scanFile(file, true);
      if (text) {
        stoppedRef.current = true;
        onDetected(text.trim());
        try { await decoder.clear(); } catch { /* noop */ }
        scannerRef.current = null;
        onOpenChange(false);
      }
    } catch (e: any) {
      setError(
        isAr
          ? "تعذر قراءة الباركود من الصورة. حاول التقاط صورة أوضح وأقرب."
          : "Could not read the barcode from that image. Try a clearer, closer photo.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2 flex-row items-center justify-between">
          <DialogTitle>{isAr ? "مسح الباركود" : "Scan barcode"}</DialogTitle>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="close">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>
        <div className="p-4 pt-0 space-y-3">
          <div
            id={containerId}
            className="w-full aspect-square bg-black rounded-md overflow-hidden [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
          />
          {starting && !error && (
            <p className="text-xs text-muted-foreground text-center">
              {isAr ? "جارٍ تشغيل الكاميرا..." : "Starting camera..."}
            </p>
          )}
          {error && (
            <p className="text-xs text-destructive text-center">{error}</p>
          )}
          <p className="text-xs text-muted-foreground text-center">
            {isAr
              ? "وجّه الكاميرا نحو الباركود الموجود على القطعة."
              : "Point the camera at the item's barcode."}
          </p>

          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {isAr ? "أو" : "or"}
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera className="h-4 w-4" />
            <Upload className="h-4 w-4 -ms-1" />
            {isAr ? "التقاط صورة الكود" : "Upload or Take Photo"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
