import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shareImageSetting } from "@/lib/seo/share-image";
import { uploadPublicMedia } from "@/lib/r2-upload";

/**
 * The picture shown when the store's link is shared (WhatsApp, Instagram, Facebook, X). Without
 * one the storefront uses the first hero picture, and a video hero gives its first frame, which is
 * often a flat dark colour. Kept in `homepage_editorial_sections.share_image_url`.
 */
export function ShareImageCard({
  isAr,
  brandId,
  sections,
  onChange,
}: {
  isAr: boolean;
  brandId: string;
  sections: unknown;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const base =
    sections && typeof sections === "object" ? (sections as Record<string, unknown>) : {};
  const current = shareImageSetting(base);
  const title = isAr ? "صورة مشاركة الرابط" : "Share image";

  const write = (url: string | null) => {
    const next = { ...base };
    if (url) next.share_image_url = url;
    else delete next.share_image_url;
    onChange(next);
  };
  const upload = async (file: File) => {
    try {
      setUploading(true);
      write(await uploadPublicMedia(brandId, file, "page"));
      toast.success(isAr ? "تم رفع الصورة — لا تنسَ الحفظ" : "Image uploaded — remember to save");
    } catch (e: any) {
      toast.error(e?.message ?? (isAr ? "فشل رفع الصورة" : "Upload failed"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {isAr
            ? "الصورة التي تظهر عند إرسال رابط متجرك في واتساب وإنستغرام وفيسبوك. من دونها تُستخدم أول صورة في الواجهة، وإذا كانت فيديو فقد تظهر لقطة داكنة بلا محتوى."
            : "The picture shown when your store's link is sent on WhatsApp, Instagram or Facebook. Without one the first hero picture is used, and a video hero can give a flat dark frame."}
        </p>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        aria-label={title}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      {current ? (
        <div className="space-y-2">
          <img
            src={current}
            alt=""
            className="aspect-[1200/630] w-full max-w-sm rounded-lg border border-border object-cover"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => input.current?.click()}
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <UploadCloud className="size-3.5" />
              )}
              {isAr ? "استبدال" : "Replace"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => write(null)}
            >
              <Trash2 className="size-3.5" />
              {isAr ? "إزالة" : "Remove"}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          onClick={() => input.current?.click()}
          className="flex aspect-[1200/630] h-auto w-full max-w-sm flex-col items-center justify-center gap-1 whitespace-normal border-2 border-dashed"
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ImagePlus className="size-4 text-muted-foreground" />
          )}
          <span className="text-xs text-muted-foreground">
            {isAr ? "رفع صورة (أفقية 1200×630)" : "Upload a picture (wide, 1200×630)"}
          </span>
        </Button>
      )}
    </section>
  );
}
