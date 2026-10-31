import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Palette, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useBrand } from "@/lib/brand-context";
import {
  cardDesignQueries,
  invalidateCardDesigns,
  saveCardDesigns,
  type CardDesignsRow,
} from "@/lib/data/gift-cards/designs";
import { cn } from "@/lib/utils";
import { GiftCardFace } from "@/features/gift-card-design/components/GiftCardFace";
import {
  ALL_DESIGNS,
  DEFAULT_DESIGN,
  designName,
  type DesignId,
} from "@/features/gift-card-design/lib/design";
import { loadCardFonts } from "@/features/gift-card-design/lib/canvas";
import { designsFor } from "@/features/gift-card-design/lib/design";
import { giftCardError } from "../lib/gift-cards";
import { useAdminCardKit } from "../hooks/use-admin-card-kit";
import { CardBrandControls, type CardFonts } from "./CardBrandControls";

/** How many product photos a store may choose for its photo designs. */
const MAX_PHOTOS = 12;

/**
 * The store's card designs (staff who may change settings): every design drawn in the store's own
 * colours, each one offered or not, one of them the signature card shoppers see first, and the
 * product photos the photo designs use (the newest with a photo until the store chooses).
 */
export function CardDesignsSection({ lang }: { lang: "ar" | "en" }) {
  const brand = useBrand();
  const stored = useQuery(cardDesignQueries.store(brand.id));
  if (!stored.isFetched || !stored.data) return null;
  return (
    <CardDesignsEditor
      key={JSON.stringify([
        stored.data.off,
        stored.data.signature,
        stored.data.photo_products,
        stored.data.logo_scale,
        stored.data.fonts,
      ])}
      initial={stored.data}
      lang={lang}
    />
  );
}

