import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStorefront, formatPrice, pickName, pickDescription } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/$slug/product/$id")({
  component: ProductDetail,
});

type Variant = {
  id: string;
  size: string | null;
  color: string | null;
  fabric: string | null;
  selling_price: number;
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

function ProductDetail() {
  const { id } = Route.useParams();
  const { brand, settings, currency, lang, t, addToCart } = useStorefront();
  const navigate = useNavigate();
  const [mediaIdx, setMediaIdx] = useState(0);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [cfValues, setCfValues] = useState<Record<string, string>>({});

  const { data: product, isLoading } = useQuery({
    queryKey: ["storefront", brand.slug, "product", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, name_ar, name_en, description, description_ar, description_en, image_url, media, custom_fields, product_variants(id, size, color, fabric, selling_price, stock_main)")
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

  const variants = product?.product_variants ?? [];
  const variant = variantId ? variants.find((v) => v.id === variantId) : null;
  const customFields = useMemo<CustomField[]>(
    () => (Array.isArray(product?.custom_fields) ? (product!.custom_fields as CustomField[]) : []),
    [product],
  );

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
  const canAdd = !!variant && variant.stock_main > 0;

  const displayName = pickName(lang, product);
  const displayDescription = pickDescription(lang, product);

  const cfLabel = (f: CustomField) => (lang === "ar" ? (f.label_ar || f.label_en || f.key) : (f.label_en || f.label_ar || f.key));

  const doAdd = () => {
    if (!variant) {
      toast.error(t("اختر خياراً أولاً", "Please select an option"));
      return;
    }
    for (const f of customFields) {
      if (f.required && !(cfValues[f.key] ?? "").trim()) {
        toast.error(t(`الحقل مطلوب: ${cfLabel(f)}`, `Required field: ${cfLabel(f)}`));
        return;
      }
    }
    const custom = customFields
      .map((f) => ({
        key: f.key,
        label_ar: f.label_ar,
        label_en: f.label_en,
        value: (cfValues[f.key] ?? "").trim(),
      }))
      .filter((v) => v.value.length > 0);
    addToCart({
      variant_id: variant.id,
      product_id: product.id,
      name: displayName,
      name_ar: product.name_ar,
      name_en: product.name_en,
      image: media.find((m) => m.type === "image")?.url ?? product.image_url ?? null,
      price: variant.selling_price,
      size: variant.size,
      color: variant.color,
      fabric: variant.fabric,
      qty,
      max_stock: variant.stock_main,
      custom_fields: custom,
    });
    toast.success(t("تمت الإضافة إلى السلة", "Added to cart"));
  };


  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-10 grid md:grid-cols-2 gap-8">
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
                style={i === mediaIdx ? { borderColor: settings.primary_color } : undefined}
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
        <h1 className="font-display text-3xl mb-2">{displayName}</h1>
        <div className="text-2xl font-semibold mb-4" style={{ color: settings.primary_color }}>
          {displayPrice > 0 ? formatPrice(displayPrice, currency, lang) : t("السعر عند الطلب", "Price on request")}
        </div>
        {displayDescription && (
          <p className="text-muted-foreground mb-6 whitespace-pre-line">{displayDescription}</p>
        )}

        {variants.length > 0 && (
          <div className="mb-4">
            <div className="text-sm font-medium mb-2">{t("الخيارات", "Options")}</div>
            <div className="flex flex-wrap gap-2">
              {variants.map((v) => {
                const oos = v.stock_main <= 0;
                const active = v.id === variantId;
                const label = [v.size, v.color, v.fabric].filter(Boolean).join(" · ") || t("متغيّر", "Variant");
                return (
                  <button
                    key={v.id}
                    disabled={oos}
                    onClick={() => { setVariantId(v.id); setQty(1); }}
                    className={`px-3 py-2 rounded-lg border text-sm ${active ? "border-current" : "border-input"} ${oos ? "opacity-40 line-through" : ""}`}
                    style={active ? { borderColor: settings.primary_color, backgroundColor: `${settings.primary_color}11` } : undefined}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
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

        <div className="flex gap-2">
          <Button
            className="flex-1 h-12"
            style={{ backgroundColor: "var(--sf-btn-primary-bg)", color: "var(--sf-btn-primary-fg)" }}
            disabled={!canAdd}
            onClick={doAdd}
          >
            <ShoppingBag className="h-4 w-4 me-2" />
            {t("أضف للسلة", "Add to cart")}
          </Button>
          <Button
            className="h-12 border"
            style={{
              backgroundColor: "var(--sf-btn-secondary-bg)",
              color: "var(--sf-btn-secondary-fg)",
              borderColor: "var(--sf-btn-secondary-bg)",
            }}
            disabled={!canAdd}
            onClick={() => {
              doAdd();
              navigate({ to: "/$slug/checkout", params: { slug: brand.slug } });
            }}
          >
            {t("اشتر الآن", "Buy now")}
          </Button>
        </div>
      </div>
    </div>
  );
}
