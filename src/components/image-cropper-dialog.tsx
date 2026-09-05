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

export type ContainBgStyle = "blur" | "white" | "neutral";
export type FitMode = "cover" | "contain";

export type CropProcessOptions = {
  fitMode?: FitMode;
  containBg?: ContainBgStyle;
};

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
  const containBg = options?.containBg ?? "blur";

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

  if (fitMode === "contain") {
    // Fill background
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
    } else {
      ctx.fillStyle = "#f5f5f4";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

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

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode image"))),
      "image/jpeg",
      0.92,
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

  useEffect(() => {
    if (!open) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    setFitMode("cover");
    setContainBg("blur");
  }, [imageSrc, open]);

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
          { fitMode, containBg },
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
      const blob = await getCroppedBlob(
        imageSrc,
        area,
        resolvedOutputWidth,
        resolvedOutputHeight,
        { fitMode, containBg },
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
              <DialogTitle>{title || (isAr ? "قص وضبط الصورة" : "Frame & Crop Image")}</DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {description ||
                  (isAr
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
                    onClick={() => setContainBg("blur")}
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-medium transition-all",
                      containBg === "blur"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {isAr ? "ضبابي فاخر" : "Soft Blur"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setContainBg("white")}
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-medium transition-all",
                      containBg === "white"
                        ? "bg-background text-foreground shadow-sm"
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
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {isAr ? "محايد" : "Neutral"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="relative h-[min(46vh,410px)] min-h-60 w-full shrink-0 overflow-hidden rounded-2xl bg-neutral-950 shadow-inner">
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
                    {isAr ? "الصورة كاملة دون أي قص" : "Entire photo preserved"}
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
                  <RotateCcw className="h-4 w-4" />
                  {isAr ? "إعادة ضبط" : "Reset"}
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0 rounded-full"
                  onClick={() => adjustZoom(-0.15)}
                  disabled={isBusy || zoom <= 1}
                  aria-label={isAr ? "تصغير" : "Zoom out"}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Slider
                  aria-label={isAr ? "مستوى التكبير" : "Zoom level"}
                  min={1}
                  max={4}
                  step={0.05}
                  value={[zoom]}
                  onValueChange={(v) => setZoom(v[0] ?? 1)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0 rounded-full"
                  onClick={() => adjustZoom(0.15)}
                  disabled={isBusy || zoom >= 4}
                  aria-label={isAr ? "تكبير" : "Zoom in"}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <span className="hidden w-14 text-end font-mono text-xs text-muted-foreground sm:block">
                  {Math.round(zoom * 100)}%
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs text-muted-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <span>
                {isAr
                  ? "وضع الاحتواء الكامل يضمن بقاء أبعاد صورتك كاملة دون أي اقتطاع، مع ملء الجوانب بخلفية سينمائية متناسقة."
                  : "Contain mode fits your full photo inside the aspect ratio without clipping, framed by a harmonious backdrop."}
              </span>
            </div>
          )}

          {imageSrc && (
            <details className="group rounded-xl border bg-background" open>
              <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span>{isAr ? "معاينة المظهر في الواجهة" : "Live Storefront Wrapper Preview"}</span>
                <span
                  aria-hidden="true"
                  className="text-muted-foreground transition-transform group-open:rotate-180"
                >
                  ⌄
                </span>
              </summary>
              <div className="grid gap-3 px-3.5 pb-3.5 sm:grid-cols-2 md:grid-cols-3">
                {previewAspects.map((preview) => (
                  <div key={preview.labelEn} className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      {isAr ? preview.labelAr : preview.labelEn}
                    </p>
                    <div
                      className="relative mx-auto w-full overflow-hidden rounded-xl border bg-muted shadow-sm"
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
                {isAr ? "تخطي القص (الأصلية)" : "Skip crop (Original)"}
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
                  ? fitMode === "contain"
                    ? "اعتماد الصورة (كاملة)"
                    : "اعتماد الصورة"
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
