import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { publicSupabase as supabase } from "@/integrations/supabase/client";
import { useStorefront, formatPrice, pickName, pickDescription, readableOn } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useMemo, useRef, useEffect } from "react";
import { formatSizeWithUnit } from "@/components/bilingual-field";
import { ChevronLeft, ChevronRight, ShoppingBag, AlertCircle, Heart } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/$slug/product/$id")({
  component: ProductDetail,
});

type Variant = {
  id: string;
  size: string | null;
  size_unit: string | null;
  color: string | null;
  fabric: string | null;
  selling_price: number;
  original_price: number | null;
  stock_main: number;
};

type CustomField = {
  key: string;
  label_ar: string | null;
  label_en: string | null;
  type: "text" | "number" | "select";
  options?: string[];
  required?: boolean;
};

type Product = {
  id: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  description: string | null;
  description_ar: string | null;
  description_en: string | null;
  image_url: string | null;
  media: unknown;
  custom_fields: CustomField[] | null;
  product_variants: Variant[];
};

/** Natural sort key: extract leading number so "52" < "54" < "60". */
function variantSortKey(v: Variant): [number, string] {
  const label = [v.size, v.color, v.fabric].filter(Boolean).join(" · ");
  const m = /-?\d+(?:\.\d+)?/.exec(label);
  const num = m ? Number(m[0]) : Number.POSITIVE_INFINITY;
  return [num, label.toLowerCase()];
}

