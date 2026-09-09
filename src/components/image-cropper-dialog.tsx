import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Check, Crop, Loader2, Maximize2, Minus, Plus, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { getImageCropPreset, type ImageCropPresetKey } from "@/lib/image-crop-presets";
import { cn } from "@/lib/utils";

export type ContainBgStyle = "transparent" | "blur" | "white" | "neutral";
export type FitMode = "cover" | "contain";

export type CropProcessOptions = {
  fitMode?: FitMode;
  containBg?: ContainBgStyle;
  format?: "image/png" | "image/jpeg" | "image/webp";
  allowTransparency?: boolean;
};

export function isLikelyTransparent(imageSrc?: string | null): boolean {
  if (!imageSrc) return false;
  if (
    imageSrc.startsWith("data:image/png") ||
    imageSrc.startsWith("data:image/webp") ||
    imageSrc.startsWith("data:image/svg+xml")
  ) {
    return true;
  }
  const clean = imageSrc.split("?")[0].toLowerCase();
  return clean.endsWith(".png") || clean.endsWith(".webp") || clean.endsWith(".svg");
}

type Props = {
  open: boolean;
  imageSrc: string | null;
  preset?: ImageCropPresetKey;
  /** width / height ratio — use a preset for production upload surfaces. */
  aspect?: number;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
  onSkipCrop?: () => void | Promise<void>;
  busy?: boolean;
  outputWidth?: number;
  outputHeight?: number;
  heroPreview?: boolean;
  title?: string;
  description?: string;
  /** Optional live overlay title (e.g. section title like "الأكثر مبيعاً") */
  overlayTitle?: string;
  /** Optional live overlay subtitle */
  overlaySubtitle?: string;
  /** Whether to render live dark gradient overlay */
  overlayGradient?: boolean;
  /** Preserve transparent alpha channel without forcing opaque background */
  allowTransparency?: boolean;
  defaultFitMode?: FitMode;
  defaultContainBg?: ContainBgStyle;
};

export async function getCroppedBlob(
  imageSrc: string,
  area: Area | null,
  outputWidth?: number,
  outputHeight?: number,
  options?: CropProcessOptions,
): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });

  const fitMode = options?.fitMode ?? "cover";
  const containBg = options?.containBg ?? (options?.allowTransparency ? "transparent" : "blur");

  const sourceAspect =
    area && area.width > 0 && area.height > 0
      ? area.width / area.height
      : image.naturalWidth > 0 && image.naturalHeight > 0
        ? image.naturalWidth / image.naturalHeight
        : 1;

  const canvasWidth = outputWidth ?? (area ? Math.round(area.width) : image.naturalWidth);
  const canvasHeight =
    outputHeight ??
    Math.round(
      outputWidth && outputHeight
        ? canvasWidth / (outputWidth / outputHeight)
        : canvasWidth / sourceAspect,
    );

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(canvasWidth));
  canvas.height = Math.max(1, Math.round(canvasHeight));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Clear canvas completely to keep transparent base
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (fitMode === "contain") {
    // Fill background only when not transparent
    if (containBg === "blur") {
      ctx.save();
      const bgScale = Math.max(
        canvas.width / image.naturalWidth,
        canvas.height / image.naturalHeight,
      );
      const bgW = image.naturalWidth * bgScale;
      const bgH = image.naturalHeight * bgScale;
      const bgX = (canvas.width - bgW) / 2;
      const bgY = (canvas.height - bgH) / 2;
      ctx.filter = "blur(32px) brightness(0.85)";
      const pad = 40;
      ctx.drawImage(image, bgX - pad, bgY - pad, bgW + pad * 2, bgH + pad * 2);
      ctx.restore();

      // Subtle darken for contrast
      ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (containBg === "white") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (containBg === "neutral") {
      ctx.fillStyle = "#f5f5f4";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    // If containBg === "transparent", canvas remains completely transparent

    // Scale and center full image within bounds
    const fitScale = Math.min(
      canvas.width / image.naturalWidth,
      canvas.height / image.naturalHeight,
    );
    const drawW = Math.round(image.naturalWidth * fitScale);
    const drawH = Math.round(image.naturalHeight * fitScale);
    const drawX = Math.round((canvas.width - drawW) / 2);
    const drawY = Math.round((canvas.height - drawH) / 2);

    if (containBg === "blur") {
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
      ctx.shadowBlur = 24;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 6;
      ctx.drawImage(image, drawX, drawY, drawW, drawH);
      ctx.restore();
    } else {
      ctx.drawImage(image, drawX, drawY, drawW, drawH);
    }
  } else {
    const cropArea = area ?? {
      x: 0,
      y: 0,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
    ctx.drawImage(
      image,
      cropArea.x,
      cropArea.y,
      cropArea.width,
      cropArea.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  }

  const isTransparent =
    options?.allowTransparency ||
    containBg === "transparent" ||
    options?.format === "image/png" ||
    (containBg !== "blur" && containBg !== "white" && containBg !== "neutral" && isLikelyTransparent(imageSrc));

  const outputFormat =
    options?.format ?? (isTransparent ? "image/png" : "image/jpeg");

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode image"))),
      outputFormat,
      outputFormat === "image/png" ? undefined : 0.92,
    );
  });
}

