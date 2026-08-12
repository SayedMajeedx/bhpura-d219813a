import { useEffect, useRef, useState, type ReactNode } from "react";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ImageCropperDialog } from "@/components/image-cropper-dialog";
import { useI18n } from "@/lib/i18n";

type Props = {
  onCrop: (blob: Blob) => void | Promise<void>;
  aspect: number;
  outputWidth: number;
  outputHeight: number;
  busy?: boolean;
  children?: ReactNode;
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  title?: string;
  description?: string;
  heroPreview?: boolean;
  accept?: string;
};

const MAX_SOURCE_BYTES = 30 * 1024 * 1024;

export function CropUploadButton({
  onCrop,
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
  accept = "image/jpeg,image/png,image/webp,image/avif",
}: Props) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source);
    },
    [source],
  );

  const close = () => {
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
        accept={accept}
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
        aspect={aspect}
        outputWidth={outputWidth}
        outputHeight={outputHeight}
        busy={busy}
        title={title}
        description={description}
        heroPreview={heroPreview}
        onCancel={close}
        onConfirm={async (blob) => {
          await onCrop(blob);
          close();
        }}
      />
    </>
  );
}