function ProductDetail() {
  const { id } = Route.useParams();
  const { brand, settings, currency, lang, t, addToCart, isWishlisted, toggleWishlist } = useStorefront();
  const navigate = useNavigate();
  const [mediaIdx, setMediaIdx] = useState(0);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [cfValues, setCfValues] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const optionsRef = useRef<HTMLDivElement | null>(null);

  const { data: product, isLoading } = useQuery({
    queryKey: ["storefront", brand.slug, "product", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, name_ar, name_en, description, description_ar, description_en, image_url, media, custom_fields, product_variants(id, size, size_unit, color, fabric, selling_price, original_price, stock_main)")
        .eq("id", id)
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Product | null;
    },
  });

  const media = useMemo(() => {
    if (!product) return [];
    const arr = Array.isArray(product.media)
      ? (product.media as Array<{ type: "image" | "video"; url: string }>)
      : [];
    if (arr.length > 0) return arr;
    if (product.image_url) return [{ type: "image" as const, url: product.image_url }];
    return [];
  }, [product]);

  const variants = useMemo<Variant[]>(() => {
    const list = product?.product_variants ?? [];
    return [...list].sort((a, b) => {
      const [an, al] = variantSortKey(a);
      const [bn, bl] = variantSortKey(b);
      if (an !== bn) return an - bn;
      return al.localeCompare(bl, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [product]);
  const variant = variantId ? variants.find((v) => v.id === variantId) : null;
  const customFields = useMemo<CustomField[]>(
    () => (Array.isArray(product?.custom_fields) ? (product!.custom_fields as CustomField[]) : []),
    [product],
  );
  useEffect(() => {
    if (!product?.id) return;
    const key = `product-view:${product.id}:${new Date().toISOString().slice(0, 10)}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch {}
    void (supabase.rpc as any)("record_storefront_product_engagement", { p_brand_slug: brand.slug, p_product_id: product.id, p_event: "view" });
  }, [brand.slug, product?.id]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 grid md:grid-cols-2 gap-8">
        <Skeleton className="aspect-square rounded-xl" />
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <Card className="p-8">
          <p className="mb-4">{t("لم يتم العثور على المنتج.", "Product not found.")}</p>
          <Link to="/$slug" params={{ slug: brand.slug }} className="underline">
            {t("العودة للمتجر", "Back to store")}
          </Link>
        </Card>
      </div>
    );
  }

  const price = variant?.selling_price ?? Math.min(...variants.map((v) => v.selling_price).filter((p) => p > 0), Infinity);
  const displayPrice = isFinite(price) ? price : 0;
  const maxStock = variant?.stock_main ?? 0;
  const hasVariants = variants.length > 0;

  const displayName = pickName(lang, product);
  const displayDescription = pickDescription(lang, product);

  const cfLabel = (f: CustomField) => (lang === "ar" ? (f.label_ar || f.label_en || f.key) : (f.label_en || f.label_ar || f.key));

  const primary = settings.primary_color || "#111111";
  const primaryFg = readableOn(primary);

  const scrollToOptions = () => {
    optionsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const validate = (): string | null => {
    if (hasVariants && !variant) {
      return t("يرجى اختيار مقاس/خيار أولاً", "Please select a size or option first");
    }
    if (variant && variant.stock_main <= 0) {
      return t("هذا الخيار غير متوفر حالياً", "This option is out of stock");
    }
    for (const f of customFields) {
      if (f.required && !(cfValues[f.key] ?? "").trim()) {
        return t(`الحقل مطلوب: ${cfLabel(f)}`, `Required field: ${cfLabel(f)}`);
      }
    }
    return null;
  };

  const doAdd = (thenBuy = false) => {
    const err = validate();
    if (err) {
      setErrorMsg(err);
      toast.error(err);
      scrollToOptions();
      return;
    }
    if (!variant) {
      const msg = t("يرجى اختيار خيار أولاً", "Please select an option first");
      setErrorMsg(msg);
      toast.error(msg);
      scrollToOptions();
      return;
    }
    setErrorMsg(null);
    const custom = customFields
      .map((f) => ({
        key: f.key,
        label_ar: f.label_ar,
        label_en: f.label_en,
        value: (cfValues[f.key] ?? "").trim(),
      }))
      .filter((v) => v.value.length > 0);
    addToCart({
      cart_line_id: "",
      variant_id: variant!.id,
      product_id: product.id,
      name: displayName,
      name_ar: product.name_ar,
      name_en: product.name_en,
      image: media.find((m) => m.type === "image")?.url ?? product.image_url ?? null,
      price: variant!.selling_price,
      original_price: variant!.original_price,
      size: variant!.size,
      color: variant!.color,
      fabric: variant!.fabric,
      qty,
      max_stock: variant!.stock_main,
      custom_fields: custom,
    });
    if (thenBuy) {
      navigate({ to: "/$slug/checkout", params: { slug: brand.slug } });
    } else {
      toast.success(t("تمت الإضافة إلى السلة", "Added to cart"));
    }
  };

  const priceLabel = displayPrice > 0 ? formatPrice(displayPrice, currency, lang) : t("السعر عند الطلب", "Price on request");
  const originalPrice = variant && Number(variant.original_price || 0) > Number(variant.selling_price) ? Number(variant.original_price) : 0;
  const discountPercent = originalPrice > displayPrice ? Math.round((1 - displayPrice / originalPrice) * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 sm:py-10 grid md:grid-cols-2 gap-4 sm:gap-8 pb-28 md:pb-10">
      <div>
        <div className="relative aspect-square bg-muted rounded-2xl overflow-hidden">
          {media.length > 0 ? (
            <>
              {media[mediaIdx].type === "video" ? (
                <video
                  src={media[mediaIdx].url}
                  controls
                  playsInline
                  className="w-full h-full object-contain bg-black"
                />
              ) : (
                <img src={media[mediaIdx].url} alt={displayName} className="w-full h-full object-cover" />
              )}
              {media.length > 1 && (
                <>
                  <button
                    onClick={() => setMediaIdx((i) => (i - 1 + media.length) % media.length)}
                    className="absolute top-1/2 left-2 -translate-y-1/2 bg-white/80 rounded-full p-2 shadow"
                    aria-label="previous"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setMediaIdx((i) => (i + 1) % media.length)}
                    className="absolute top-1/2 right-2 -translate-y-1/2 bg-white/80 rounded-full p-2 shadow"
                    aria-label="next"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              )}
            </>
          ) : (
            <div className="w-full h-full grid place-items-center text-muted-foreground">
              {t("لا توجد صورة", "No image")}
            </div>
          )}
        </div>
        {media.length > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {media.map((m, i) => (
              <button
                key={i}
                onClick={() => setMediaIdx(i)}
                className={`h-16 w-16 rounded-lg overflow-hidden shrink-0 border-2 ${
                  i === mediaIdx ? "border-current" : "border-transparent"
                }`}
                style={i === mediaIdx ? { borderColor: primary } : undefined}
              >
                {m.type === "video" ? (
                  <div className="w-full h-full bg-black grid place-items-center text-white text-[10px]">▶</div>
                ) : (
                  <img src={m.url} alt="" className="w-full h-full object-cover" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 flex items-start justify-between gap-3 sm:mb-2"><h1 className="font-display text-2xl sm:text-3xl">{displayName}</h1><Button type="button" variant="outline" size="icon" className="shrink-0 rounded-full" onClick={() => toggleWishlist(product.id)} aria-label={t("المفضلة", "Wishlist")}><Heart className={`h-5 w-5 ${isWishlisted(product.id) ? "fill-red-600 text-red-600" : ""}`} /></Button></div>
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xl font-semibold sm:mb-4 sm:text-2xl" style={{ color: primary }}>
          <span>{priceLabel}</span>{originalPrice > displayPrice && <span className="text-base font-normal text-muted-foreground line-through">{formatPrice(originalPrice, currency, lang)}</span>}{discountPercent > 0 && <span className="rounded-full bg-neutral-950 px-3 py-1 text-xs text-white">{t(`وفر ${discountPercent}%`, `Save ${discountPercent}%`)}</span>}
        </div>
        {displayDescription && (
          <p className="text-muted-foreground mb-4 sm:mb-6 whitespace-pre-line text-sm sm:text-base">{displayDescription}</p>
        )}

        {hasVariants && (
          <div ref={optionsRef} className="mb-4 scroll-mt-24">
            <div className="text-sm font-medium mb-2">{t("الخيارات", "Options")}</div>
            <div className="flex flex-wrap gap-2">
              {variants.map((v) => {
                const oos = v.stock_main <= 0;
                const active = v.id === variantId;
                const label = [formatSizeWithUnit(v.size, v.size_unit, lang), v.color, v.fabric].filter(Boolean).join(" · ") || t("متغيّر", "Variant");
                const style: React.CSSProperties = active
                  ? { backgroundColor: primary, color: primaryFg, borderColor: primary }
                  : {};
                return (
                  <button
                    key={v.id}
                    disabled={oos}
                    onClick={() => { setVariantId(v.id); setQty(1); setErrorMsg(null); }}
                    className={`min-h-11 px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                      active ? "shadow-sm" : "border-input bg-background hover:border-foreground/40"
                    } ${oos ? "opacity-40 line-through cursor-not-allowed" : ""}`}
                    style={style}
                    aria-pressed={active}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {customFields.length > 0 && (
          <div className="mb-4 space-y-3">
            {customFields.map((f) => {
              const label = cfLabel(f);
              const val = cfValues[f.key] ?? "";
              const set = (v: string) => { setCfValues((s) => ({ ...s, [f.key]: v })); setErrorMsg(null); };
              return (
                <div key={f.key}>
                  <label className="block text-sm font-medium mb-1">
                    {label}{f.required && <span className="text-destructive ms-1">*</span>}
                  </label>
                  {f.type === "select" ? (
                    <select
                      value={val}
                      onChange={(e) => set(e.target.value)}
                      className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">{t("اختر...", "Select...")}</option>
                      {(f.options ?? []).map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={f.type === "number" ? "number" : "text"}
                      value={val}
                      onChange={(e) => set(e.target.value)}
                      className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {variant && (
          <div className="mb-4">
            <div className="text-sm font-medium mb-2">{t("الكمية", "Quantity")}</div>
            <div className="inline-flex items-center border rounded-lg">
              <button className="px-3 py-2" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
              <span className="px-4">{qty}</span>
              <button
                className="px-3 py-2 disabled:opacity-40"
                disabled={qty >= maxStock}
                onClick={() => setQty((q) => Math.min(maxStock, q + 1))}
              >
                +
              </button>
            </div>
            <span className="ms-3 inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-white/95 text-neutral-900">
              {maxStock} {t("متوفر", "available")}
            </span>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="hidden md:flex gap-2">
          <Button
            className="flex-1 h-12 font-semibold shadow-sm hover:opacity-90"
            style={{ backgroundColor: "var(--sf-btn-primary-bg)", color: "var(--sf-btn-primary-fg)", opacity: 1 }}
            onClick={() => doAdd(false)}
          >
            <ShoppingBag className="h-4 w-4 me-2" />
            {t("أضف للسلة", "Add to cart")}
          </Button>
          <Button
            className="h-12 border-2 font-semibold hover:opacity-90"
            style={{
              backgroundColor: "var(--sf-btn-secondary-bg)",
              color: "var(--sf-btn-secondary-fg)",
              borderColor: "var(--sf-btn-secondary-bg)",
              opacity: 1,
            }}
            onClick={() => doAdd(true)}
          >
            {t("اشتر الآن", "Buy now")}
          </Button>
        </div>
      </div>

      {/* Mobile sticky purchase bar */}
      <div
        className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur px-3 py-2 shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.15)]"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="mx-auto max-w-6xl flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">
              {variant ? [formatSizeWithUnit(variant.size, variant.size_unit, lang), variant.color, variant.fabric].filter(Boolean).join(" · ") || t("مختار", "Selected") : t("اختر الخيار", "Choose option")}
            </div>
            <div className="text-base font-semibold truncate" style={{ color: primary }}>
              {priceLabel}
            </div>
          </div>
          <Button
            className="h-11 px-3 font-semibold"
            style={{ backgroundColor: "var(--sf-btn-primary-bg)", color: "var(--sf-btn-primary-fg)", opacity: 1 }}
            onClick={() => doAdd(false)}
            aria-label={t("أضف للسلة", "Add to cart")}
          >
            <ShoppingBag className="h-4 w-4" />
          </Button>
          <Button
            className="h-11 px-4 font-semibold border-2"
            style={{
              backgroundColor: "var(--sf-btn-checkout-bg, var(--sf-btn-secondary-bg))",
              color: "var(--sf-btn-checkout-fg, var(--sf-btn-secondary-fg))",
              borderColor: "var(--sf-btn-checkout-bg, var(--sf-btn-secondary-bg))",
              opacity: 1,
            }}
            onClick={() => doAdd(true)}
          >
            {t("اشتر الآن", "Buy now")}
          </Button>
        </div>
      </div>
    </div>
  );
}
