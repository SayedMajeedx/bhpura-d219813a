import { useMemo, useRef } from "react";
import {
  Calendar,
  Check,
  Film,
  Image as ImageIcon,
  Instagram,
  Phone,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { OrderReviewAdminRow } from "@/lib/order-reviews";
import { TemplatePlayer } from "@/features/content-studio/components/TemplatePlayer";
import { reviewStory } from "@/features/review-story/templates/review-story";
import { useReviewStory } from "@/features/review-story/hooks/use-review-story";
import { ReviewStoryActions } from "@/features/review-story/components/ReviewStoryActions";
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  publicFirstName,
  type ProductMediaItem,
} from "@/features/review-story/lib/review-story";

export type { ProductMediaItem };

// Stable empty lists: a fresh [] each render would re-run the reset on every render.
const NO_IMAGES: string[] = [];
const NO_MEDIA: ProductMediaItem[] = [];

type ReviewStoryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  review: OrderReviewAdminRow | null;
  brandName: string;
  brandColor?: string | null;
  logoUrl?: string | null;
  isAr: boolean;
  orderDate?: string | null;
  productImages?: string[];
  productMedia?: ProductMediaItem[];
  brandPhone?: string | null;
  brandInstagram?: string | null;
};

/**
 * Turns a customer review into an Instagram story: the product framed (photo
 * or video), a frosted card with the stars and the customer's words, and the
 * store's contacts. The story animates; it downloads as an MP4 or a still.
 */
