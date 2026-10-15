import { useState } from "react";
import { toast } from "sonner";
import { Image, Upload } from "lucide-react";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ImageCropperDialog } from "@/components/image-cropper-dialog";
import { uploadPublicMedia } from "@/lib/r2-upload";

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

/** The four 2:1 promo cards under the hero: picture (framed on upload), titles and link. */
export function PromoCardsEditor({ isAr }: { isAr: boolean }) {
  const { form, setBs, brandId } = useBrandSettingsFormContext();
  const bs = form.bs;
  const [promoCropSrc, setPromoCropSrc] = useState<string | null>(null);
  const [promoCropIndex, setPromoCropIndex] = useState<number | null>(null);
  const [uploadingPromo, setUploadingPromo] = useState(false);

  const rawCards = Array.isArray(bs.home_promo_cards) ? bs.home_promo_cards : [];
  const promoCards: PromoCard[] = Array.from({ length: 4 }, (_, idx) => ({
    ...EMPTY_PROMO_CARD,
    ...((typeof rawCards[idx] === "object" && rawCards[idx] !== null
      ? (rawCards[idx] as object)
      : {}) as Partial<PromoCard>),
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

  return (
    <>
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
    </>
  );
}
