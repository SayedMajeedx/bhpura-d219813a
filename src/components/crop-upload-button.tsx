import { useEffect, useRef, useState, type ReactNode } from "react";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ImageCropperDialog } from "@/components/image-cropper-dialog";
import { useI18n } from "@/lib/i18n";
import type { ImageCropPresetKey } from "@/lib/image-crop-presets";

type Props = {
  onCrop: (blob: Blob) => void | Promise<void>;
  preset?: ImageCropPresetKey;
  aspect?: number;
  outputWidth?: number;
  outputHeight?: number;
  busy?: boolean;
  children?: ReactNode;
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  title?: string;
  description?: string;
  heroPreview?: boolean;
  accept?: string;
  overlayTitle?: string;
  overlaySubtitle?: string;
  overlayGradient?: boolean;
  allowTransparency?: boolean;
};

const MAX_SOURCE_BYTES = 30 * 1024 * 1024;

export function CropUploadButton({
  onCrop,
  preset,
  aspect,
  outputWidth,
  outputHeight,
  busy = false,
  children,
  className,
  variant = "outline",
  size = "default",
  title,
  description,
  heroPreview,
  accept,
  overlayTitle,
  overlaySubtitle,
  overlayGradient,
  allowTransparency,
}: Props) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);

  const resolvedAccept =
    accept ??
    (preset === "logo" || allowTransparency
      ? "image/jpeg,image/png,image/webp,image/svg+xml,image/avif"
      : "image/jpeg,image/png,image/webp,image/avif");

  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source);
    },
    [source],
  );

  const close = () => {
    setSourceFile(null);
    setSource((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  };

  const choose = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(isAr ? "يرجى اختيار ملف صورة" : "Please choose an image file");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      toast.error(
        isAr ? "حجم الصورة يجب ألا يتجاوز 30 ميجابايت" : "Image must be 30 MB or smaller",
      );
      return;
    }

    // Direct upload for vector SVG files to preserve infinite resolution and alpha transparency
    if (file.type === "image/svg+xml") {
      toast.success(
        isAr
          ? "تم رفع ملف SVG الفكتوري مباشرة للحفاظ على الدقة والشفافية."
          : "Uploaded vector SVG directly for maximum fidelity and transparency.",
      );
      void onCrop(file);
      return;
    }

    setSourceFile(file);
    setSource((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={resolvedAccept}
        className="hidden"
        disabled={busy}
        onChange={(event) => {
          choose(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {children ?? <ImagePlus className="h-4 w-4" />}
      </Button>
      <ImageCropperDialog
        open={Boolean(source)}
        imageSrc={source}
        preset={preset}
        aspect={aspect}
        outputWidth={outputWidth}
        outputHeight={outputHeight}
        busy={busy}
        title={title}
        description={description}
        heroPreview={heroPreview}
        overlayTitle={overlayTitle}
        overlaySubtitle={overlaySubtitle}
        overlayGradient={overlayGradient}
        allowTransparency={allowTransparency || preset === "logo"}
        onCancel={close}
        onConfirm={async (blob) => {
          await onCrop(blob);
          close();
        }}
        onSkipCrop={async () => {
          if (sourceFile) {
            await onCrop(sourceFile);
          }
          close();
        }}
      />
    </>
  );
}