export function ReviewStoryDialog({
  open,
  onOpenChange,
  review,
  brandName,
  brandColor,
  logoUrl,
  isAr,
  orderDate,
  productImages = NO_IMAGES,
  productMedia = NO_MEDIA,
  brandPhone,
  brandInstagram,
}: ReviewStoryDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const story = useReviewStory({
    open,
    review,
    brandName,
    brandColor,
    logoUrl,
    isAr,
    orderDate,
    productImages,
    productMedia,
    brandPhone,
    brandInstagram,
  });
  const {
    look,
    setLook,
    primary,
    comment,
    setComment,
    showName,
    setShowName,
    showHighlights,
    setShowHighlights,
    showDate,
    setShowDate,
    orderDateInput,
    setOrderDateInput,
    showBrandContact,
    setShowBrandContact,
    customBrandPhone,
    setCustomBrandPhone,
    customBrandInstagram,
    setCustomBrandInstagram,
    availableMedia,
    selectedMedia,
    setSelectedMedia,
    handleFileUpload,
  } = story;

  const templates = useMemo(
    () => [
      {
        id: "classic" as const,
        label: isAr ? "كلاسيكي رملي" : "Classic Sand",
        colors: ["#ece3d8", primary],
      },
      {
        id: "editorial" as const,
        label: isAr ? "تحريري مينيمال" : "Editorial Clean",
        colors: ["#ffffff", primary],
      },
      {
        id: "midnight" as const,
        label: isAr ? "داكن فاخر" : "Midnight Dark",
        colors: [primary, "#efd9c8"],
      },
    ],
    [isAr, primary],
  );

  if (!review) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="grid h-[calc(100dvh-1rem)] max-h-[860px] min-h-0 max-w-5xl gap-0 overflow-y-auto rounded-2xl p-0 sm:h-[calc(100dvh-2rem)] lg:grid-cols-[minmax(0,1fr)_390px] lg:overflow-hidden"
      >
        <section className="order-2 min-h-0 min-w-0 p-5 sm:p-7 lg:order-1 lg:overflow-y-auto lg:overscroll-contain">
          <DialogHeader className="px-0 pe-10">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="size-5 text-primary" />
              {isAr ? "إنشاء ستوري تقييم فاخر" : "Create Review Story"}
            </DialogTitle>
            <DialogDescription className="leading-6">
              {isAr
                ? "قالب جمالي مستوحى من تقييمات العملاء الحقيقية مع إطار المنتج (صورة أو فيديو) وبطاقة التقييم الزجاجية."
                : "Aesthetic customer review story with framed product media (photo or video) and frosted card overlay."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-6 space-y-6">
            {/* Template Selection */}
            <div className="space-y-2.5">
              <Label>{isAr ? "القالب والألوان" : "Style & Palette"}</Label>
              <div className="grid grid-cols-3 gap-2">
                {templates.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setLook(item.id)}
                    className={cn(
                      "relative flex min-h-20 flex-col items-start justify-between rounded-xl border p-3 text-start transition-all",
                      look === item.id
                        ? "border-primary bg-primary/5 ring-2 ring-primary/10"
                        : "border-border hover:border-primary/30",
                    )}
                  >
                    <span className="flex gap-1.5">
                      {item.colors.map((color) => (
                        <span
                          key={color}
                          className="size-4 rounded-full border border-black/10"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </span>
                    <span className="text-xs font-semibold">{item.label}</span>
                    {look === item.id && (
                      <span className="absolute end-2 top-2 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Product Media Selector / Uploader (Images & Videos) */}
            <div className="space-y-2.5 rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  {selectedMedia?.type === "video" ? (
                    <Film className="size-4 text-primary" />
                  ) : (
                    <ImageIcon className="size-4 text-primary" />
                  )}
                  {isAr
                    ? "وسائط المنتج (صورة أو فيديو داخل الإطار)"
                    : "Product media (photo or video)"}
                </Label>
                {selectedMedia && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs text-destructive hover:bg-destructive/10"
                    onClick={() => setSelectedMedia(null)}
                  >
                    <Trash2 className="size-3.5" />
                    {isAr ? "إزالة الوسائط" : "Remove"}
                  </Button>
                )}
              </div>

              {/* Order Product Media thumbnails if any */}
              {availableMedia.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? "الوسائط المتوفرة في الطلب (اضغط للاختيار):"
                      : "Media detected from the order (click to select):"}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {availableMedia.map((m, idx) => (
                      <button
                        key={m.url + idx}
                        type="button"
                        onClick={() => setSelectedMedia(m)}
                        className={cn(
                          "relative size-14 overflow-hidden rounded-lg border-2 transition-all",
                          selectedMedia?.url === m.url
                            ? "border-primary ring-2 ring-primary/20"
                            : "border-border opacity-70 hover:opacity-100",
                        )}
                      >
                        {m.type === "video" ? (
                          <div className="flex size-full items-center justify-center bg-zinc-900 text-white">
                            <Video className="size-5" />
                          </div>
                        ) : (
                          <img
                            src={m.url}
                            alt="product"
                            className="size-full object-cover"
                            crossOrigin="anonymous"
                          />
                        )}
                        {m.type === "video" && (
                          <span className="absolute bottom-1 end-1 rounded bg-black/60 px-1 py-0.5 text-xs font-bold text-white">
                            فيديو
                          </span>
                        )}
                        {selectedMedia?.url === m.url && (
                          <span className="absolute inset-0 grid place-items-center bg-black/20 text-white">
                            <Check className="size-4 stroke-[3]" />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload custom image or video */}
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 w-full gap-2 border-dashed"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-4" />
                  {selectedMedia
                    ? isAr
                      ? "رفع صورة أو فيديو بديل من جهازك"
                      : "Upload a different photo or video"
                    : isAr
                      ? "رفع صورة أو مقطع فيديو من جهازك"
                      : "Upload photo or video"}
                </Button>
              </div>
            </div>

            {/* Story Review Copy */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="story-review-copy">
                  {isAr ? "نص تقييم العميل" : "Review text"}
                </Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {comment.length}/280
                </span>
              </div>
              <Textarea
                id="story-review-copy"
                value={comment}
                maxLength={280}
                rows={4}
                onChange={(event) => setComment(event.target.value)}
                className="resize-none leading-7"
              />
            </div>

            {/* Order Date inside Review Box */}
            <div className="space-y-2 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-semibold">
                      {isAr
                        ? "إظهار تاريخ الطلب داخل بوكس التقييم"
                        : "Show order date in review box"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? "يظهر داخل البطاقة الزجاجية مع التقييم"
                        : "Appears inside the frosted review card"}
                    </p>
                  </div>
                </div>
                <Switch checked={showDate} onCheckedChange={setShowDate} />
              </div>
              {showDate && (
                <div className="pt-2">
                  <Input
                    value={orderDateInput}
                    onChange={(e) => setOrderDateInput(e.target.value)}
                    placeholder={isAr ? "مثال: 26 أغسطس 2026" : "e.g. 26 Aug 2026"}
                    className="min-h-10 text-xs"
                  />
                </div>
              )}
            </div>

            {/* Brand Contact Details (Instagram & Phone) */}
            <div className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">
                    {isAr ? "إظهار بيانات المتجر (هاتف وإنستجرام)" : "Show brand contacts in story"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? "يظهر في شريط أنيق أسفل الستوري لتعزيز المبيعات"
                      : "Appears in a chic footer badge to drive sales"}
                  </p>
                </div>
                <Switch checked={showBrandContact} onCheckedChange={setShowBrandContact} />
              </div>

              {showBrandContact && (
                <div className="grid grid-cols-1 gap-2.5 pt-1 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Instagram className="size-3.5" />
                      {isAr ? "حساب الإنستجرام" : "Instagram"}
                    </Label>
                    <Input
                      value={customBrandInstagram}
                      onChange={(e) => setCustomBrandInstagram(e.target.value)}
                      placeholder="@yourbrand"
                      className="min-h-10 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="size-3.5" />
                      {isAr ? "رقم الهاتف / الواتساب" : "Phone / WhatsApp"}
                    </Label>
                    <Input
                      value={customBrandPhone}
                      onChange={(e) => setCustomBrandPhone(e.target.value)}
                      placeholder="+973 33123456"
                      className="min-h-10 text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Display Switches */}
            <div className="divide-y rounded-xl border border-border">
              <div className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-sm font-semibold">
                    {isAr ? "إظهار اسم العميل الأول" : "Show first name"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {showName
                      ? publicFirstName(review.customer_name)
                      : isAr
                        ? "تقييم موثّق"
                        : "Verified customer"}
                  </p>
                </div>
                <Switch checked={showName} onCheckedChange={setShowName} />
              </div>
              <div className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-sm font-semibold">
                    {isAr ? "إظهار شارات التميز" : "Show highlights"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isAr
                      ? "جودة المنتج، التغليف، سرعة التوصيل"
                      : "Quality, packaging, delivery speed"}
                  </p>
                </div>
                <Switch checked={showHighlights} onCheckedChange={setShowHighlights} />
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              {isAr
                ? "آمن للنشر: لا يتضمن رقم الطلب، بيانات الدفع الخاصة أو كود الخصم."
                : "Safe to publish: private order number, payment and reward code excluded."}
            </div>

            {/* Downloads: the animated story (MP4) and a still (PNG) */}
            <ReviewStoryActions story={story} isAr={isAr} />
          </div>
        </section>

        {/* Live preview: the same renderer as the downloads */}
        <aside className="order-1 flex min-h-0 flex-col items-center justify-center border-b bg-muted/35 p-5 lg:order-2 lg:border-b-0 lg:border-s">
          <div className="w-full max-w-[170px] sm:max-w-[230px] lg:max-w-[290px]">
            <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                {selectedMedia?.type === "video" ? (
                  <Film className="size-3.5 text-primary" />
                ) : (
                  <ImageIcon className="size-3.5" />
                )}
                {isAr ? "معاينة متحركة" : "Animated preview"}
              </span>
              <span dir="ltr">1080 × 1920</span>
            </div>
            <TemplatePlayer
              template={reviewStory}
              buildScene={story.buildScene}
              outW={STORY_WIDTH}
              outH={STORY_HEIGHT}
              videoUrl={selectedMedia?.type === "video" ? selectedMedia.url : null}
              isAr={isAr}
              label={isAr ? "معاينة ستوري تقييم العميل" : "Customer review story preview"}
              frameClassName="rounded-xl bg-white shadow-2xl ring-1 ring-black/10"
              onPausedAt={story.setStillAt}
            />
          </div>
        </aside>
      </DialogContent>
    </Dialog>
  );
}