function CardDesignsEditor({ initial, lang }: { initial: CardDesignsRow; lang: "ar" | "en" }) {
  const isAr = lang === "ar";
  const brand = useBrand();
  const qc = useQueryClient();
  const kit = useAdminCardKit();
  const choices = useQuery(cardDesignQueries.photoChoices(brand.id));
  const [off, setOff] = useState<string[]>(initial.off);
  const [signature, setSignature] = useState<string | null>(initial.signature);
  const [photos, setPhotos] = useState<string[]>(initial.photo_products);
  const [logoScale, setLogoScale] = useState(initial.logo_scale);
  const [fonts, setFonts] = useState<CardFonts>({
    ar: initial.fonts.ar ?? null,
    en: initial.fonts.en ?? null,
  });
  const [saving, setSaving] = useState(false);
  // The cards are drawn as they will be once saved: the size chosen and the fonts uploaded, each
  // font drawn with only once the browser has it.
  const fontAr = fonts.ar?.url ?? null;
  const fontEn = fonts.en?.url ?? null;
  const fontKey = `${fontAr ?? ""}|${fontEn ?? ""}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadCardFonts({ ar: fontAr, en: fontEn }).finally(() => live && setLoadedKey(fontKey));
    return () => {
      live = false;
    };
  }, [fontAr, fontEn, fontKey]);
  const previewKit = useMemo(
    () => ({
      ...kit,
      logoScale,
      fonts: { ar: fontAr, en: fontEn },
      ready: kit.ready && loadedKey === fontKey,
    }),
    [kit, logoScale, fontAr, fontEn, loadedKey, fontKey],
  );
  const sample =
    designsFor({
      occasion: "gift",
      kind: kit.kind,
      store: {
        off: off as DesignId[],
        signature: signature as DesignId | null,
        photos: kit.photos,
      },
      hasPhoto: kit.photos.length > 0,
      limit: 1,
    })[0] ?? "signature:brand";
  const preview = { ...DEFAULT_DESIGN, language: lang };
  const details = { amount: null, code: null, to: null, message: null, expiresOn: null };

  const toggleOffered = (id: DesignId, offered: boolean) => {
    setOff((current) => (offered ? current.filter((d) => d !== id) : [...current, id]));
    if (!offered && signature === id) setSignature(null);
  };
  const togglePhoto = (id: string) =>
    setPhotos((current) =>
      current.includes(id)
        ? current.filter((p) => p !== id)
        : current.length < MAX_PHOTOS
          ? [...current, id]
          : current,
    );

  const save = async () => {
    setSaving(true);
    try {
      await saveCardDesigns(brand.id, {
        off,
        signature,
        photoProducts: photos,
        logoScale,
        fonts,
      });
      await invalidateCardDesigns(qc, brand.id);
      toast.success(isAr ? "حُفظت التصاميم" : "Designs saved");
    } catch (error) {
      toast.error(giftCardError(error, lang));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Palette className="size-4" aria-hidden="true" />
        {isAr ? "تصاميم البطاقات" : "Card designs"}
      </h2>
      <Card className="space-y-4 p-3">
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "تُرسم بألوان متجرك وشعاره. يختار المشتري من المعروض، وتظهر البطاقة المميزة أولًا."
            : "Drawn in your store's colours and logo. Shoppers choose from those offered; the signature card comes first."}
        </p>
        <CardBrandControls
          kit={previewKit}
          lang={lang}
          sample={sample}
          logoScale={logoScale}
          onLogoScale={setLogoScale}
          fonts={fonts}
          onFonts={setFonts}
        />
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {ALL_DESIGNS.map((id) => {
            const offered = !off.includes(id);
            const name = designName(id, lang);
            const needsPhoto = id.startsWith("photo:") && kit.photos.length === 0;
            return (
              <li key={id} className={cn("space-y-1.5", !offered && "opacity-50")}>
                <GiftCardFace
                  kit={previewKit}
                  design={{ ...preview, design: id }}
                  details={details}
                  primary={lang}
                  label={name}
                  className="w-full shadow-sm"
                />
                <p className="text-xs leading-tight">{name}</p>
                {needsPhoto && (
                  <p className="text-xs text-muted-foreground">
                    {isAr ? "يحتاج صورة منتج" : "Needs a product photo"}
                  </p>
                )}
                <div className="flex items-center justify-between gap-1">
                  <Switch
                    checked={offered}
                    onCheckedChange={(next) => toggleOffered(id, next)}
                    aria-label={isAr ? `عرض ${name}` : `Offer ${name}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={!offered}
                    aria-pressed={signature === id}
                    aria-label={isAr ? `${name} البطاقة المميزة` : `${name} as the signature card`}
                    onClick={() => setSignature(signature === id ? null : id)}
                  >
                    <Star
                      className={cn("size-4", signature === id && "fill-current text-primary")}
                      aria-hidden="true"
                    />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="space-y-2">
          <p className="text-sm font-medium">
            {isAr ? "صور تصاميم الصورة" : "Photos for the photo designs"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? `اختر حتى ${MAX_PHOTOS} صورة من منتجاتك. قبل أن تختار، تُستخدم أحدث الصور.`
              : `Choose up to ${MAX_PHOTOS} of your products' photos. Until you choose, the newest are used.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {(choices.data ?? []).map((choice) => {
              const chosen = photos.includes(choice.id);
              const name = (isAr ? choice.name_ar : choice.name_en) || choice.name_en || "";
              return (
                <Button
                  key={choice.id}
                  type="button"
                  variant="ghost"
                  aria-pressed={chosen}
                  aria-label={name}
                  className={cn(
                    "relative size-16 overflow-hidden rounded-md p-0",
                    chosen ? "ring-2 ring-primary" : "ring-1 ring-border",
                  )}
                  onClick={() => togglePhoto(choice.id)}
                >
                  <img
                    src={choice.photo}
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                  />
                  {chosen && (
                    <span className="absolute end-1 top-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                      {photos.indexOf(choice.id) + 1}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={save} disabled={saving}>
            {isAr ? "حفظ التصاميم" : "Save designs"}
          </Button>
        </div>
      </Card>
    </section>
  );
}