export function ImageCropperDialog({
  open,
  imageSrc,
  preset,
  aspect: aspectOverride,
  onCancel,
  onConfirm,
  onSkipCrop,
  busy,
  outputWidth,
  outputHeight,
  heroPreview = false,
  title,
  description,
  overlayTitle,
  overlaySubtitle,
  overlayGradient = false,
  allowTransparency,
  defaultFitMode,
  defaultContainBg,
}: Props) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [fitMode, setFitMode] = useState<FitMode>("cover");
  const [containBg, setContainBg] = useState<ContainBgStyle>("blur");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const cropPreset = preset ? getImageCropPreset(preset) : null;
  const aspect = cropPreset?.aspect ?? aspectOverride ?? 3 / 4;
  const resolvedOutputWidth = cropPreset?.outputWidth ?? outputWidth;
  const resolvedOutputHeight = cropPreset?.outputHeight ?? outputHeight;
  const previewAspects = cropPreset?.previewAspects ?? [
    { labelEn: "Storefront wrapper preview", labelAr: "معاينة إطار الواجهة", aspect },
  ];

  const isTransparentTarget =
    allowTransparency ||
    preset === "logo" ||
    containBg === "transparent" ||
    isLikelyTransparent(imageSrc);

  useEffect(() => {
    if (!open) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    const shouldDefaultTransparent =
      preset === "logo" ||
      allowTransparency ||
      isLikelyTransparent(imageSrc);

    if (shouldDefaultTransparent) {
      setFitMode(defaultFitMode ?? "contain");
      setContainBg(defaultContainBg ?? "transparent");
    } else {
      setFitMode(defaultFitMode ?? "cover");
      setContainBg(defaultContainBg ?? "blur");
    }
  }, [imageSrc, open, preset, allowTransparency, defaultFitMode, defaultContainBg]);

  useEffect(() => {
    if (!open || !imageSrc) {
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      return;
    }

    if (fitMode === "cover" && !area) {
      return;
    }

    let disposed = false;
    const timer = window.setTimeout(async () => {
      try {
        const previewWidth = 800;
        const targetAspect =
          aspect ||
          (resolvedOutputWidth && resolvedOutputHeight
            ? resolvedOutputWidth / resolvedOutputHeight
            : 3 / 4);
        const blob = await getCroppedBlob(
          imageSrc,
          area,
          previewWidth,
          Math.round(previewWidth / targetAspect),
          {
            fitMode,
            containBg,
            allowTransparency: isTransparentTarget,
            format: isTransparentTarget ? "image/png" : "image/jpeg",
          },
        );
        if (disposed) return;
        const nextUrl = URL.createObjectURL(blob);
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return nextUrl;
        });
      } catch {
        // The final confirmation path reports encoding errors; keep preview unobtrusive.
      }
    }, 120);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [
    area,
    aspect,
    containBg,
    fitMode,
    imageSrc,
    isTransparentTarget,
    open,
    resolvedOutputHeight,
    resolvedOutputWidth,
  ]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const onCropComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  const handleConfirm = async () => {
    if (!imageSrc) return;
    if (fitMode === "cover" && !area) return;
    try {
      setProcessing(true);
      const isTransparent =
        allowTransparency ||
        preset === "logo" ||
        containBg === "transparent" ||
        isLikelyTransparent(imageSrc);

      const blob = await getCroppedBlob(
        imageSrc,
        area,
        resolvedOutputWidth,
        resolvedOutputHeight,
        {
          fitMode,
          containBg,
          allowTransparency: isTransparent,
          format: isTransparent ? "image/png" : "image/jpeg",
        },
      );
      await onConfirm(blob);
    } catch {
      toast.error(
        isAr
          ? "تعذّر تجهيز الصورة. جرّب صورة JPEG أو PNG أو WebP أخرى."
          : "We couldn't prepare this image. Try another JPEG, PNG, or WebP file.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleSkip = async () => {
    if (!imageSrc) return;
    try {
      setProcessing(true);
      if (onSkipCrop) {
        await onSkipCrop();
      } else {
        const res = await fetch(imageSrc);
        const blob = await res.blob();
        await onConfirm(blob);
      }
    } catch (err: any) {
      toast.error(err?.message || (isAr ? "تعذر تخطي القص" : "Failed to skip crop"));
    } finally {
      setProcessing(false);
    }
  };

  const isBusy = Boolean(busy || processing);
  const adjustZoom = (delta: number) =>
    setZoom((current) => Math.min(4, Math.max(1, Number((current + delta).toFixed(2)))));
  const reset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !isBusy) onCancel();
      }}
    >
      <DialogContent className="max-h-[94dvh] max-w-3xl overflow-y-auto overscroll-contain p-0">
        <DialogHeader>
          <div className="flex items-start gap-3 border-b px-5 pb-4 pt-5 pe-12 sm:px-6 sm:pe-14">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Crop className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle>
                {title ||
                  (preset === "logo"
                    ? isAr
                      ? "ضبط وتجهيز شعار المتجر"
                      : "Frame & Crop Store Logo"
                    : isAr
                      ? "قص وضبط الصورة"
                      : "Frame & Crop Image")}
              </DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {description ||
                  (preset === "logo"
                    ? isAr
                      ? "تم تفعيل وضع الشفافية تلقائياً للحفاظ على شعارك مفرغاً بدون خلفية وبكامل دقته."
                      : "Transparency mode active: your logo is preserved with transparent background and full quality."
                    : isAr
                      ? "اختر ملء الإطار أو احتواء كامل لمنع قص أي تفاصيل، أو تخطّ القص لاستخدام الصورة الأصلية."
                      : "Choose cover to crop, contain to preserve full height, or skip crop to keep original.")}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-5 sm:px-6">
          {/* Mode Switcher: Cover vs Contain */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="inline-flex rounded-xl border bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => setFitMode("cover")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                  fitMode === "cover"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Crop className="h-3.5 w-3.5" />
                <span>{isAr ? "ملء الإطار (قص)" : "Cover (Crop)"}</span>
              </button>
              <button
                type="button"
                onClick={() => setFitMode("contain")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                  fitMode === "contain"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span>{isAr ? "احتواء كامل (بدون قص)" : "Fit / Contain"}</span>
              </button>
            </div>

            {fitMode === "contain" && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">{isAr ? "الخلفية:" : "Background:"}</span>
                <div className="inline-flex rounded-lg border bg-muted/30 p-0.5">
                  <button
                    type="button"
                    onClick={() => setContainBg("transparent")}
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-medium transition-all",
                      containBg === "transparent"
                        ? "bg-background text-foreground shadow-sm font-semibold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {isAr ? "شفاف (بدون خلفية)" : "Transparent"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setContainBg("white")}
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-medium transition-all",
                      containBg === "white"
                        ? "bg-background text-foreground shadow-sm font-semibold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {isAr ? "أبيض" : "White"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setContainBg("neutral")}
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-medium transition-all",
                      containBg === "neutral"
                        ? "bg-background text-foreground shadow-sm font-semibold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {isAr ? "محايد" : "Neutral"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setContainBg("blur")}
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-medium transition-all",
                      containBg === "blur"
                        ? "bg-background text-foreground shadow-sm font-semibold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {isAr ? "ضبابي فاخر" : "Soft Blur"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div
            className={cn(
              "relative h-[min(46vh,410px)] min-h-60 w-full shrink-0 overflow-hidden rounded-2xl shadow-inner",
              containBg === "transparent" || isTransparentTarget
                ? "bg-[#18181b]"
                : "bg-neutral-950",
            )}
            style={
              containBg === "transparent" || isTransparentTarget
                ? {
                    backgroundImage: `
                      linear-gradient(45deg, rgba(255,255,255,0.06) 25%, transparent 25%),
                      linear-gradient(-45deg, rgba(255,255,255,0.06) 25%, transparent 25%),
                      linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.06) 75%),
                      linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.06) 75%)
                    `,
                    backgroundSize: "20px 20px",
                    backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
                  }
                : undefined
            }
          >
            {imageSrc && (
              fitMode === "contain" ? (
                <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
                  {containBg === "blur" && (
                    <img
                      src={imageSrc}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover blur-2xl scale-125 opacity-70 brightness-75 select-none"
                    />
                  )}
                  {containBg === "white" && <div className="absolute inset-0 bg-white" />}
                  {containBg === "neutral" && (
                    <div className="absolute inset-0 bg-neutral-100 dark:bg-neutral-850" />
                  )}

                  <div
                    className="relative z-10 flex h-full items-center justify-center p-3"
                    style={{ aspectRatio: String(aspect) }}
                  >
                    <img
                      src={imageSrc}
                      alt=""
                      className={cn(
                        "max-h-full max-w-full object-contain select-none",
                        containBg === "blur"
                          ? "drop-shadow-[0_12px_24px_rgba(0,0,0,0.35)]"
                          : "drop-shadow-sm",
                      )}
                    />
                  </div>

                  <span className="pointer-events-none absolute top-3 start-3 z-30 rounded-full bg-black/65 px-3 py-1 text-[11px] font-medium text-white backdrop-blur flex items-center gap-1.5">
                    <Check className="h-3 w-3 text-emerald-400" />
                    {containBg === "transparent"
                      ? isAr
                        ? "خلفية شفافة (بدون خلفية)"
                        : "Transparent background"
                      : isAr
                        ? "الصورة كاملة دون أي قص"
                        : "Entire photo preserved"}
                  </span>
                </div>
              ) : (
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={aspect}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                  objectFit="contain"
                  showGrid
                />
              )
            )}
            {overlayGradient && (
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/10 z-10" />
            )}
            {overlayTitle && (
              <div className="pointer-events-none absolute bottom-12 start-4 z-20 max-w-[20ch]">
                <h3 className="font-display text-xl sm:text-2xl font-bold text-white drop-shadow-md">
                  {overlayTitle}
                </h3>
                {overlaySubtitle && (
                  <p className="text-xs text-white/80 mt-0.5">{overlaySubtitle}</p>
                )}
              </div>
            )}
            {fitMode === "cover" && (
              <span className="pointer-events-none absolute bottom-3 start-3 z-30 rounded-full bg-black/65 px-3 py-1 text-[11px] font-medium text-white backdrop-blur">
                {isAr ? "اسحب لتغيير الموضع" : "Drag to reposition"}
              </span>
            )}
            {resolvedOutputWidth && resolvedOutputHeight && (
              <span
                className="pointer-events-none absolute bottom-3 end-3 z-30 rounded-full bg-black/65 px-3 py-1 font-mono text-[11px] text-white backdrop-blur"
                dir="ltr"
              >
                {resolvedOutputWidth} × {resolvedOutputHeight}
              </span>
            )}
          </div>

          {fitMode === "cover" ? (
            <div className="rounded-xl border bg-muted/20 p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <label className="text-sm font-medium">
                  {isAr ? "التكبير والموضع" : "Zoom & position"}
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 gap-2"
                  onClick={reset}
                  disabled={isBusy}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {isAr ? "إعادة ضبط" : "Reset"}
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => adjustZoom(-0.1)}
                  disabled={isBusy || zoom <= 1}
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <Slider
                  value={[zoom]}
                  min={1}
                  max={4}
                  step={0.05}
                  onValueChange={([val]) => setZoom(val)}
                  disabled={isBusy}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => adjustZoom(0.1)}
                  disabled={isBusy || zoom >= 4}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
              <span>
                {isAr
                  ? containBg === "transparent"
                    ? "يتم الحفاظ على الشعار بدقته الكاملة وخلفيته الشفافة دون إضافة أي لون."
                    : "تظهر الصورة كاملة داخل الإطار دون أي قص، مع تعبئة المساحات المحيطة بالخلفية المختارة."
                  : containBg === "transparent"
                    ? "Logo is preserved with full fidelity and transparent background."
                    : "The full image is displayed without cropping; extra space is filled with the chosen background."}
              </span>
            </div>
          )}

          {heroPreview && previewAspects.length > 0 && (
            <details className="group rounded-xl border bg-muted/10 p-3 text-xs">
              <summary className="cursor-pointer font-medium text-foreground transition-colors hover:text-primary">
                {isAr ? "معاينة إضافية لمقاسات الشاشات" : "Additional responsive previews"}
              </summary>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {previewAspects.map((preview) => (
                  <div key={preview.labelEn} className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">
                      {isAr ? preview.labelAr : preview.labelEn}
                    </span>
                    <div
                      className="relative overflow-hidden rounded-lg bg-neutral-900 border"
                      style={{ aspectRatio: String(preview.aspect) }}
                    >
                      {previewUrl ? (
                        <>
                          <img
                            src={previewUrl}
                            alt={
                              isAr
                                ? `معاينة الصورة على ${preview.labelAr}`
                                : `${preview.labelEn} crop preview`
                            }
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                          {overlayGradient && (
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
                          )}
                          {overlayTitle && (
                            <div className="pointer-events-none absolute inset-0 flex flex-col justify-end p-2.5">
                              <h4 className="font-display text-xs font-bold text-white drop-shadow line-clamp-1">
                                {overlayTitle}
                              </h4>
                              {overlaySubtitle && (
                                <p className="text-[10px] text-white/80 line-clamp-1">
                                  {overlaySubtitle}
                                </p>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="absolute inset-0 grid place-items-center">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        <DialogFooter className="sticky -bottom-1 z-10 mt-1 border-t bg-background/95 px-5 py-4 backdrop-blur sm:px-6">
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" className="min-h-11" onClick={onCancel} disabled={isBusy}>
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 gap-1.5 font-medium border"
                onClick={handleSkip}
                disabled={isBusy}
                title={isAr ? "رفع الصورة الأصلية بدون أي قص أو تعديل" : "Upload original without cropping"}
              >
                <Maximize2 className="h-4 w-4" />
                {isAr
                  ? (preset === "logo" || allowTransparency)
                    ? "استخدام الشعار الأصلي (شفاف)"
                    : "تخطي القص (الأصلية)"
                  : "Skip crop (Original)"}
              </Button>
            </div>
            <Button
              className="min-h-11 min-w-36"
              onClick={handleConfirm}
              disabled={isBusy || (fitMode === "cover" && !area)}
            >
              {isBusy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {processing
                ? isAr
                  ? "جاري تجهيز الصورة…"
                  : "Preparing image…"
                : isAr
                  ? (preset === "logo" || containBg === "transparent")
                    ? "اعتماد الشعار (بدون خلفية)"
                    : fitMode === "contain"
                      ? "اعتماد الصورة (كاملة)"
                      : "اعتماد الصورة"
                  : (preset === "logo" || containBg === "transparent")
                    ? "Use Logo (Transparent)"
                    : fitMode === "contain"
                      ? "Use full image"
                      : "Use this crop"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
