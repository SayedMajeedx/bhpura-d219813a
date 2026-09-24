import { useState } from "react";
import { Pencil, Trash2, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CropUploadButton } from "@/components/crop-upload-button";
import { uploadPublicMedia } from "@/lib/r2-upload";

export interface VariantImageUploaderProps {
  brandId: string;
  imageUrl: string | null;
  onChange: (url: string | null) => void;
  isAr: boolean;
}

export function VariantImageUploader({
  brandId,
  imageUrl,
  onChange,
  isAr,
}: VariantImageUploaderProps) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: Blob) => {
    try {
      setUploading(true);
      const url = await uploadPublicMedia(brandId, file, "product");
      onChange(url);
      toast.success(isAr ? "تم الرفع بنجاح" : "Uploaded successfully");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative group w-11 h-11 rounded-lg border border-dashed border-input flex items-center justify-center bg-muted/40 hover:bg-muted/80 transition-all cursor-pointer overflow-hidden shrink-0">
      {uploading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : imageUrl ? (
        <>
          <img src={imageUrl} alt="variant" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 transition-opacity">
            <CropUploadButton
              onCrop={handleUpload}
              preset="productPortrait"
              busy={uploading}
              size="icon"
              variant="ghost"
              className="h-6 w-6 rounded bg-white/20 p-1 text-white hover:bg-white/30 hover:text-white"
              title={isAr ? "تغيير" : "Change"}
            >
              <Pencil className="h-3 w-3" />
            </CropUploadButton>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="p-1 rounded bg-rose-600/80 text-white hover:bg-rose-600 transition-colors"
              title={isAr ? "حذف" : "Remove"}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </>
      ) : (
        <CropUploadButton
          onCrop={handleUpload}
          preset="productPortrait"
          busy={uploading}
          size="icon"
          variant="ghost"
          className="h-full w-full rounded-lg text-muted-foreground hover:text-primary"
          title={isAr ? "ضبط صورة المتغير" : "Frame variant image"}
        >
          <Upload className="h-3.5 w-3.5" />
        </CropUploadButton>
      )}
    </div>
  );
}
