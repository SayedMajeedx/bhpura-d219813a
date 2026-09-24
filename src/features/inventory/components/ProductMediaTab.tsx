import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { OptimizedVideo, ResponsiveImage } from "@/components/responsive-media";

import type { ProductForm } from "@/features/inventory/lib/product-form";

/** Second step of the product editor: the image and video gallery. */
export function ProductMediaTab({
  isAr,
  form,
  uploading,
  handleFilePicked,
  removeMedia,
  moveMedia,
}: {
  isAr: boolean;
  form: ProductForm;
  uploading: boolean;
  handleFilePicked: (file: File) => Promise<void>;
  removeMedia: (index: number) => void;
  moveMedia: (index: number, direction: -1 | 1) => void;
}) {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="p-4 rounded-xl border border-border bg-secondary/10">
        <Label className="text-sm font-bold text-foreground">
          {isAr ? "وسائط المنتج (صور / فيديو)" : "Product media (images / videos)"}
        </Label>
        <p className="text-xs text-muted-foreground mt-1 mb-4">
          {isAr
            ? "ارفع صوراً ومقاطع فيديو عالية الجودة لعرض منتجك بأفضل شكل. يدعم صيغ الصور والفيديو الشائعة."
            : "Upload rich, high-resolution visual assets to show off your products in premium style."}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {form.media.map((m, i) => (
            <div
              key={i}
              className="relative flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-sm group"
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden bg-black/90">
                {m.type === "video" ? (
                  <div className="relative w-full h-full">
                    <OptimizedVideo
                      src={m.stream_iframe_url ? undefined : m.url}
                      streamIframeUrl={m.stream_iframe_url}
                      poster={m.poster_url ?? m.url}
                      className="h-full w-full object-cover"
                      wrapperClassName="h-full w-full overflow-hidden"
                    />
                    <div className="absolute inset-0 bg-black/30 pointer-events-none flex items-center justify-center">
                      <div className="h-9 w-9 rounded-full bg-white/90 text-black flex items-center justify-center text-xs font-bold shadow-md">
                        ▶
                      </div>
                    </div>
                  </div>
                ) : (
                  <ResponsiveImage
                    src={m.url}
                    preset="thumb"
                    sizes="160px"
                    alt=""
                    className="w-full h-full object-cover"
                  />
                )}
                <span className="absolute top-2 start-2 bg-black/80 text-white text-xs font-bold px-2 py-0.5 rounded shadow">
                  {m.type === "video"
                    ? isAr
                      ? "🎬 فيديو"
                      : "🎬 Video"
                    : isAr
                      ? "📷 صورة"
                      : "📷 Image"}
                </span>
                {i === 0 && (
                  <span className="absolute top-2 end-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded shadow">
                    {isAr ? "الغلاف" : "Cover"}
                  </span>
                )}
              </div>
              <div className="p-2 bg-muted/30 border-t border-border flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={i === 0}
                    onClick={(e) => {
                      e.preventDefault();
                      moveMedia(i, -1);
                    }}
                    className="h-7 w-7 rounded-md p-0 text-muted-foreground hover:text-foreground"
                    title={isAr ? "تحريك لليسار" : "Move left"}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={i === form.media.length - 1}
                    onClick={(e) => {
                      e.preventDefault();
                      moveMedia(i, 1);
                    }}
                    className="h-7 w-7 rounded-md p-0 text-muted-foreground hover:text-foreground"
                    title={isAr ? "تحريك لليمين" : "Move right"}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-7 px-2.5 text-xs font-bold gap-1 shadow-none"
                  onClick={(e) => {
                    e.preventDefault();
                    removeMedia(i);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{isAr ? "حذف" : "Delete"}</span>
                </Button>
              </div>
            </div>
          ))}
          <label className="relative aspect-[3/4] rounded-xl border-2 border-dashed border-border hover:border-primary/60 bg-muted/20 hover:bg-primary/5 flex flex-col items-center justify-center gap-2 p-4 text-center cursor-pointer transition-all shadow-sm touch-manipulation group">
            {uploading ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-xs font-medium text-muted-foreground">
                  {isAr ? "جاري الرفع..." : "Uploading..."}
                </span>
              </>
            ) : (
              <>
                <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Plus className="h-5 w-5" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-xs font-bold block text-foreground">
                    {isAr ? "إضافة وسائط" : "Add media"}
                  </span>
                  <span className="text-xs text-muted-foreground block">
                    {isAr ? "صور أو مقاطع فيديو" : "Images or Videos"}
                  </span>
                </div>
              </>
            )}
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFilePicked(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
