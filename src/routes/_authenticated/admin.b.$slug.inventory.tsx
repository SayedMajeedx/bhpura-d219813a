import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Package, TrendingUp, Wand as Wand2, Printer, Search, AlertTriangle, Boxes, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import { useT, useI18n } from "@/lib/i18n";
import { ActivityLogList } from "@/components/activity-log-list";
import { PrintLabelButton, printLabels, type LabelData } from "@/components/barcode-label";
import { useProfile } from "@/lib/profile-context";
import { useBrand } from "@/lib/brand-context";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { Switch } from "@/components/ui/switch";
import { ImageCropperDialog } from "@/components/image-cropper-dialog";
import { BilingualField } from "@/components/bilingual-field";
import { deletePublicMediaUrl, uploadPublicMedia } from "@/lib/r2-upload";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { parseVariantPrompt, type VariantGenerationPlan } from "@/lib/generate-variants.functions";
import { OptimizedVideo, ResponsiveImage } from "@/components/responsive-media";

/** Common measurement units the admin can pick from for a "size" variant. */
const SIZE_UNITS = ["", "cm", "mm", "m", "inch", "ft", "kg", "g", "ml", "l"] as const;

export const Route = createFileRoute("/_authenticated/admin/b/$slug/inventory")({
  component: Inventory,
});

type MediaItem = { type: "image" | "video"; url: string; stream_uid?: string; stream_iframe_url?: string; poster_url?: string };
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
  category: string | null;
  image_url: string | null;
  is_active: boolean;
  featured_trending: boolean;
  show_sale_badge: boolean;
  media: MediaItem[];
  custom_fields: CustomField[] | null;
};
type Variant = {
  id: string; product_id: string; sku: string | null; size: string | null; color: string | null; fabric: string | null;
  cost_price: number; selling_price: number; original_price: number | null; stock: number;
  stock_main: number; stock_incubator: number; barcode: string | null;
  size_unit: string | null; created_at?: string;
};
type Customization = { id: string; name: string; price_delta: number };

function InventoryDeleteAction({ message, onConfirm, mobile = false }: { message: string; onConfirm: () => void | Promise<void>; mobile?: boolean }) {
  const t = useT();
  return <AlertDialog>
    <AlertDialogTrigger asChild><Button type="button" className={mobile ? "h-11 w-11 touch-manipulation text-destructive" : "text-destructive"} variant="ghost" size="icon" aria-label={t("common.delete")}><Trash2 className={mobile ? "h-5 w-5" : "h-4 w-4"} /></Button></AlertDialogTrigger>
    <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
      <AlertDialogHeader><AlertDialogTitle>{t("common.delete")}</AlertDialogTitle><AlertDialogDescription>{message}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void onConfirm()}>{t("common.delete")}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

function Inventory() {
  const t = useT();
  const qc = useQueryClient();
  const brand = useBrand();
  const brandId = brand.id;
  const [tab, setTab] = useState<"products" | "customizations">("products");

  useRealtimeInvalidate(
    [
      { table: "products", brandId, queryKey: ["products", brandId] },
      { table: "product_variants", brandId, queryKey: ["variants", brandId] },
      { table: "customization_options", brandId, queryKey: ["customizations", brandId] },
    ],
    `inventory-${brandId}`,
  );

  const products = useQuery({
    queryKey: ["products", brandId],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("brand_id", brandId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        ...p,
        media: Array.isArray(p.media) ? p.media : [],
        custom_fields: Array.isArray(p.custom_fields) ? p.custom_fields : [],
      })) as Product[];
    },
  });

  const variants = useQuery({
    queryKey: ["variants", brandId],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_variants").select("*").eq("brand_id", brandId).order("created_at");
      if (error) throw error;
      return data as unknown as Variant[];
    },
  });

  const customizations = useQuery({
    queryKey: ["customizations", brandId],
    queryFn: async () => {
      const { data, error } = await supabase.from("customization_options").select("*").eq("brand_id", brandId).order("name");
      if (error) throw error;
      return data as Customization[];
    },
  });

  const businessName = useQuery({
    queryKey: ["business-name", brandId],
    queryFn: async () => {
      const { data } = await supabase.from("business_settings").select("business_name, currency").eq("brand_id", brandId).maybeSingle();
      return data ?? null;
    },
  });

  const salesHistory = useQuery({
    queryKey: ["inventory-sales-past45", brandId],
    queryFn: async () => {
      const past45Days = new Date();
      past45Days.setDate(past45Days.getDate() - 45);
      const { data, error } = await supabase
        .from("orders")
        .select("id, created_at, order_items(variant_id, quantity)")
        .eq("brand_id", brandId)
        .in("status", ["confirmed", "paid", "shipped", "completed"])
        .gte("created_at", past45Days.toISOString());
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-display">{t("inventory.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("inventory.subtitle")}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 border-b border-border">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === "products" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          onClick={() => setTab("products")}
        >{t("inventory.products")}</button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === "customizations" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          onClick={() => setTab("customizations")}
        >{t("inventory.customizations")}</button>
      </div>

      {tab === "products" ? (
        <ProductsSection
          products={products.data ?? []}
          variants={variants.data ?? []}
          businessName={businessName.data?.business_name ?? null}
          currency={businessName.data?.currency ?? "BHD"}
          onChanged={() => { qc.invalidateQueries({ queryKey: ["products"] }); qc.invalidateQueries({ queryKey: ["variants"] }); }}
          salesHistory={salesHistory.data ?? []}
        />
      ) : (
        <CustomizationsSection
          brandId={brandId}
          items={customizations.data ?? []}
          onChanged={() => qc.invalidateQueries({ queryKey: ["customizations"] })}
        />
      )}

      <div className="mt-8">
        <ActivityLogList scope="inventory" brandId={brandId} />
      </div>
    </div>
  );
}

