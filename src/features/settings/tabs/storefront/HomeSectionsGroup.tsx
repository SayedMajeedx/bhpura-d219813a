import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { AdvancedOnly } from "@/features/settings/FieldVisibility";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ImageCropperDialog } from "@/components/image-cropper-dialog";
import { EditorialSectionsEditor } from "./EditorialSectionsEditor";
import { uploadPublicMedia } from "@/lib/r2-upload";
import { toast } from "sonner";
import { Image, Loader2, Sparkles, Trash2, Upload } from "lucide-react";

interface PromoCard {
  title_en: string;
  title_ar: string;
  subtitle_en: string;
  subtitle_ar: string;
  image_url: string;
  href: string;
}

const EMPTY_PROMO_CARD: PromoCard = {
  title_en: "",
  title_ar: "",
  subtitle_en: "",
  subtitle_ar: "",
  image_url: "",
  href: "",
};

export function HomeSectionsGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBs, brandId } = useBrandSettingsFormContext();
  const bs = form.bs;

  const [promoCropSrc, setPromoCropSrc] = useState<string | null>(null);
  const [promoCropIndex, setPromoCropIndex] = useState<number | null>(null);
  const [uploadingPromo, setUploadingPromo] = useState(false);
  const [uploadingBannerKey, setUploadingBannerKey] = useState<string | null>(null);

  // Promo cards state
  const rawCards = Array.isArray(bs.home_promo_cards) ? bs.home_promo_cards : [];
  const promoCards: PromoCard[] = Array.from({ length: 4 }, (_, idx) => ({
    ...EMPTY_PROMO_CARD,
    ...((typeof rawCards[idx] === "object" && rawCards[idx] !== null
      ? (rawCards[idx] as object)
      : {}) as any),
  }));

  const updatePromoCard = (index: number, patch: Partial<PromoCard>) => {
    const next = [...promoCards];
    next[index] = { ...next[index], ...patch };
    setBs({ home_promo_cards: next as any });
  };

  const choosePromoImage = (index: number, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setPromoCropSrc(reader.result as string);
      setPromoCropIndex(index);
    };
    reader.readAsDataURL(file);
  };

  const confirmPromoCrop = async (blob: Blob) => {
    if (promoCropIndex === null) return;
    try {
      setUploadingPromo(true);
      const url = await uploadPublicMedia(brandId, blob, "page");
      updatePromoCard(promoCropIndex, { image_url: url });
      setPromoCropSrc(null);
      setPromoCropIndex(null);
      toast.success(isAr ? "تم حفظ صورة البطاقة الترويجية" : "Promo card image saved");
    } catch (err: any) {
      toast.error(err.message || (isAr ? "فشل حفظ الصورة" : "Failed to save image"));
    } finally {
      setUploadingPromo(false);
    }
  };

  const uploadBanner = async (key: "trending" | "category", file: File) => {
    try {
      setUploadingBannerKey(key);
      const url = await uploadPublicMedia(brandId, file, "page");
      if (key === "trending") {
        setBs({ trending_banner_background_url: url });
      } else {
        setBs({ category_banner_background_url: url });
      }
      toast.success(isAr ? "تم رفع صورة البنر" : "Banner image uploaded");
    } catch (err: any) {
      toast.error(err.message || (isAr ? "فشل رفع البنر" : "Failed to upload banner"));
    } finally {
      setUploadingBannerKey(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Core Section Toggles & Badges */}
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {isAr ? "أقسام الواجهة وشارات الخصم" : "Homepage Sections & Sale Badges"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "تحكم في إظهار وإخفاء أقسام المنتجات الأساسية في الصفحة الأولى وشارات التخفيضات التلقائية."
              : "Toggle primary product sections on the homepage and automated discount tags."}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3.5 bg-background">
            <div>
              <Label className="cursor-pointer text-xs font-semibold">
                {isAr ? "قسم وصل حديثاً" : "New Arrivals"}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr ? "عرض أحدث الإضافات" : "Latest inventory"}
              </p>
            </div>
            <Switch
              checked={bs.show_new_arrivals ?? true}
              onCheckedChange={(checked) => setBs({ show_new_arrivals: checked })}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3.5 bg-background">
            <div>
              <Label className="cursor-pointer text-xs font-semibold">
                {isAr ? "قسم الأكثر مبيعاً" : "Best Sellers"}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr ? "المنتجات الأكثر طلباً" : "Top selling items"}
              </p>
            </div>
            <Switch
              checked={bs.show_best_sellers ?? true}
              onCheckedChange={(checked) => setBs({ show_best_sellers: checked })}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3.5 bg-background">
            <div>
              <Label className="cursor-pointer text-xs font-semibold">
                {isAr ? "شارات التخفيضات" : "Sale Badges"}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr ? "وسم الخصم على الكروت" : "Discount tags on cards"}
              </p>
            </div>
            <Switch
              checked={bs.global_sale_badges_enabled ?? true}
              onCheckedChange={(checked) => setBs({ global_sale_badges_enabled: checked })}
            />
          </div>
        </div>

        <AdvancedOnly
          fieldKey="homepage_editorial_sections"
          reason={isAr ? "لافتات وخلفيات أقسام الرئيسية" : "Section banners & backgrounds"}
        >
          <EditorialSectionsEditor />
        </AdvancedOnly>

        {/* Advanced Titles for Core Sections */}
        <AdvancedOnly
          fieldKey="new_arrivals_title_ar"
          reason={isAr ? "تخصيص عناوين الأقسام الرئيسية" : "Custom section titles"}
        >
          <div className="rounded-xl border border-border p-4 bg-muted/5 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h4 className="text-xs font-semibold">
                {isAr ? "عناوين الأقسام المخصصة" : "Custom Section Headlines"}
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div dir="rtl">
                <Label className="text-xs font-medium">
                  {isAr ? "عنوان وصل حديثاً (عربي)" : "New Arrivals (Arabic)"}
                </Label>
                <Input
                  className="mt-1.5 text-end text-xs h-9"
                  value={bs.new_arrivals_title_ar ?? ""}
                  placeholder={isAr ? "وصل حديثاً" : "New Arrivals"}
                  onChange={(e) => setBs({ new_arrivals_title_ar: e.target.value || null })}
                />
              </div>

              <div dir="ltr">
                <Label className="text-xs font-medium">
                  {isAr ? "عنوان وصل حديثاً (إنجليزي)" : "New Arrivals (English)"}
                </Label>
                <Input
                  className="mt-1.5 text-start text-xs h-9"
                  value={bs.new_arrivals_title_en ?? ""}
                  placeholder="New Arrivals"
                  onChange={(e) => setBs({ new_arrivals_title_en: e.target.value || null })}
                />
              </div>

              <div dir="rtl">
                <Label className="text-xs font-medium">
                  {isAr ? "عنوان الأكثر مبيعاً (عربي)" : "Best Sellers (Arabic)"}
                </Label>
                <Input
                  className="mt-1.5 text-end text-xs h-9"
                  value={bs.best_sellers_title_ar ?? ""}
                  placeholder={isAr ? "الأكثر مبيعاً" : "Best Sellers"}
                  onChange={(e) => setBs({ best_sellers_title_ar: e.target.value || null })}
                />
              </div>

              <div dir="ltr">
                <Label className="text-xs font-medium">
                  {isAr ? "عنوان الأكثر مبيعاً (إنجليزي)" : "Best Sellers (English)"}
                </Label>
                <Input
                  className="mt-1.5 text-start text-xs h-9"
                  value={bs.best_sellers_title_en ?? ""}
                  placeholder="Best Sellers"
                  onChange={(e) => setBs({ best_sellers_title_en: e.target.value || null })}
                />
              </div>
            </div>
          </div>
        </AdvancedOnly>
      </div>

      {/* 2. Promotional Cards (2:1 Ratio) */}
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {isAr ? "بطاقات العروض الترويجية (Promo Cards)" : "Promotional Cards"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "أربع بطاقات ترويجية بنسبة 2:1 لتوجيه المتسوقين إلى تصنيفات أو عروض محددة."
              : "Four featured promotional banner cards (2:1 ratio) to drive traffic to specific collections."}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {promoCards.map((card, idx) => (
            <div key={idx} className="space-y-3 rounded-xl border border-border p-4 bg-background">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-xs text-foreground">
                    {isAr ? `بطاقة ترويجية ${idx + 1}` : `Promo Card ${idx + 1}`}
                  </h4>
                  <p className="text-xs text-muted-foreground">1600 × 800 px · 2:1</p>
                </div>
                {card.image_url ? (
                  <img
                    src={card.image_url}
                    alt=""
                    className="aspect-[2/1] h-10 rounded-md object-cover border border-border"
                  />
                ) : (
                  <div className="aspect-[2/1] h-10 rounded-md border border-dashed border-border flex items-center justify-center text-muted-foreground">
                    <Image className="size-4" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div dir="rtl">
                  <Label className="text-xs">{isAr ? "العنوان (عربي)" : "Title (AR)"}</Label>
                  <Input
                    className="mt-1 text-xs h-8 text-end"
                    value={card.title_ar}
                    placeholder={isAr ? "مثال: تشكيلة الصيف" : "Summer Collection"}
                    onChange={(e) => updatePromoCard(idx, { title_ar: e.target.value })}
                  />
                </div>
                <div dir="ltr">
                  <Label className="text-xs">{isAr ? "العنوان (إنجليزي)" : "Title (EN)"}</Label>
                  <Input
                    className="mt-1 text-xs h-8 text-start"
                    value={card.title_en}
                    placeholder="Summer Collection"
                    onChange={(e) => updatePromoCard(idx, { title_en: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div dir="rtl">
                  <Label className="text-xs">{isAr ? "الوصف (عربي)" : "Subtitle (AR)"}</Label>
                  <Input
                    className="mt-1 text-xs h-8 text-end"
                    value={card.subtitle_ar}
                    placeholder={isAr ? "خصم حتى 30%" : "Up to 30% off"}
                    onChange={(e) => updatePromoCard(idx, { subtitle_ar: e.target.value })}
                  />
                </div>
                <div dir="ltr">
                  <Label className="text-xs">{isAr ? "الوصف (إنجليزي)" : "Subtitle (EN)"}</Label>
                  <Input
                    className="mt-1 text-xs h-8 text-start"
                    value={card.subtitle_en}
                    placeholder="Up to 30% off"
                    onChange={(e) => updatePromoCard(idx, { subtitle_en: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">{isAr ? "رابط التوجيه" : "Link URL"}</Label>
                <Input
                  className="mt-1 text-xs h-8"
                  value={card.href}
                  placeholder="/search?q=sale"
                  onChange={(e) => updatePromoCard(idx, { href: e.target.value })}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Input
                  className="text-xs h-8 flex-1"
                  value={card.image_url}
                  placeholder={isAr ? "رابط الصورة أو ارفع ملفاً" : "Image URL or upload"}
                  onChange={(e) => updatePromoCard(idx, { image_url: e.target.value })}
                />
                <label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-border px-3 text-xs shrink-0 hover:bg-muted font-medium gap-1.5">
                  <Upload className="size-3.5" />
                  <span>{isAr ? "رفع" : "Upload"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingPromo}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) choosePromoImage(idx, file);
                    }}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <ImageCropperDialog
          open={Boolean(promoCropSrc)}
          imageSrc={promoCropSrc}
          preset="promotionBanner"
          busy={uploadingPromo}
          heroPreview
          title={isAr ? "تأطير صورة البطاقة الترويجية" : "Frame Promotion Banner"}
          description={
            isAr
              ? "اسحب وكبّر الصورة حتى تظهر بأفضل شكل بنسبة 2:1."
              : "Reposition and zoom for a precise 2:1 banner crop."
          }
          onCancel={() => {
            setPromoCropSrc(null);
            setPromoCropIndex(null);
          }}
          onConfirm={confirmPromoCrop}
        />
      </div>

      {/* 3. Section Banner Images & Parallax (Advanced) */}
      <AdvancedOnly
        fieldKey="trending_banner_background_url"
        reason={
          isAr
            ? "إعدادات بنرات الأقسام وحركة البارالاكس"
            : "Section banner imagery & parallax motion"
        }
      >
        <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {isAr ? "بنرات الأقسام وحركة البارالاكس" : "Section Banners & Parallax"}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isAr
                  ? "صور الخلفية للافتات الترويجية وحركة العمق ثلاثية الأبعاد."
                  : "Background imagery for editorial dividers and scroll parallax motion."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Trending banner */}
            <div className="rounded-xl border border-border p-4 bg-background space-y-3">
              <Label className="text-xs font-semibold">
                {isAr ? "صورة بنر التريند والرائج" : "Trending Banner Background"}
              </Label>
              {bs.trending_banner_background_url ? (
                <div className="relative aspect-[21/9] rounded-lg overflow-hidden border border-border">
                  <img
                    src={bs.trending_banner_background_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 end-2 h-7 text-xs bg-background/80 hover:bg-destructive/10 text-destructive"
                    onClick={() => setBs({ trending_banner_background_url: null })}
                  >
                    <Trash2 className="size-3.5 me-1" />
                    <span>{isAr ? "حذف" : "Remove"}</span>
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center aspect-[21/9] rounded-lg border border-dashed border-border hover:bg-muted/10 cursor-pointer text-center p-4">
                  {uploadingBannerKey === "trending" ? (
                    <Loader2 className="size-5 animate-spin text-primary" />
                  ) : (
                    <Upload className="size-5 text-muted-foreground mb-1" />
                  )}
                  <span className="text-xs font-medium">
                    {isAr ? "رفع صورة بنر التريند" : "Upload trending banner"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={Boolean(uploadingBannerKey)}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) uploadBanner("trending", file);
                    }}
                  />
                </label>
              )}
            </div>

            {/* Category banner */}
            <div className="rounded-xl border border-border p-4 bg-background space-y-3">
              <Label className="text-xs font-semibold">
                {isAr ? "صورة بنر فواصل التصنيفات" : "Category Divider Banner"}
              </Label>
              {bs.category_banner_background_url ? (
                <div className="relative aspect-[21/9] rounded-lg overflow-hidden border border-border">
                  <img
                    src={bs.category_banner_background_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 end-2 h-7 text-xs bg-background/80 hover:bg-destructive/10 text-destructive"
                    onClick={() => setBs({ category_banner_background_url: null })}
                  >
                    <Trash2 className="size-3.5 me-1" />
                    <span>{isAr ? "حذف" : "Remove"}</span>
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center aspect-[21/9] rounded-lg border border-dashed border-border hover:bg-muted/10 cursor-pointer text-center p-4">
                  {uploadingBannerKey === "category" ? (
                    <Loader2 className="size-5 animate-spin text-primary" />
                  ) : (
                    <Upload className="size-5 text-muted-foreground mb-1" />
                  )}
                  <span className="text-xs font-medium">
                    {isAr ? "رفع صورة بنر التصنيفات" : "Upload category banner"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={Boolean(uploadingBannerKey)}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) uploadBanner("category", file);
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Parallax controls */}
          <div className="rounded-xl border border-border p-4 bg-background space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="cursor-pointer text-xs font-semibold">
                  {isAr ? "تفعيل حركة البارالاكس للبنرات" : "Enable Banner Parallax"}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAr ? "حركة عمق ثلاثية الأبعاد مع السكرول" : "Smooth depth scroll motion"}
                </p>
              </div>
              <Switch
                checked={bs.secondary_banner_parallax_enabled ?? false}
                onCheckedChange={(checked) => setBs({ secondary_banner_parallax_enabled: checked })}
              />
            </div>

            {bs.secondary_banner_parallax_enabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label className="cursor-pointer text-xs font-medium">
                      {isAr ? "تفعيل التأثير على الموبايل" : "Enable on Mobile"}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isAr ? "قد يؤثر قليلاً على بطارية الهاتف" : "Slight battery impact"}
                    </p>
                  </div>
                  <Switch
                    checked={bs.secondary_banner_parallax_mobile_enabled ?? false}
                    onCheckedChange={(checked) =>
                      setBs({ secondary_banner_parallax_mobile_enabled: checked })
                    }
                  />
                </div>

                <div>
                  <Label className="text-xs font-medium">
                    {isAr ? "نقطة توقف الشاشة للبارالاكس (px)" : "Desktop Breakpoint (px)"}
                  </Label>
                  <Input
                    type="number"
                    min={320}
                    max={1920}
                    className="mt-1.5 text-xs h-9"
                    value={bs.secondary_banner_parallax_breakpoint ?? 768}
                    onChange={(e) =>
                      setBs({
                        secondary_banner_parallax_breakpoint: Math.max(
                          320,
                          Math.min(1920, Number(e.target.value) || 768),
                        ),
                      })
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </AdvancedOnly>
    </div>
  );
}
