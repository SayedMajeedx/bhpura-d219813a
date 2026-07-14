import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";

type Props = {
  open: boolean;
  imageSrc: string | null;
  /** width / height ratio — defaults to 3/4 to match storefront product cards */
  aspect?: number;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
  busy?: boolean;
  outputWidth?: number;
  outputHeight?: number;
  heroPreview?: boolean;
};

async function getCroppedBlob(imageSrc: string, area: Area, outputWidth?: number, outputHeight?: number): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth ?? Math.round(area.width);
  canvas.height = outputHeight ?? Math.round(area.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to encode image"))), "image/jpeg", 0.92);
  });
}

export function ImageCropperDialog({ open, imageSrc, aspect = 3 / 4, onCancel, onConfirm, busy, outputWidth, outputHeight, heroPreview = false }: Props) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  const handleConfirm = async () => {
    if (!imageSrc || !area) return;
    const blob = await getCroppedBlob(imageSrc, area, outputWidth, outputHeight);
    await onConfirm(blob);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onCancel(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isAr ? "قص الصورة" : "Crop image"}</DialogTitle>
        </DialogHeader>
        <div className="relative h-[min(52vh,420px)] w-full overflow-hidden rounded-md bg-muted">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              objectFit="contain"
            />
          )}
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">{isAr ? "التكبير" : "Zoom"}</label>
          <Slider min={1} max={4} step={0.05} value={[zoom]} onValueChange={(v) => setZoom(v[0] ?? 1)} />
        </div>
        {heroPreview && imageSrc && <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{isAr ? "معاينة مباشرة للواجهة" : "Live storefront preview"}</p>
          <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-muted">
            <div className="pointer-events-none absolute inset-0">
              <Cropper image={imageSrc} crop={crop} zoom={zoom} aspect={aspect} onCropChange={() => {}} onZoomChange={() => {}} objectFit="contain" />
            </div>
            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between text-white mix-blend-difference">
              <span className="grid h-9 w-9 place-items-center border border-current text-2xl font-extralight leading-none">‹</span>
              <span className="grid h-9 w-9 place-items-center border border-current text-2xl font-extralight leading-none">›</span>
            </div>
          </div>
        </div>}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>{isAr ? "إلغاء" : "Cancel"}</Button>
          <Button onClick={handleConfirm} disabled={busy || !area}>
            {busy && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
            {isAr ? "تأكيد القص" : "Confirm crop"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