function ProductsSection({ products, variants, businessName, currency, onChanged, salesHistory }: { products: Product[]; variants: Variant[]; businessName: string | null; currency: string; onChanged: () => void; salesHistory: any[] }) {
  const t = useT();
  const brand = useBrand();
  const brandId = brand.id;
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [dialogSession, setDialogSession] = useState(0);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "active" | "hidden">("all");
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});

  const toggleProduct = (productId: string) => {
    setExpandedProducts((prev) => ({
      ...prev,
      [productId]: !prev[productId],
    }));
  };

  const salesByVariant = useMemo(() => {
    const map = new Map<string, number>();
    salesHistory.forEach((order: any) => {
      (order.order_items ?? []).forEach((item: any) => {
        if (item.variant_id) {
          const qty = Number(item.quantity || 0);
          map.set(item.variant_id, (map.get(item.variant_id) || 0) + qty);
        }
      });
    });
    return map;
  }, [salesHistory]);

  const productWeeklySales = (productId: string) => {
    const pVariants = variants.filter((v) => v.product_id === productId);
    const productDailyVelocity = pVariants.reduce((sum, v) => {
      const qtySold = salesByVariant.get(v.id) || 0;
      const variantCreatedAt = v.created_at ? new Date(v.created_at) : null;
      const daysElapsed = variantCreatedAt 
        ? Math.max(1, Math.min(45, Math.ceil((new Date().getTime() - variantCreatedAt.getTime()) / (1000 * 60 * 60 * 24))))
        : 45;
      return sum + (qtySold / daysElapsed);
    }, 0);
    return productDailyVelocity * 7;
  };

  const del = async (id: string) => {
    const product = products.find((item) => item.id === id);
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message); else {
      const urls = new Set([
        product?.image_url,
        ...(product?.media ?? []).map((item) => item.url),
      ].filter((url): url is string => Boolean(url)));
      for (const url of urls) void deletePublicMediaUrl(brandId, url).catch(() => undefined);
      toast.success(t("common.delete"));
      onChanged();
    }
  };

  const isAr = useI18n().lang === "ar";
  const productStock = (productId: string) => variants.filter((variant) => variant.product_id === productId).reduce((sum, variant) => sum + Number(variant.stock_main || 0) + Number(variant.stock_incubator || 0), 0);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredProducts = products.filter((product) => {
    const productVariants = variants.filter((variant) => variant.product_id === product.id);
    const searchable = [product.name, product.name_ar, product.name_en, product.category, ...productVariants.flatMap((variant) => [variant.sku, variant.barcode, variant.size, variant.color])].join(" ").toLowerCase();
    const stock = productStock(product.id);
    return (!normalizedSearch || searchable.includes(normalizedSearch))
      && (stockFilter === "all" || (stockFilter === "out" ? stock <= 0 : stock < productWeeklySales(product.id)))
      && (visibilityFilter === "all" || (visibilityFilter === "active" ? product.is_active : !product.is_active));
  });
  const totalUnits = products.reduce((sum, product) => sum + productStock(product.id), 0);
  
  const lowStock = products.filter((product) => {
    const stock = productStock(product.id);
    const weeklySales = productWeeklySales(product.id);
    return stock < weeklySales;
  }).length;

  const deadStock = variants.filter((v) => (salesByVariant.get(v.id) || 0) === 0).length;

  const printAll = async () => {
    const labels: LabelData[] = [];
    const [{ data: freshProducts, error: productsError }, { data: freshVariants, error: variantsError }] = await Promise.all([
      supabase.from("products").select("id, name").eq("brand_id", brandId).order("created_at", { ascending: false }),
      supabase
        .from("product_variants")
        .select("product_id, barcode, size, color, selling_price")
        .eq("brand_id", brandId)
        .not("barcode", "is", null)
        .order("created_at"),
    ]);

    if (productsError || variantsError) {
      toast.error(productsError?.message ?? variantsError?.message ?? (isAr ? "تعذر تحميل الباركودات" : "Could not load barcodes"));
      return;
    }

    const printableProducts = (freshProducts ?? products) as Pick<Product, "id" | "name">[];
    const printableVariants = (freshVariants ?? variants) as Pick<Variant, "product_id" | "barcode" | "size" | "color" | "selling_price">[];

    for (const p of printableProducts) {
      for (const v of printableVariants.filter((x) => x.product_id === p.id)) {
        if (!v.barcode) continue;
        labels.push({
          code: v.barcode,
          productName: p.name,
          size: v.size,
          color: v.color,
          price: v.selling_price,
          businessName,
        });
      }
    }
    if (labels.length === 0) {
      toast.error(isAr ? "لا توجد باركودات للطباعة" : "No barcodes to print");
      return;
    }
    printLabels(labels);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          [Package, isAr ? "المنتجات" : "Products", products.length],
          [Boxes, isAr ? "إجمالي الوحدات" : "Total units", totalUnits],
          [AlertTriangle, isAr ? "مخزون منخفض" : "Low stock", lowStock],
          [TrendingUp, isAr ? "بضائع راكدة" : "Dead Stock Items", deadStock],
        ].map(([Icon, label, value], index) => { const StatIcon = Icon as typeof Package; return <Card key={index} className="p-3 sm:p-4"><div className="flex items-center gap-3"><div className={`rounded-lg p-2 ${index >= 2 && Number(value) > 0 ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}><StatIcon className="h-4 w-4" /></div><div className="min-w-0"><p className="text-xs text-muted-foreground truncate">{String(label)}</p><p className="font-semibold">{String(value)}</p></div></div></Card>; })}
      </div>

      <Card className="p-3 sm:p-4">
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(220px,1fr)_160px_170px] gap-3">
          <div className="relative"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={isAr ? "ابحث بالمنتج أو SKU أو الباركود" : "Search product, SKU, or barcode"} /></div>
          <Select value={stockFilter} onValueChange={(value: "all" | "low" | "out") => setStockFilter(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{isAr ? "كل المخزون" : "All stock"}</SelectItem><SelectItem value="low">{isAr ? "مخزون منخفض" : "Low stock"}</SelectItem><SelectItem value="out">{isAr ? "نفد المخزون" : "Out of stock"}</SelectItem></SelectContent></Select>
          <Select value={visibilityFilter} onValueChange={(value: "all" | "active" | "hidden") => setVisibilityFilter(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{isAr ? "كل المنتجات" : "All visibility"}</SelectItem><SelectItem value="active">{isAr ? "ظاهر في المتجر" : "Storefront active"}</SelectItem><SelectItem value="hidden">{isAr ? "مخفي" : "Hidden"}</SelectItem></SelectContent></Select>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{filteredProducts.length} / {products.length}</p>
      </Card>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <Button variant="outline" onClick={printAll}>
          <Printer className="h-4 w-4 me-2" /> {isAr ? "طباعة كل الباركودات" : "Print all barcodes"}
        </Button>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditing(null); setDialogSession((value) => value + 1); }}><Plus className="h-4 w-4 me-2" /> {t("inventory.newProduct")}</Button>
          </DialogTrigger>
          <ProductDialog key={`${editing?.id ?? "new"}-${dialogSession}`} product={editing} onSaved={() => { setOpen(false); setEditing(null); onChanged(); }} />
        </Dialog>
      </div>

      {products.length === 0 ? (
        <Card className="p-12 text-center">
          <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">{t("inventory.none")}</p>
        </Card>
      ) : filteredProducts.length === 0 ? (
        <Card className="p-10 text-center"><Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">{isAr ? "لا توجد منتجات مطابقة" : "No matching products"}</p><Button variant="ghost" className="mt-2" onClick={() => { setSearch(""); setStockFilter("all"); setVisibilityFilter("all"); }}>{isAr ? "مسح عوامل التصفية" : "Clear filters"}</Button></Card>
      ) : (
        <div className="space-y-4">
          {filteredProducts.map((p) => {
            const pVariants = variants.filter((v) => v.product_id === p.id);
            const stockTotal = pVariants.reduce((s, v) => s + Number(v.stock_main || 0) + Number(v.stock_incubator || 0), 0);
            const prices = pVariants.map((v) => Number(v.selling_price || 0)).filter(Number.isFinite);
            const isExpanded = !!expandedProducts[p.id];

            return (
              <Card 
                key={p.id} 
                className="p-4 sm:p-6 transition-all duration-150 hover:border-primary/20 hover:shadow-xs cursor-pointer"
                onClick={() => toggleProduct(p.id)}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex gap-4 flex-1 min-w-0">
                    {p.image_url && (
                      <img src={p.image_url} alt={p.name} className="w-12 h-14 sm:w-20 sm:h-24 object-cover rounded-md border border-border shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base sm:text-lg font-display truncate">{(isAr ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar)) || p.name}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${p.is_active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                          {p.is_active ? (isAr ? "ظاهر" : "Active") : (isAr ? "مخفي" : "Hidden")}
                        </span>
                      </div>
                      {p.category && <p className="text-xs text-muted-foreground mt-0.5">{p.category}</p>}
                      
                      {isExpanded && (() => {
                        const desc = isAr ? (p.description_ar || p.description_en) : (p.description_en || p.description_ar);
                        const fallback = desc || p.description;
                        return fallback ? <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{fallback}</p> : null;
                      })()}
                      
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          stockTotal <= 0 
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400" 
                            : stockTotal <= 5 
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" 
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                        }`}>
                          {stockTotal <= 0 ? (isAr ? "نفد المخزون" : "Out of stock") : `${stockTotal} ${t("inventory.inStock")}`}
                        </span>
                        <span className="text-muted-foreground">{pVariants.length} {t("inventory.variantsCount")}</span>
                        {prices.length > 0 && (
                          <span className="font-medium text-foreground bg-secondary/50 px-2 py-0.5 rounded-sm">
                            {formatMoney(Math.min(...prices), currency)}{Math.max(...prices) !== Math.min(...prices) ? ` – ${formatMoney(Math.max(...prices), currency)}` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(p); setDialogSession((value) => value + 1); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <InventoryDeleteAction message={t("common.confirmDelete")} onConfirm={() => del(p.id)} />
                    </div>
                    <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                  </div>
                </div>

                {isExpanded && (
                  <VariantList productId={p.id} productName={p.name} businessName={businessName} variants={pVariants} onChanged={onChanged} salesByVariant={salesByVariant} />
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProductDialog({ product, onSaved }: { product: Product | null; onSaved: () => void }) {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const initialForm = {
    name_ar: product?.name_ar ?? "",
    name_en: product?.name_en ?? product?.name ?? "",
    description_ar: product?.description_ar ?? "",
    description_en: product?.description_en ?? product?.description ?? "",
    category: product?.category ?? "",
    image_url: product?.image_url ?? "",
    is_active: product?.is_active ?? true,
    featured_trending: product?.featured_trending ?? false,
    show_sale_badge: product?.show_sale_badge ?? true,
    media: (product?.media ?? []) as MediaItem[],
    custom_fields: (Array.isArray(product?.custom_fields) ? product!.custom_fields : []) as CustomField[],
  };
  const [form, setForm] = useState(initialForm);
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [pendingVideo, setPendingVideo] = useState<File | null>(null);
  const uncommittedUploads = useRef(new Set<string>());
  const removedCommittedMedia = useRef(new Set<string>());

  useEffect(() => () => {
    for (const url of uncommittedUploads.current) {
      void deletePublicMediaUrl(brand.id, url).catch(() => undefined);
    }
    uncommittedUploads.current.clear();
    removedCommittedMedia.current.clear();
  }, [brand.id]);

  useEffect(() => {
    setForm({
      name_ar: product?.name_ar ?? "",
      name_en: product?.name_en ?? product?.name ?? "",
      description_ar: product?.description_ar ?? "",
      description_en: product?.description_en ?? product?.description ?? "",
      category: product?.category ?? "",
      image_url: product?.image_url ?? "",
      is_active: product?.is_active ?? true,
      featured_trending: product?.featured_trending ?? false,
      show_sale_badge: product?.show_sale_badge ?? true,
      media: (product?.media ?? []) as MediaItem[],
      custom_fields: (Array.isArray(product?.custom_fields) ? product!.custom_fields : []) as CustomField[],
    });
  }, [product?.id]);

  const categoriesQ = useQuery({
    queryKey: ["categories", brand.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from("categories") as any)
        .select("id, name_en, name_ar, slug")
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name_en: string; name_ar: string | null; slug: string | null }>;
    },
  });

  const uploadBlob = async (blob: Blob, _ext: string, kind: "image" | "video") => {
    try {
      setUploading(true);
      const mediaBlob = blob.type ? blob : new Blob([blob], { type: kind === "image" ? "image/jpeg" : "video/mp4" });
      const url = await uploadPublicMedia(brand.id, mediaBlob, "product");
      uncommittedUploads.current.add(url);
      setForm((f) => ({ ...f, media: [...f.media, { type: kind, url }] }));
      toast.success(isAr ? "تم الرفع" : "Uploaded");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleFilePicked = (file: File) => {
    if (file.type.startsWith("video")) {
      const ext = file.name.split(".").pop() ?? "mp4";
      setPendingVideo(file);
      void uploadBlob(file, ext, "video").finally(() => setPendingVideo(null));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCropSrc(String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleCropConfirmed = async (blob: Blob) => {
    await uploadBlob(blob, "jpg", "image");
    setCropSrc(null);
  };

  const removeMedia = (index: number) => {
    const media = form.media[index];
    if (media && uncommittedUploads.current.delete(media.url)) {
      void deletePublicMediaUrl(brand.id, media.url).catch(() => {
        uncommittedUploads.current.add(media.url);
      });
    } else if (media) {
      removedCommittedMedia.current.add(media.url);
    }
    setForm((current) => ({ ...current, media: current.media.filter((_, i) => i !== index) }));
  };

  const save = async () => {
    const nameAr = form.name_ar.trim();
    const nameEn = form.name_en.trim();
    if (!nameAr && !nameEn) return toast.error(isAr ? "أدخل اسم المنتج بأي لغة" : "Enter a product name in any language");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const legacyName = nameEn || nameAr;
    const legacyDesc = form.description_en.trim() || form.description_ar.trim() || null;

    if (product) {
      const patch = {
        name: legacyName,
        name_ar: nameAr || null,
        name_en: nameEn || null,
        description: legacyDesc,
        description_ar: form.description_ar.trim() || null,
        description_en: form.description_en.trim() || null,
        category: form.category,
        image_url: form.image_url,
        is_active: form.is_active,
        featured_trending: form.featured_trending,
        show_sale_badge: form.show_sale_badge,
        media: form.media as any,
        custom_fields: (form.custom_fields ?? []) as any,
      };
      const { error } = await supabase.from("products").update(patch).eq("id", product.id);
      if (error) return toast.error(error.message);
    } else {
      const payload = {
        user_id: user.id,
        brand_id: brand.id,
        name: legacyName,
        name_ar: nameAr || null,
        name_en: nameEn || null,
        description: legacyDesc,
        description_ar: form.description_ar.trim() || null,
        description_en: form.description_en.trim() || null,
        category: form.category,
        image_url: form.image_url,
        is_active: form.is_active,
        featured_trending: form.featured_trending,
        show_sale_badge: form.show_sale_badge,
        media: form.media as any,
        custom_fields: (form.custom_fields ?? []) as any,
      };
      const { error } = await (supabase.from("products") as any).insert(payload);
      if (error) return toast.error(error.message);
    }
    for (const url of removedCommittedMedia.current) {
      void deletePublicMediaUrl(brand.id, url).catch(() => undefined);
    }
    removedCommittedMedia.current.clear();
    uncommittedUploads.current.clear();
    toast.success(t("common.save"));
    onSaved();
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{product ? t("inventory.editProduct") : t("inventory.newProduct")}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <BilingualField
          labelAr="اسم المنتج — عربي"
          labelEn="Product name — English"
          valueAr={form.name_ar}
          valueEn={form.name_en}
          onChangeAr={(v) => setForm({ ...form, name_ar: v })}
          onChangeEn={(v) => setForm({ ...form, name_en: v })}
        />
        <div>
          <Label>{t("inventory.category")}</Label>
          {(categoriesQ.data ?? []).length > 0 ? (
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option value="">{isAr ? "بدون قسم" : "No category"}</option>
              {(categoriesQ.data ?? []).map((c) => {
                const val = c.slug || c.name_en;
                const label = isAr ? c.name_ar || c.name_en : c.name_en;
                return <option key={c.id} value={val}>{label}</option>;
              })}
            </select>
          ) : (
            <Input placeholder={t("inventory.categoryPh")} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          )}
          {(categoriesQ.data ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {isAr ? "أنشئ أقسامًا من صفحة الأقسام لتظهر هنا كقائمة منسدلة." : "Create categories in the Categories page to get a dropdown here."}
            </p>
          )}
        </div>
        <div><Label>{t("inventory.imageUrl")}</Label><Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} /></div>
        <BilingualField
          multiline
          labelAr="الوصف — عربي"
          labelEn="Description — English"
          valueAr={form.description_ar}
          valueEn={form.description_en}
          onChangeAr={(v) => setForm({ ...form, description_ar: v })}
          onChangeEn={(v) => setForm({ ...form, description_en: v })}
        />

        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div>
            <p className="text-sm font-medium">{isAr ? "المنتج مفعّل في المتجر" : "Active in storefront"}</p>
            <p className="text-xs text-muted-foreground">{isAr ? "إظهار للعملاء في المتجر العام" : "Show to customers in the public storefront"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`text-xs font-medium ${form.is_active ? "text-emerald-700" : "text-muted-foreground"}`}>
              {form.is_active ? (isAr ? "مفعّل" : "Active") : (isAr ? "مخفي" : "Hidden")}
            </span>
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              aria-label={isAr ? "إظهار المنتج في المتجر" : "Show product in storefront"}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-md border border-border p-3"><div><p className="text-sm font-medium">{isAr ? "إبراز في الرائج الآن" : "Feature in Trending now"}</p><p className="text-xs text-muted-foreground">{isAr ? "يعطي المنتج أولوية حتى تتوفر بيانات زيارات كافية." : "Prioritizes this product while traffic data grows."}</p></div><Switch checked={form.featured_trending} onCheckedChange={(v) => setForm({ ...form, featured_trending: v })} /></div>
          <div className="flex items-center justify-between rounded-md border border-border p-3"><div><p className="text-sm font-medium">{isAr ? "إظهار شارة التنزيلات" : "Show Sale badge"}</p><p className="text-xs text-muted-foreground">{isAr ? "تظهر فقط عندما يكون السعر الأصلي أعلى." : "Shown only when an original price is higher."}</p></div><Switch checked={form.show_sale_badge} onCheckedChange={(v) => setForm({ ...form, show_sale_badge: v })} /></div>
        </div>

        <div className="space-y-2">
          <Label>{isAr ? "وسائط المنتج (صور/فيديو)" : "Product media (images / videos)"}</Label>
          <div className="flex flex-wrap gap-2">
            {form.media.map((m, i) => (
              <div key={i} className="relative w-20 h-20 rounded-md border border-border overflow-hidden bg-secondary">
                {m.type === "video" ? (
                  <OptimizedVideo src={m.stream_iframe_url ? undefined : m.url} streamIframeUrl={m.stream_iframe_url} poster={m.poster_url ?? m.url} className="h-full w-full object-cover" wrapperClassName="h-full w-full overflow-hidden" />
                ) : (
                  <ResponsiveImage src={m.url} preset="thumb" sizes="80px" alt="" className="w-full h-full object-cover" />
                )}
                <button
                  type="button"
                  className="absolute top-0.5 end-0.5 bg-background/80 rounded-full p-0.5"
                  onClick={() => removeMedia(i)}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            <label className="w-20 h-20 rounded-md border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground cursor-pointer hover:bg-secondary">
              {uploading ? "…" : <Plus className="h-4 w-4" />}
              <input
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFilePicked(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          </div>
        </div>
      </div>
      <ImageCropperDialog
        open={!!cropSrc}
        imageSrc={cropSrc}
        aspect={3 / 4}
        busy={uploading}
        onCancel={() => setCropSrc(null)}
        onConfirm={handleCropConfirmed}
      />
      {pendingVideo && null}

      <div className="rounded-lg border border-border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">{isAr ? "حقول مخصّصة للمنتج" : "Custom product fields"}</div>
            <div className="text-xs text-muted-foreground">
              {isAr ? "أضف حتى 5 حقول (نص/رقم/قائمة) يظهرون للعميل في صفحة المنتج." : "Add up to 5 fields (text/number/select) that appear to customers on the product page."}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={(form.custom_fields ?? []).length >= 5}
            onClick={() => setForm({
              ...form,
              custom_fields: [
                ...(form.custom_fields ?? []),
                { key: `f${Date.now()}`, label_ar: "", label_en: "", type: "text", options: [], required: false },
              ],
            })}
          >
            {isAr ? "إضافة حقل" : "Add field"}
          </Button>
        </div>
        {(form.custom_fields ?? []).map((f, i) => {
          const upd = (patch: Partial<CustomField>) => {
            const next = [...form.custom_fields];
            next[i] = { ...next[i], ...patch };
            setForm({ ...form, custom_fields: next });
          };
          const remove = () => setForm({ ...form, custom_fields: form.custom_fields.filter((_, j) => j !== i) });
          return (
            <div key={f.key} className="rounded-md border border-border p-2 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Input placeholder={isAr ? "التسمية بالعربية" : "Arabic label"} value={f.label_ar ?? ""} onChange={(e) => upd({ label_ar: e.target.value })} />
                <Input placeholder={isAr ? "التسمية بالإنجليزية" : "English label"} value={f.label_en ?? ""} onChange={(e) => upd({ label_en: e.target.value })} />
                <Select value={f.type} onValueChange={(v) => upd({ type: v as CustomField["type"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">{isAr ? "نص" : "Text"}</SelectItem>
                    <SelectItem value="number">{isAr ? "رقم" : "Number"}</SelectItem>
                    <SelectItem value="select">{isAr ? "قائمة اختيار" : "Dropdown"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {f.type === "select" && (
                <Input
                  placeholder={isAr ? "الخيارات مفصولة بفاصلة (,) أو (،)" : "Options separated by commas"}
                  defaultValue={(f.options ?? []).join(", ")}
                  onChange={(e) => upd({ options: e.target.value.split(/[,،]/).map((s) => s.trim()).filter(Boolean) })}
                />
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs">
                  <Switch checked={!!f.required} onCheckedChange={(v) => upd({ required: v })} />
                  <span>{isAr ? "إلزامي" : "Required"}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={remove}>{isAr ? "حذف" : "Remove"}</Button>
              </div>
            </div>
          );
        })}
      </div>

      <DialogFooter><Button onClick={save}>{t("common.save")}</Button></DialogFooter>
    </DialogContent>
  );
}


type BulkVariantRow = {
  size: string; size_unit: string; color: string; fabric: string; sku: string; barcode: string;
  cost_price: number; selling_price: number; stock_main: number; stock_incubator: number;
};

const splitVariantValues = (value: string) => [...new Set(value.split(/[\n,，]+/).map((item) => item.trim()).filter(Boolean))];
const skuPart = (value: string) => value.normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toUpperCase();
const makeEan13 = (used: Set<string>) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const bytes = new Uint32Array(2); crypto.getRandomValues(bytes);
    const body = `29${String(bytes[0]).padStart(10, "0").slice(-10)}`;
    const sum = body.split("").reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    const code = `${body}${(10 - (sum % 10)) % 10}`;
    if (!used.has(code)) { used.add(code); return code; }
  }
  throw new Error("BARCODE_GENERATION_FAILED");
};

function BulkVariantDialog({ productId, variants, canViewFinancials, onChanged }: { productId: string; variants: Variant[]; canViewFinancials: boolean; onChanged: () => void }) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const blank: VariantGenerationPlan = { base_sku: "", sizes: [], colors: [], fabric: "", size_unit: "", cost_price: 0, selling_price: 0, stock_main: 0, stock_incubator: 0 };
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<VariantGenerationPlan>(blank);
  const [sizesText, setSizesText] = useState("");
  const [colorsText, setColorsText] = useState("");
  const [rows, setRows] = useState<BulkVariantRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const applyPlan = (next: VariantGenerationPlan) => {
    setPlan(next); setSizesText(next.sizes.join(", ")); setColorsText(next.colors.join(", ")); setRows([]);
  };
  const parseWithAi = async () => {
    if (prompt.trim().length < 3) return toast.error(isAr ? "اكتب وصفاً للمتغيرات أولاً" : "Describe the variants first");
    setParsing(true);
    try { applyPlan(await parseVariantPrompt({ data: { prompt, language: isAr ? "ar" : "en" } })); }
    catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast.error(
        message.includes("RATE_LIMITED")
          ? (isAr ? "تم بلوغ حد الاستخدام، استخدم الإنشاء اليدوي مؤقتاً" : "AI limit reached; use the manual builder for now")
          : message.includes("QUOTA_CONFIGURATION_ERROR")
            ? (isAr ? "يلزم تطبيق تحديث قاعدة البيانات الخاص بمنشئ المتغيرات" : "The variant-generator database update still needs to be applied")
            : message.includes("GEMINI_AUTH_FAILED")
              ? (isAr ? "مفتاح Gemini غير صالح أو غير متاح" : "The Gemini API key is invalid or unavailable")
              : (isAr ? "تعذر فهم الطلب. يمكنك إدخال القيم يدوياً." : "Could not parse the request. You can enter the values manually."),
      );
    } finally { setParsing(false); }
  };
  const buildPreview = () => {
    const sizes = splitVariantValues(sizesText); const colors = splitVariantValues(colorsText);
    const combinations = Math.max(1, sizes.length) * Math.max(1, colors.length);
    if (combinations > 100) return toast.error(isAr ? "الحد الأقصى 100 متغير في المرة الواحدة" : "Maximum 100 variants per batch");
    if (!plan.base_sku.trim()) return toast.error(isAr ? "أدخل رمز المنتج الأساسي" : "Enter a base SKU");
    const usedBarcodes = new Set(variants.map((v) => v.barcode).filter(Boolean) as string[]);
    const sizeAxis = sizes.length ? sizes : [""]; const colorAxis = colors.length ? colors : [""];
    const generated = sizeAxis.flatMap((size) => colorAxis.map((color) => {
      const suffix = [color, size].map(skuPart).filter(Boolean).join("-");
      return { ...plan, size, color, size_unit: plan.size_unit, sku: `${skuPart(plan.base_sku)}${suffix ? `-${suffix}` : ""}`, barcode: makeEan13(usedBarcodes) } as BulkVariantRow;
    }));
    setRows(generated);
  };
  const patchRow = (index: number, patch: Partial<BulkVariantRow>) => setRows((current) => current.map((row, i) => i === index ? { ...row, ...patch } : row));
  const saveAll = async () => {
    const existingSkus = new Set(variants.map((v) => v.sku?.trim().toUpperCase()).filter(Boolean));
    const existingBarcodes = new Set(variants.map((v) => v.barcode?.trim().toUpperCase()).filter(Boolean));
    const seenSkus = new Set<string>(); const seenBarcodes = new Set<string>();
    const invalid = rows.some((row) => {
      const sku = row.sku.trim().toUpperCase(); const barcode = row.barcode.trim().toUpperCase();
      const bad = !sku || !barcode || existingSkus.has(sku) || existingBarcodes.has(barcode) || seenSkus.has(sku) || seenBarcodes.has(barcode) || row.selling_price < 0 || row.cost_price < 0 || !Number.isInteger(row.stock_main) || row.stock_main < 0 || !Number.isInteger(row.stock_incubator) || row.stock_incubator < 0;
      seenSkus.add(sku); seenBarcodes.add(barcode); return bad;
    });
    if (!rows.length || invalid) return toast.error(isAr ? "راجع الرموز والأسعار والمخزون؛ توجد قيمة ناقصة أو مكررة" : "Review SKUs, barcodes, prices, and stock; a value is missing or duplicated");
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("AUTH_REQUIRED");
      const { error } = await (supabase.from("product_variants") as any).insert(rows.map((row) => ({
        user_id: user.id, brand_id: brand.id, product_id: productId,
        size: row.size || null, size_unit: row.size_unit || null, color: row.color || null, fabric: row.fabric || null,
        sku: row.sku.trim(), barcode: row.barcode.trim(), cost_price: canViewFinancials ? row.cost_price : 0,
        selling_price: row.selling_price, stock_main: row.stock_main, stock_incubator: row.stock_incubator,
      })));
      if (error) throw error;
      toast.success(isAr ? `تمت إضافة ${rows.length} متغير` : `${rows.length} variants added`);
      setOpen(false); setRows([]); setPrompt(""); applyPlan(blank); onChanged();
    } catch (error) { toast.error(error instanceof Error ? error.message : (isAr ? "فشل الحفظ" : "Save failed")); }
    finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline" size="sm"><Wand2 className="me-2 h-4 w-4" />{isAr ? "إنشاء متغيرات متعددة" : "Bulk / AI variants"}</Button></DialogTrigger>
    <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
      <DialogHeader><DialogTitle>{isAr ? "منشئ متغيرات المنتج" : "Product variant builder"}</DialogTitle></DialogHeader>
      <div className="rounded-lg border bg-secondary/30 p-4 space-y-3">
        <Label>{isAr ? "صف المتغيرات بالعربية أو الإنجليزية" : "Describe variants in English or Arabic"}</Label>
        <textarea className="min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={isAr ? "مثال: كود NP24، الألوان أسود وأخضر وأبيض، المقاسات من 1 إلى 5، السعر 15 د.ب" : "Example: code NP24, black, green and white, sizes 1 to 5, priced at BHD 15"} />
        <Button type="button" onClick={parseWithAi} disabled={parsing}>{parsing ? (isAr ? "جاري التحليل..." : "Parsing...") : (isAr ? "تحليل بالذكاء الاصطناعي" : "Parse with AI")}</Button>
        <p className="text-xs text-muted-foreground">{isAr ? "الذكاء الاصطناعي يعبئ الحقول فقط. لن يتم حفظ شيء قبل المراجعة والتأكيد." : "AI only fills the fields. Nothing is saved until you review and confirm."}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><Label>{isAr ? "رمز المنتج الأساسي" : "Base SKU"}</Label><Input value={plan.base_sku} onChange={(e) => setPlan({ ...plan, base_sku: e.target.value })} /></div>
        <div><Label>{isAr ? "المقاسات (بفاصلة)" : "Sizes (comma separated)"}</Label><Input value={sizesText} onChange={(e) => setSizesText(e.target.value)} /></div>
        <div><Label>{isAr ? "الألوان (بفاصلة)" : "Colors (comma separated)"}</Label><Input value={colorsText} onChange={(e) => setColorsText(e.target.value)} /></div>
        <div><Label>{isAr ? "الخامة" : "Fabric"}</Label><Input value={plan.fabric} onChange={(e) => setPlan({ ...plan, fabric: e.target.value })} /></div>
        <div><Label>{isAr ? "وحدة المقاس" : "Size unit"}</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3" value={plan.size_unit} onChange={(e) => setPlan({ ...plan, size_unit: e.target.value as VariantGenerationPlan["size_unit"] })}>{SIZE_UNITS.map((unit) => <option key={unit} value={unit}>{unit || "—"}</option>)}</select></div>
        {canViewFinancials && <div><Label>{isAr ? "التكلفة" : "Cost"}</Label><Input type="number" min="0" step="0.01" value={plan.cost_price} onChange={(e) => setPlan({ ...plan, cost_price: Number(e.target.value) })} /></div>}
        <div><Label>{isAr ? "سعر البيع" : "Selling price"}</Label><Input type="number" min="0" step="0.01" value={plan.selling_price} onChange={(e) => setPlan({ ...plan, selling_price: Number(e.target.value) })} /></div>
        <div><Label>{isAr ? "مخزون الرئيسي" : "Main stock"}</Label><Input type="number" min="0" value={plan.stock_main} onChange={(e) => setPlan({ ...plan, stock_main: Number(e.target.value) })} /></div>
        <div><Label>{isAr ? "مخزون الحاضنة" : "Incubator stock"}</Label><Input type="number" min="0" value={plan.stock_incubator} onChange={(e) => setPlan({ ...plan, stock_incubator: Number(e.target.value) })} /></div>
      </div>
      <Button type="button" variant="secondary" onClick={buildPreview}><Boxes className="me-2 h-4 w-4" />{isAr ? "إنشاء المعاينة" : "Build preview"}</Button>
      {rows.length > 0 && <div className="space-y-2"><div className="flex items-center justify-between"><Label>{isAr ? `معاينة ${rows.length} متغير` : `Preview ${rows.length} variants`}</Label><span className="text-xs text-muted-foreground">{isAr ? "يمكن تعديل كل قيمة" : "Every value is editable"}</span></div>
        <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[1000px] text-sm"><thead className="bg-secondary"><tr>{[isAr ? "المقاس" : "Size", isAr ? "اللون" : "Color", isAr ? "الخامة" : "Fabric", "SKU", isAr ? "الباركود" : "Barcode", ...(canViewFinancials ? [isAr ? "التكلفة" : "Cost"] : []), isAr ? "السعر" : "Price", isAr ? "الرئيسي" : "Main", isAr ? "الحاضنة" : "Incubator", ""].map((label) => <th key={label} className="p-2 text-start">{label}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={`${index}-${row.barcode}`} className="border-t">{(["size", "color", "fabric", "sku", "barcode"] as const).map((field) => <td key={field} className="p-1"><Input className="h-8 min-w-24" value={row[field]} onChange={(e) => patchRow(index, { [field]: e.target.value })} /></td>)}{canViewFinancials && <td className="p-1"><Input className="h-8 w-24" type="number" min="0" step="0.01" value={row.cost_price} onChange={(e) => patchRow(index, { cost_price: Number(e.target.value) })} /></td>}<td className="p-1"><Input className="h-8 w-24" type="number" min="0" step="0.01" value={row.selling_price} onChange={(e) => patchRow(index, { selling_price: Number(e.target.value) })} /></td><td className="p-1"><Input className="h-8 w-20" type="number" min="0" value={row.stock_main} onChange={(e) => patchRow(index, { stock_main: Number(e.target.value) })} /></td><td className="p-1"><Input className="h-8 w-20" type="number" min="0" value={row.stock_incubator} onChange={(e) => patchRow(index, { stock_incubator: Number(e.target.value) })} /></td><td className="p-1"><Button type="button" size="icon" variant="ghost" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4 text-destructive" /></Button></td></tr>)}</tbody></table></div></div>}
      <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>{isAr ? "إلغاء" : "Cancel"}</Button><Button onClick={saveAll} disabled={!rows.length || saving}>{saving ? (isAr ? "جاري الحفظ..." : "Saving...") : (isAr ? `حفظ ${rows.length} متغير` : `Save ${rows.length} variants`)}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function VariantList({ productId, productName, businessName, variants, onChanged, salesByVariant }: { productId: string; productName: string; businessName: string | null; variants: Variant[]; onChanged: () => void; salesByVariant: Map<string, number> }) {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { canViewFinancials } = useProfile();
  const brand = useBrand();
  const [adding, setAdding] = useState(false);
  const empty = {
    size: "", size_unit: "", color: "", fabric: "", sku: "", barcode: "",
    cost_price: "0", selling_price: "0", original_price: "",
    stock_main: "0", stock_incubator: "0",
  };
  const [row, setRow] = useState(empty);

  const genBarcode = () => {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const body = `29${Date.now().toString().slice(-6)}${String(random[0] % 10000).padStart(4, "0")}`;
    const weightedSum = body.split("").reduce(
      (sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3),
      0,
    );
    return `${body}${(10 - (weightedSum % 10)) % 10}`;
  };

  const normalizeBarcode = (value: unknown) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().toUpperCase();
  const barcodeInUse = (value: unknown, exceptId?: string) => {
    const normalized = normalizeBarcode(value);
    return !!normalized && variants.some((variant) => variant.id !== exceptId && normalizeBarcode(variant.barcode) === normalized);
  };

  const add = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (barcodeInUse(row.barcode)) {
      toast.error(isAr ? "هذا الباركود مستخدم بالفعل لمنتج آخر" : "This barcode is already assigned to another variant");
      return;
    }
    const { error } = await (supabase.from("product_variants") as any).insert({
      user_id: user.id,
      brand_id: brand.id,
      product_id: productId,
      size: row.size || null, size_unit: row.size_unit || null,
      color: row.color || null, fabric: row.fabric || null,
      sku: row.sku || null, barcode: row.barcode.trim() || null,
      cost_price: Number(row.cost_price), selling_price: Number(row.selling_price), original_price: row.original_price ? Number(row.original_price) : null,
      stock_main: Number(row.stock_main), stock_incubator: Number(row.stock_incubator),
    });
    if (error) return toast.error(error.message);
    setRow(empty); setAdding(false); onChanged();
  };

  const update = async (v: Variant, patch: Partial<Variant>) => {
    if (Object.prototype.hasOwnProperty.call(patch, "barcode") && barcodeInUse(patch.barcode, v.id)) {
      toast.error(isAr ? "هذا الباركود مستخدم بالفعل لمنتج آخر" : "This barcode is already assigned to another variant");
      return;
    }
    const { error } = await (supabase.from("product_variants") as any).update(patch).eq("id", v.id);
    if (error) toast.error(error.message); else onChanged();
  };
  const del = async (id: string) => {
    const { error } = await supabase.from("product_variants").delete().eq("id", id);
    if (error) toast.error(error.message); else onChanged();
  };

  const mainLabel = isAr ? "الرئيسي" : "Main";
  const incLabel = isAr ? "الحاضنة" : "Incubator";
  const barcodeLabel = isAr ? "الباركود" : "Barcode";

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="space-y-3 md:hidden">
        {variants.map((v) => {
          const margin = v.selling_price > 0 ? ((v.selling_price - v.cost_price) / v.selling_price) * 100 : 0;
          return (
            <div key={v.id} className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{[v.size, v.color, v.fabric].filter(Boolean).join(" · ") || (isAr ? "خيار المنتج" : "Product variant")}</div>
                <InventoryDeleteAction message={t("inventory.deleteVariantConfirm")} onConfirm={() => del(v.id)} mobile />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">{t("inventory.size")}</Label><Input defaultValue={v.size ?? ""} onBlur={(e) => update(v, { size: e.target.value || null })} /></div>
                <div><Label className="text-xs">{isAr ? "الوحدة" : "Unit"}</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" defaultValue={v.size_unit ?? ""} onChange={(e) => update(v, { size_unit: e.target.value || null })}>{SIZE_UNITS.map((u) => <option key={u} value={u}>{u || "—"}</option>)}</select></div>
                <div><Label className="text-xs">{t("inventory.color")}</Label><Input defaultValue={v.color ?? ""} onBlur={(e) => update(v, { color: e.target.value || null })} /></div>
                <div><Label className="text-xs">{t("inventory.fabric")}</Label><Input defaultValue={v.fabric ?? ""} onBlur={(e) => update(v, { fabric: e.target.value || null })} /></div>
                <div><Label className="text-xs">{t("inventory.sku")}</Label><Input defaultValue={v.sku ?? ""} onBlur={(e) => update(v, { sku: e.target.value || null })} /></div>
                <div><Label className="text-xs">{barcodeLabel}</Label><Input defaultValue={v.barcode ?? ""} onBlur={(e) => update(v, { barcode: e.target.value.trim() || null })} /></div>
                {canViewFinancials && <div><Label className="text-xs">{t("inventory.cost")}</Label><Input type="number" step="0.01" defaultValue={v.cost_price} onBlur={(e) => update(v, { cost_price: Number(e.target.value) })} /></div>}
                <div><Label className="text-xs">{t("inventory.price")}</Label><Input type="number" step="0.01" defaultValue={v.selling_price} onBlur={(e) => update(v, { selling_price: Number(e.target.value) })} /></div>
                <div><Label className="text-xs">{isAr ? "السعر قبل الخصم" : "Original price"}</Label><Input type="number" step="0.01" min="0" defaultValue={v.original_price ?? ""} onBlur={(e) => update(v, { original_price: e.target.value ? Number(e.target.value) : null })} /></div>
                <div><Label className="text-xs">{mainLabel}</Label><Input type="number" defaultValue={v.stock_main ?? 0} onBlur={(e) => update(v, { stock_main: Number(e.target.value) })} /></div>
                <div><Label className="text-xs">{incLabel}</Label><Input type="number" defaultValue={v.stock_incubator ?? 0} onBlur={(e) => update(v, { stock_incubator: Number(e.target.value) })} /></div>
              </div>
              <div className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2 text-sm">
                <span>{t("inventory.stock")}: <b>{(v.stock_main ?? 0) + (v.stock_incubator ?? 0)}</b></span>
                {(() => {
                  const stock = (v.stock_main ?? 0) + (v.stock_incubator ?? 0);
                  const qtySold = salesByVariant.get(v.id) || 0;
                  const variantCreatedAt = v.created_at ? new Date(v.created_at) : null;
                  const daysElapsed = variantCreatedAt 
                    ? Math.max(1, Math.min(45, Math.ceil((new Date().getTime() - variantCreatedAt.getTime()) / (1000 * 60 * 60 * 24))))
                    : 45;
                  const dailyVelocity = qtySold / daysElapsed;
                  
                  let runRateText = isAr ? "لا مبيعات مؤخراً" : "No recent sales";
                  let runRateColor = "text-muted-foreground";
                  
                  if (stock <= 0) {
                    runRateText = isAr ? "نفد المخزون" : "Out of stock";
                    runRateColor = "text-rose-600 dark:text-rose-500 font-medium";
                  } else if (dailyVelocity > 0) {
                    const days = Math.ceil(stock / dailyVelocity);
                    runRateText = isAr ? `ينفد خلال ${days} يوم` : `Out of stock in ${days} days`;
                    runRateColor = days <= 7 
                      ? "text-amber-600 dark:text-amber-500 font-semibold animate-pulse" 
                      : "text-emerald-600 dark:text-emerald-500 font-medium";
                  }
                  
                  return <span className={`text-xs ${runRateColor}`}>{runRateText}</span>;
                })()}
                {canViewFinancials && <span className="text-primary">{t("inventory.margin")}: {margin.toFixed(0)}%</span>}
              </div>
            </div>
          );
        })}
        {adding && (
          <div className="rounded-lg border border-primary/30 bg-secondary/30 p-3 space-y-3">
            <div className="font-medium">{t("inventory.addVariant")}</div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">{t("inventory.size")}</Label><Input value={row.size} onChange={(e) => setRow({ ...row, size: e.target.value })} /></div>
              <div><Label className="text-xs">{isAr ? "الوحدة" : "Unit"}</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={row.size_unit} onChange={(e) => setRow({ ...row, size_unit: e.target.value })}>{SIZE_UNITS.map((u) => <option key={u} value={u}>{u || "—"}</option>)}</select></div>
              <div><Label className="text-xs">{t("inventory.color")}</Label><Input value={row.color} onChange={(e) => setRow({ ...row, color: e.target.value })} /></div>
              <div><Label className="text-xs">{t("inventory.fabric")}</Label><Input value={row.fabric} onChange={(e) => setRow({ ...row, fabric: e.target.value })} /></div>
              <div><Label className="text-xs">{t("inventory.sku")}</Label><Input value={row.sku} onChange={(e) => setRow({ ...row, sku: e.target.value })} /></div>
              <div><Label className="text-xs">{barcodeLabel}</Label><Input value={row.barcode} onChange={(e) => setRow({ ...row, barcode: e.target.value })} /></div>
              {canViewFinancials && <div><Label className="text-xs">{t("inventory.cost")}</Label><Input type="number" step="0.01" value={row.cost_price} onChange={(e) => setRow({ ...row, cost_price: e.target.value })} /></div>}
              <div><Label className="text-xs">{t("inventory.price")}</Label><Input type="number" step="0.01" value={row.selling_price} onChange={(e) => setRow({ ...row, selling_price: e.target.value })} /></div>
              <div><Label className="text-xs">{isAr ? "السعر قبل الخصم" : "Original price"}</Label><Input type="number" step="0.01" min="0" value={row.original_price} onChange={(e) => setRow({ ...row, original_price: e.target.value })} /></div>
              <div><Label className="text-xs">{mainLabel}</Label><Input type="number" value={row.stock_main} onChange={(e) => setRow({ ...row, stock_main: e.target.value })} /></div>
              <div><Label className="text-xs">{incLabel}</Label><Input type="number" value={row.stock_incubator} onChange={(e) => setRow({ ...row, stock_incubator: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setAdding(false)}>{t("common.cancel")}</Button><Button onClick={add}>{t("common.save")}</Button></div>
          </div>
        )}
      </div>

      <div className="hidden w-full overflow-x-auto md:block">
        <table
          className="table-fixed text-sm"
          style={{ width: canViewFinancials ? 1482 : 1290, minWidth: canViewFinancials ? 1482 : 1290 }}
        >
          <colgroup>
            <col style={{ width: 150 }} />
            <col style={{ width: 96 }} />
            <col style={{ width: 96 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 190 }} />
            {canViewFinancials && <col style={{ width: 96 }} />}
            <col style={{ width: 104 }} />
            <col style={{ width: 112 }} />
            {canViewFinancials && <col style={{ width: 96 }} />}
            <col style={{ width: 88 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 88 }} />
            <col style={{ width: 142 }} />
          </colgroup>
          <thead>
            <tr className="text-start text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-2 py-2 text-start">{t("inventory.size")}</th>
              <th className="px-2 py-2 text-start">{t("inventory.color")}</th>
              <th className="px-2 py-2 text-start">{t("inventory.fabric")}</th>
              <th className="px-2 py-2 text-start">{t("inventory.sku")}</th>
              <th className="px-2 py-2 text-start">{barcodeLabel}</th>
              {canViewFinancials && <th className="min-w-24 whitespace-nowrap px-2 py-2 text-center">{t("inventory.cost")}</th>}
              <th className="min-w-24 whitespace-nowrap px-2 py-2 text-center">{t("inventory.price")}</th>
              <th className="min-w-28 whitespace-nowrap px-2 py-2 text-center">{isAr ? "قبل الخصم" : "Original"}</th>
              {canViewFinancials && <th className="min-w-24 whitespace-nowrap px-2 py-2 text-center">{t("inventory.margin")}</th>}
              <th className="min-w-22 whitespace-nowrap px-2 py-2 text-center">{mainLabel}</th>
              <th className="min-w-28 whitespace-nowrap px-2 py-2 text-center">{incLabel}</th>
              <th className="min-w-22 whitespace-nowrap px-2 py-2 text-center">{t("inventory.stock")}</th>
              <th aria-label={isAr ? "الإجراءات" : "Actions"}></th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => {
              const margin = v.selling_price > 0 ? ((v.selling_price - v.cost_price) / v.selling_price) * 100 : 0;
              return (
                <tr key={v.id} className="border-t border-border">
                  <td className="px-2 py-2 text-start">
                    <div className="inline-flex items-center gap-1">
                      <input className="bg-transparent w-16 outline-none text-start" defaultValue={v.size ?? ""} onBlur={(e) => update(v, { size: e.target.value || null })} />
                      <select
                        className="h-7 rounded border border-input bg-background px-1 text-xs"
                        defaultValue={v.size_unit ?? ""}
                        onChange={(e) => update(v, { size_unit: e.target.value || null })}
                        title={isAr ? "الوحدة (اختياري)" : "Unit (optional)"}
                      >
                        {SIZE_UNITS.map((u) => (
                          <option key={u} value={u}>{u === "" ? (isAr ? "بدون" : "—") : u}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-start"><input className="w-full bg-transparent outline-none text-start" defaultValue={v.color ?? ""} onBlur={(e) => update(v, { color: e.target.value || null })} /></td>
                  <td className="px-2 py-2 text-start"><input className="w-full bg-transparent outline-none text-start" defaultValue={v.fabric ?? ""} onBlur={(e) => update(v, { fabric: e.target.value || null })} /></td>
                  <td className="px-2 py-2 text-start"><input className="w-full bg-transparent outline-none text-start" defaultValue={v.sku ?? ""} onBlur={(e) => update(v, { sku: e.target.value || null })} /></td>
                  <td className="px-2 py-2 text-start">
                      <div className="flex min-w-0 items-center gap-1">
                        <input
                          className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none text-start"
                          placeholder={isAr ? "بدون" : "None"}
                          defaultValue={v.barcode ?? ""}
                          onBlur={(e) => update(v, { barcode: e.target.value.trim() || null })}
                        />
                        <button
                          type="button"
                          title={isAr ? "توليد باركود" : "Generate barcode"}
                          className="text-muted-foreground hover:text-primary"
                          onClick={() => update(v, { barcode: genBarcode() })}
                        >
                          <Wand2 className="h-3 w-3" />
                        </button>
                        {v.barcode && (
                          <PrintLabelButton
                            label={isAr ? "طباعة" : "Print"}
                            data={{
                              code: v.barcode,
                              productName,
                              size: v.size,
                              color: v.color,
                              price: v.selling_price,
                              businessName,
                            }}
                          />
                        )}
                      </div>
                  </td>
                  {canViewFinancials && <td className="px-2 py-2 text-center"><input type="number" step="0.01" className="w-full bg-transparent text-center outline-none" defaultValue={v.cost_price} onBlur={(e) => update(v, { cost_price: Number(e.target.value) })} /></td>}
                  <td className="px-2 py-2 text-center"><input type="number" step="0.01" className="w-full bg-transparent text-center outline-none" defaultValue={v.selling_price} onBlur={(e) => update(v, { selling_price: Number(e.target.value) })} /></td>
                  <td className="px-2 py-2 text-center"><input type="number" step="0.01" min="0" className="w-full bg-transparent text-center outline-none" defaultValue={v.original_price ?? ""} placeholder="—" onBlur={(e) => update(v, { original_price: e.target.value ? Number(e.target.value) : null })} /></td>
                  {canViewFinancials && <td className="px-2 py-2 text-center text-primary"><span className="inline-flex items-center justify-center gap-1"><TrendingUp className="h-3 w-3" />{margin.toFixed(0)}%</span></td>}
                  <td className="px-2 py-2 text-center"><input type="number" className="w-full bg-transparent text-center outline-none" defaultValue={v.stock_main ?? 0} onBlur={(e) => update(v, { stock_main: Number(e.target.value) })} /></td>
                  <td className="px-2 py-2 text-center"><input type="number" className="w-full bg-transparent text-center outline-none" defaultValue={v.stock_incubator ?? 0} onBlur={(e) => update(v, { stock_incubator: Number(e.target.value) })} /></td>
                  <td className="px-2 py-2 text-center">
                    <div className="font-medium text-sm">{(v.stock_main ?? 0) + (v.stock_incubator ?? 0)}</div>
                    {(() => {
                      const stock = (v.stock_main ?? 0) + (v.stock_incubator ?? 0);
                      const qtySold = salesByVariant.get(v.id) || 0;
                      const variantCreatedAt = v.created_at ? new Date(v.created_at) : null;
                      const daysElapsed = variantCreatedAt 
                        ? Math.max(1, Math.min(45, Math.ceil((new Date().getTime() - variantCreatedAt.getTime()) / (1000 * 60 * 60 * 24))))
                        : 45;
                      const dailyVelocity = qtySold / daysElapsed;
                      
                      let runRateText = isAr ? "لا مبيعات" : "No sales";
                      let runRateColor = "text-muted-foreground/80";
                      
                      if (stock <= 0) {
                        runRateText = isAr ? "نفد" : "Out of stock";
                        runRateColor = "text-rose-600 dark:text-rose-400 font-medium";
                      } else if (dailyVelocity > 0) {
                        const days = Math.ceil(stock / dailyVelocity);
                        runRateText = isAr ? `ينفد في ${days} ي` : `${days} d left`;
                        runRateColor = days <= 7 
                          ? "text-amber-600 dark:text-amber-400 font-semibold" 
                          : "text-emerald-600 dark:text-emerald-400";
                      }
                      
                      return <div className={`text-[10px] mt-0.5 whitespace-nowrap leading-none ${runRateColor}`}>{runRateText}</div>;
                    })()}
                  </td>
                  <td className="px-2 text-center"><InventoryDeleteAction message={t("inventory.deleteVariantConfirm")} onConfirm={() => del(v.id)} /></td>
                </tr>
              );
            })}
            {adding && (
              <tr className="border-t border-border bg-secondary/40">
                <td className="px-2 py-2">
                  <div className="inline-flex items-center gap-1">
                    <Input className="h-8 w-16 text-start" value={row.size} onChange={(e) => setRow({ ...row, size: e.target.value })} />
                    <select
                      className="h-8 rounded border border-input bg-background px-1 text-xs"
                      value={row.size_unit}
                      onChange={(e) => setRow({ ...row, size_unit: e.target.value })}
                    >
                      {SIZE_UNITS.map((u) => (
                        <option key={u} value={u}>{u === "" ? (isAr ? "بدون" : "—") : u}</option>
                      ))}
                    </select>
                  </div>
                </td>
                <td className="px-2 py-2"><Input className="h-8 w-full text-start" value={row.color} onChange={(e) => setRow({ ...row, color: e.target.value })} /></td>
                <td className="px-2 py-2"><Input className="h-8 w-full text-start" value={row.fabric} onChange={(e) => setRow({ ...row, fabric: e.target.value })} /></td>
                <td className="px-2 py-2"><Input className="h-8 w-full text-start" value={row.sku} onChange={(e) => setRow({ ...row, sku: e.target.value })} /></td>
                <td className="px-2 py-2">
                  <div className="inline-flex items-center gap-1">
                    <Input className="h-8 min-w-0 flex-1 text-start font-mono text-xs" value={row.barcode} onChange={(e) => setRow({ ...row, barcode: e.target.value })} placeholder={isAr ? "اختياري" : "Optional"} />
                    <button type="button" className="text-muted-foreground hover:text-primary" onClick={() => setRow({ ...row, barcode: genBarcode() })}>
                      <Wand2 className="h-3 w-3" />
                    </button>
                  </div>
                </td>
                {canViewFinancials && <td className="px-2 py-2"><Input className="h-8 w-full text-center" type="number" step="0.01" value={row.cost_price} onChange={(e) => setRow({ ...row, cost_price: e.target.value })} /></td>}
                <td className="px-2 py-2"><Input className="h-8 w-full text-center" type="number" step="0.01" value={row.selling_price} onChange={(e) => setRow({ ...row, selling_price: e.target.value })} /></td>
                <td className="px-2 py-2"><Input className="h-8 w-full text-center" type="number" step="0.01" min="0" value={row.original_price} placeholder="—" onChange={(e) => setRow({ ...row, original_price: e.target.value })} /></td>
                {canViewFinancials && <td></td>}
                <td className="px-2 py-2"><Input className="h-8 w-full text-center" type="number" value={row.stock_main} onChange={(e) => setRow({ ...row, stock_main: e.target.value })} /></td>
                <td className="px-2 py-2"><Input className="h-8 w-full text-center" type="number" value={row.stock_incubator} onChange={(e) => setRow({ ...row, stock_incubator: e.target.value })} /></td>
                <td></td>
                <td className="px-2 py-2"><div className="flex justify-center gap-1"><Button size="sm" onClick={add}>{t("common.save")}</Button><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>×</Button></div></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {!adding && (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3 me-1" /> {t("inventory.addVariant")}
          </Button>
        )}
        <BulkVariantDialog productId={productId} variants={variants} canViewFinancials={canViewFinancials} onChanged={onChanged} />
      </div>
    </div>
  );
}

function CustomizationsSection({ brandId, items, onChanged }: { brandId: string; items: Customization[]; onChanged: () => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");

  const add = async () => {
    if (!name.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await (supabase.from("customization_options") as any).insert({
      user_id: user.id,
      brand_id: brandId,
      name,
      price_delta: Number(price),
    });
    if (error) toast.error(error.message);
    else { setName(""); setPrice("0"); onChanged(); }
  };
  const del = async (id: string) => {
    const { error } = await supabase.from("customization_options").delete().eq("id", id);
    if (error) toast.error(error.message); else onChanged();
  };

  return (
    <Card className="p-6">
      <p className="text-sm text-muted-foreground mb-4">{t("inventory.addonsIntro")}</p>
      <div className="flex gap-2 mb-4">
        <Input placeholder={t("inventory.addonName")} value={name} onChange={(e) => setName(e.target.value)} />
        <Input type="number" step="0.01" className="w-32" placeholder={t("inventory.addonPrice")} value={price} onChange={(e) => setPrice(e.target.value)} />
        <Button onClick={add}><Plus className="h-4 w-4" /></Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("inventory.noAddons")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((i) => (
            <li key={i.id} className="py-3 flex justify-between items-center">
              <div>
                <p className="font-medium">{i.name}</p>
                <p className="text-xs text-muted-foreground">+ {formatMoney(Number(i.price_delta))}</p>
              </div>
              <InventoryDeleteAction message={t("common.confirmDelete")} onConfirm={() => del(i.id)} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

