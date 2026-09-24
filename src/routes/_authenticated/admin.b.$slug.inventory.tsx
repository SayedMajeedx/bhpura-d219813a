import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  AlertTriangle,
  ChevronDown,
  Sparkles,
  Loader2,
  RefreshCw,
  FileText,
  Image as ImageIcon,
  Sliders,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useT, useI18n } from "@/lib/i18n";
import { ActivityLogList } from "@/components/activity-log-list";
import { useBrand } from "@/lib/brand-context";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { queryKeys } from "@/lib/query-keys";
import { Switch } from "@/components/ui/switch";
import { ImageCropperDialog } from "@/components/image-cropper-dialog";
import { BilingualField } from "@/components/bilingual-field";
import { deletePublicMediaUrl, uploadPublicMedia } from "@/lib/r2-upload";
import { VIDEO_PRESETS, type OptimizedVideoResult } from "@/lib/video-optimizer";
import { VideoOptimizerDialog } from "@/components/admin/video/VideoOptimizerDialog";
import { PLACEHOLDER_SIZE_VALUES } from "@/lib/variant-sku-utils";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { OptimizedVideo, ResponsiveImage } from "@/components/responsive-media";
import { InventoryCommandHeader } from "@/components/inventory/InventoryCommandHeader";
import { PackagingMaterialsTab } from "@/components/inventory/PackagingMaterialsTab";

import { RoutePendingSkeleton } from "@/components/os/route-pending-skeleton";
import { OsEmptyState } from "@/components/os/os-empty-state";
import { useEntitlements } from "@/lib/saas-billing/use-entitlements";
import { CUSTOMIZER_PRESETS } from "@/lib/addons/addon-presets";
import {
  variantAxisDefaultsFrom,
  resolveVariantAxis,
  customFieldPresetsFrom,
} from "@/lib/addons/addon-registry";
import { useAddons } from "@/components/addons/AddonsProvider";
import type {
  MediaItem,
  CustomField,
  Product,
  Variant,
  Customization,
} from "@/features/inventory/types";
import { prefetchOptionTranslations } from "@/features/inventory/lib/option-translations";
import { CustomizationsSection } from "@/features/inventory/components/CustomizationsSection";

import { ProductsSection } from "@/features/inventory/components/ProductsSection";
type InventorySearch = {
  filter?: string;
  scope?: string;
  action?: string;
};

export const Route = createFileRoute("/_authenticated/admin/b/$slug/inventory")({
  validateSearch: (search: Record<string, unknown>): InventorySearch => {
    const result: InventorySearch = {};
    if (typeof search.filter === "string") result.filter = search.filter;
    if (typeof search.scope === "string") result.scope = search.scope;
    if (typeof search.action === "string") result.action = search.action;
    return result;
  },
  component: Inventory,
});

function Inventory() {
  const searchParams = Route.useSearch();
  const t = useT();
  const { lang } = useI18n();
  const qc = useQueryClient();
  const brand = useBrand();
  const brandId = brand.id;
  useEntitlements({ brandId });
  const [tab, setTab] = useState<"products" | "customizations" | "packaging">("products");

  useState<string | null>(null);

  useRealtimeInvalidate(
    [
      { table: "products", brandId, queryKey: queryKeys.products.all(brandId) },
      { table: "product_variants", brandId, queryKey: queryKeys.variants.all(brandId) },
      { table: "customization_options", brandId, queryKey: queryKeys.customizations.all(brandId) },
    ],
    `inventory-${brandId}`,
  );

  const products = useQuery({
    queryKey: queryKeys.products.all(brandId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        ...p,
        media: Array.isArray(p.media) ? p.media : [],
        custom_fields: Array.isArray(p.custom_fields) ? p.custom_fields : [],
      })) as Product[];
    },
  });

  const variants = useQuery({
    queryKey: queryKeys.variants.all(brandId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("*")
        .eq("brand_id", brandId)
        .order("created_at");
      if (error) throw error;
      return data as unknown as Variant[];
    },
  });

  const customizations = useQuery({
    queryKey: queryKeys.customizations.all(brandId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customization_options")
        .select("*")
        .eq("brand_id", brandId)
        .order("name");
      if (error) throw error;
      return data as Customization[];
    },
  });

  const backInStockRequests = useQuery({
    queryKey: ["admin", brandId, "back-in-stock-count"],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("back_in_stock_requests")
        .select("*", { count: "exact", head: true })
        .eq("brand_id", brandId)
        .is("notified_at", null);
      if (error) return 0;
      return count ?? 0;
    },
  });

  const businessName = useQuery({
    queryKey: ["business-name", brandId],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data } = await supabase
        .from("business_settings")
        .select("business_name, currency")
        .eq("brand_id", brandId)
        .maybeSingle();
      return data ?? null;
    },
  });

  const salesHistory = useQuery({
    queryKey: ["inventory-sales-past45", brandId],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
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

  if (!brandId) {
    return <RoutePendingSkeleton />;
  }

  if (products.isLoading || variants.isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-1 sm:p-2 animate-fade-in">
        <InventoryCommandHeader
          lang={lang === "ar" ? "ar" : "en"}
          productCount={0}
          isCourier={false}
          onCreateNew={() => {}}
        />
        <RoutePendingSkeleton />
      </div>
    );
  }

  if (products.isError || variants.isError) {
    return (
      <OsEmptyState
        icon={AlertTriangle}
        title={lang === "ar" ? "تعذّر تحميل المخزون" : "Inventory could not be loaded"}
        description={
          lang === "ar"
            ? "لم يتم تغيير أي منتجات أو كميات. تحقق من الاتصال ثم أعد المحاولة."
            : "No products or quantities were changed. Check the connection and try again."
        }
        action={
          <Button
            type="button"
            variant="outline"
            onClick={() => void Promise.all([products.refetch(), variants.refetch()])}
          >
            <RefreshCw className="h-4 w-4 me-1.5" />
            {lang === "ar" ? "إعادة المحاولة" : "Try again"}
          </Button>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-1 sm:p-2 animate-fade-in">
      <div className="flex p-1.5 gap-1.5 bg-muted rounded-xl border border-border-subtle max-w-lg">
        <button
          className={`flex-1 rounded-lg py-2 px-3 text-sm font-semibold transition-all duration-200 ${tab === "products" ? "bg-background shadow-md text-foreground" : "text-muted-foreground hover:bg-background/20"}`}
          onClick={() => setTab("products")}
        >
          {t("inventory.products")}
        </button>
        <button
          className={`flex-1 rounded-lg py-2 px-3 text-sm font-semibold transition-all duration-200 ${tab === "customizations" ? "bg-background shadow-md text-foreground" : "text-muted-foreground hover:bg-background/20"}`}
          onClick={() => setTab("customizations")}
        >
          {t("inventory.customizations")}
        </button>
        <button
          className={`flex-1 rounded-lg py-2 px-3 text-sm font-semibold transition-all duration-200 ${tab === "packaging" ? "bg-background shadow-md text-foreground" : "text-muted-foreground hover:bg-background/20"}`}
          onClick={() => setTab("packaging")}
        >
          {lang === "ar" ? "مواد التغليف" : "Packaging materials"}
        </button>
      </div>

      {tab === "products" ? (
        <ProductsSection
          initialFilter={searchParams.scope || searchParams.filter}
          initialAction={searchParams.action}
          products={products.data ?? []}
          variants={variants.data ?? []}
          pendingNotifyCount={backInStockRequests.data ?? 0}
          businessName={businessName.data?.business_name ?? null}
          currency={businessName.data?.currency ?? "BHD"}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: queryKeys.products.all(brandId) });
            qc.invalidateQueries({ queryKey: queryKeys.variants.all(brandId) });
          }}
          salesHistory={salesHistory.data ?? []}
          ProductDialog={ProductDialog}
        />
      ) : tab === "packaging" ? (
        <PackagingMaterialsTab />
      ) : (
        <CustomizationsSection
          brandId={brandId}
          items={customizations.data ?? []}
          products={products.data ?? []}
          onChanged={() =>
            qc.invalidateQueries({ queryKey: queryKeys.customizations.all(brandId) })
          }
        />
      )}

      <div className="mt-8">
        <ActivityLogList scope="inventory" brandId={brandId} />
      </div>
    </div>
  );
}

function cleanPassportCustomFields(fields: CustomField[]) {
  return fields;
}

function ProductDialog({
  product,
  onSaved,
}: {
  product: Product | null;
  onSaved: (newProductId?: string) => void;
}) {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const { profile: storeProfile } = useAdminStoreProfile(brand.id);
  const { addons } = useAddons();
  const addonAxisDefaults = useMemo(
    () => variantAxisDefaultsFrom(addons.length > 0 ? addons : storeProfile?.addons),
    [addons, storeProfile?.addons],
  );
  const customFieldPresets = useMemo(() => {
    const fromAddons = customFieldPresetsFrom(addons.length > 0 ? addons : storeProfile?.addons);
    if (fromAddons.length > 0) return fromAddons;
    return Object.entries(CUSTOMIZER_PRESETS).map(([k, p]) => ({
      key: k,
      label: { ar: p.label_ar, en: p.label_en },
      fields: p.fields,
    }));
  }, [addons, storeProfile?.addons]);
  const { entitlements } = useEntitlements({ brandId: brand.id });
  const initialForm = {
    name_ar: product?.name_ar ?? "",
    name_en: product?.name_en ?? product?.name ?? "",
    description_ar: product?.description_ar ?? "",
    description_en: product?.description_en ?? product?.description ?? "",
    category: product?.category ?? "",
    base_price: product?.base_price ? String(product.base_price) : "0",
    cost_price: product?.cost_price ? String(product.cost_price) : "0",
    image_url: product?.image_url ?? "",
    is_active: product ? product.is_active : true,
    initial_stock: "0",
    featured_trending: product?.featured_trending ?? false,
    show_sale_badge: product?.show_sale_badge ?? true,
    media: (product?.media ?? []) as MediaItem[],
    custom_fields: (Array.isArray(product?.custom_fields)
      ? product!.custom_fields
      : []) as CustomField[],
    variant_label_size_ar: product?.variant_label_size_ar ?? "",
    variant_label_size_en: product?.variant_label_size_en ?? "",
    variant_label_color_ar: product?.variant_label_color_ar ?? "",
    variant_label_color_en: product?.variant_label_color_en ?? "",
    variant_label_fabric_ar: product?.variant_label_fabric_ar ?? "",
    variant_label_fabric_en: product?.variant_label_fabric_en ?? "",
    variant_label_four_ar: product?.variant_label_four_ar ?? "",
    variant_label_four_en: product?.variant_label_four_en ?? "",
    variant_label_five_ar: product?.variant_label_five_ar ?? "",
    variant_label_five_en: product?.variant_label_five_en ?? "",
    fabric_type: (product as any)?.fabric_type ?? "",
    occasion: (product as any)?.occasion ?? "",
    size_guide_id: product?.size_guide_id ?? null,
    size_guide_hidden: product?.size_guide_hidden ?? false,
    is_made_to_order: product?.is_made_to_order ?? false,
  };
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<{ name?: string; price?: string; cost?: string }>({});
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingVideo, setPendingVideo] = useState<File | null>(null);
  const uncommittedUploads = useRef(new Set<string>());
  const removedCommittedMedia = useRef(new Set<string>());

  // Stepper state: 'basic' | 'media' | 'customizer'
  const [activeDialogTab, setActiveDialogTab] = useState<"basic" | "media" | "customizer">("basic");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showExtraAxes, setShowExtraAxes] = useState(false);

  useEffect(
    () => () => {
      for (const url of uncommittedUploads.current) {
        void deletePublicMediaUrl(brand.id, url).catch(() => undefined);
      }
      uncommittedUploads.current.clear();
      removedCommittedMedia.current.clear();
    },
    [brand.id],
  );

  useEffect(() => {
    setForm({
      name_ar: product?.name_ar ?? "",
      name_en: product?.name_en ?? product?.name ?? "",
      description_ar: product?.description_ar ?? "",
      description_en: product?.description_en ?? product?.description ?? "",
      category: product?.category ?? "",
      base_price: product?.base_price ? String(product.base_price) : "0",
      cost_price: product?.cost_price ? String(product.cost_price) : "0",
      image_url: product?.image_url ?? "",
      is_active: product ? product.is_active : true,
      initial_stock: "0",
      featured_trending: product?.featured_trending ?? false,
      show_sale_badge: product?.show_sale_badge ?? true,
      media: (product?.media ?? []) as MediaItem[],
      custom_fields: (Array.isArray(product?.custom_fields)
        ? product!.custom_fields
        : []) as CustomField[],
      variant_label_size_ar: product?.variant_label_size_ar ?? "",
      variant_label_size_en: product?.variant_label_size_en ?? "",
      variant_label_color_ar: product?.variant_label_color_ar ?? "",
      variant_label_color_en: product?.variant_label_color_en ?? "",
      variant_label_fabric_ar: product?.variant_label_fabric_ar ?? "",
      variant_label_fabric_en: product?.variant_label_fabric_en ?? "",
      variant_label_four_ar: product?.variant_label_four_ar ?? "",
      variant_label_four_en: product?.variant_label_four_en ?? "",
      variant_label_five_ar: product?.variant_label_five_ar ?? "",
      variant_label_five_en: product?.variant_label_five_en ?? "",
      fabric_type: (product as any)?.fabric_type ?? "",
      occasion: (product as any)?.occasion ?? "",
      size_guide_id: product?.size_guide_id ?? null,
      size_guide_hidden: product?.size_guide_hidden ?? false,
      is_made_to_order: product?.is_made_to_order ?? false,
    });
    setErrors({});
    setActiveDialogTab("basic");
    setShowExtraAxes(
      Boolean(
        product?.variant_label_four_ar ||
        product?.variant_label_four_en ||
        product?.variant_label_five_ar ||
        product?.variant_label_five_en,
      ),
    );
  }, [product]);

  const categoriesQ = useQuery({
    queryKey: ["categories", brand.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from("categories") as any)
        .select("id, name_en, name_ar, slug")
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        name_en: string;
        name_ar: string | null;
        slug: string | null;
      }>;
    },
  });

  const sizeGuidesQ = useQuery({
    queryKey: ["admin-size-guides-list", brand.id],
    enabled: Boolean(storeProfile?.modules?.size_guide),
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("size_guides")
        .select("id, name_ar, name_en, is_default")
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      return (data ?? []) as Array<{
        id: string;
        name_ar: string;
        name_en: string;
        is_default: boolean;
      }>;
    },
  });

  const uploadBlob = async (blob: Blob, _ext: string, kind: "image" | "video") => {
    try {
      setUploading(true);
      const mediaBlob = blob.type
        ? blob
        : new Blob([blob], { type: kind === "image" ? "image/jpeg" : "video/mp4" });
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

  const handleFilePicked = async (file: File) => {
    if (file.type.startsWith("video") || /\.(mp4|webm|mov|m4v)$/i.test(file.name)) {
      setPendingVideo(file);
      return;
    }
    setPendingImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setCropSrc(String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleConfirmProductVideo = async (result: OptimizedVideoResult) => {
    try {
      setUploading(true);
      const [videoUrl, posterUrl] = await Promise.all([
        uploadPublicMedia(brand.id, result.file, "product"),
        result.posterBlob && result.posterBlob.size > 0
          ? uploadPublicMedia(brand.id, result.posterBlob, "product")
          : Promise.resolve(null),
      ]);
      uncommittedUploads.current.add(videoUrl);
      if (posterUrl) uncommittedUploads.current.add(posterUrl);
      setForm((f) => ({
        ...f,
        media: [
          ...f.media,
          { type: "video", url: videoUrl, ...(posterUrl ? { poster_url: posterUrl } : {}) },
        ],
      }));
      const presetLabel = isAr
        ? VIDEO_PRESETS[result.preset].labelAr
        : VIDEO_PRESETS[result.preset].labelEn;
      if (result.wasCompressed) {
        toast.success(
          isAr
            ? `تم تحسين ورفع الفيديو بنجاح (${presetLabel} — وفّر ${result.savingsPercent}%)`
            : `Video optimized & uploaded (${presetLabel} — -${result.savingsPercent}%)`,
        );
      } else {
        toast.success(
          isAr
            ? `تم رفع الفيديو بنجاح (${presetLabel})`
            : `Video uploaded successfully (${presetLabel})`,
        );
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      setPendingVideo(null);
    }
  };

  const handleCropConfirmed = async (blob: Blob) => {
    await uploadBlob(blob, "jpg", "image");
    setCropSrc(null);
    setPendingImageFile(null);
  };

  const handleSkipCrop = async () => {
    if (pendingImageFile) {
      const ext = pendingImageFile.name.split(".").pop() ?? "jpg";
      await uploadBlob(pendingImageFile, ext, "image");
      setCropSrc(null);
      setPendingImageFile(null);
    }
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

  const moveMedia = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= form.media.length) return;
    const next = [...form.media];
    const temp = next[index];
    next[index] = next[target];
    next[target] = temp;
    setForm((current) => ({ ...current, media: next }));
  };

  const save = async (e: React.MouseEvent) => {
    e.preventDefault();
    const nameAr = form.name_ar.trim();
    const nameEn = form.name_en.trim();
    const basePrice = form.base_price.trim();

    const newErrors: { name?: string; price?: string; cost?: string } = {};

    if (!nameAr && !nameEn) {
      newErrors.name = isAr
        ? "يجب إدخال اسم المنتج (بالعربية أو الإنجليزية)"
        : "Product name is required (Arabic or English)";
    }

    if (!basePrice || isNaN(Number(basePrice)) || Number(basePrice) < 0) {
      newErrors.price = isAr
        ? "يجب إدخال سعر صحيح أكبر من أو يساوي الصفر"
        : "A valid price greater than or equal to 0 is required";
    }
    if (form.cost_price.trim() && (isNaN(Number(form.cost_price)) || Number(form.cost_price) < 0)) {
      newErrors.cost = isAr
        ? "أدخل تكلفة صحيحة غير سالبة أو اترك الحقل فارغاً"
        : "Enter a valid non-negative cost or leave empty";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setActiveDialogTab("basic");
      return;
    }

    setErrors({});
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const legacyName = nameEn || nameAr;
    const legacyDesc = form.description_en.trim() || form.description_ar.trim() || null;
    let createdProductId: string | undefined;

    const primaryMediaImage = form.media.find((m) => m.type === "image" || !m.type)?.url;
    const effectiveImageUrl =
      primaryMediaImage || (form.image_url.trim() ? form.image_url.trim() : null);

    if (product) {
      if (form.is_active) {
        const { count, error: variantCountError } = await supabase
          .from("product_variants")
          .select("id", { count: "exact", head: true })
          .eq("product_id", product.id);
        if (variantCountError) return toast.error(variantCountError.message);
        if (!count) {
          // Smart default: Automatically create a standard default variant so merchant isn't blocked
          const initialQty = Math.max(0, parseInt(form.initial_stock || "0", 10) || 0);
          const baseP = form.base_price ? Number(form.base_price) : 0;
          const costP = form.cost_price ? Number(form.cost_price) : 0;
          await (supabase.from("product_variants") as any).insert({
            user_id: user.id,
            brand_id: brand.id,
            product_id: product.id,
            size: isAr ? PLACEHOLDER_SIZE_VALUES[0] : PLACEHOLDER_SIZE_VALUES[1],
            color: null,
            fabric: (form.fabric_type || "").trim() || null,
            cost_price: costP,
            selling_price: baseP,
            stock_main: initialQty,
            stock_incubator: 0,
            stock: initialQty,
            sku: null,
            barcode: null,
            image_url: effectiveImageUrl || null,
          });
        }
      }
      const patch = {
        name: legacyName,
        name_ar: nameAr || null,
        name_en: nameEn || null,
        description: legacyDesc,
        description_ar: form.description_ar.trim() || null,
        description_en: form.description_en.trim() || null,
        category: form.category && form.category.trim() !== "" ? form.category.trim() : null,
        base_price: form.base_price ? Number(form.base_price) : 0,
        cost_price: form.cost_price ? Number(form.cost_price) : 0,
        image_url: effectiveImageUrl,
        is_active: form.is_active,
        featured_trending: form.featured_trending,
        show_sale_badge: form.show_sale_badge,
        media: form.media as any,
        custom_fields: cleanPassportCustomFields(form.custom_fields ?? []) as any,
        variant_label_size_ar: (form.variant_label_size_ar || "").trim() || null,
        variant_label_size_en: (form.variant_label_size_en || "").trim() || null,
        variant_label_color_ar: (form.variant_label_color_ar || "").trim() || null,
        variant_label_color_en: (form.variant_label_color_en || "").trim() || null,
        variant_label_fabric_ar: (form.variant_label_fabric_ar || "").trim() || null,
        variant_label_fabric_en: (form.variant_label_fabric_en || "").trim() || null,
        variant_label_four_ar: (form.variant_label_four_ar || "").trim() || null,
        variant_label_four_en: (form.variant_label_four_en || "").trim() || null,
        variant_label_five_ar: (form.variant_label_five_ar || "").trim() || null,
        variant_label_five_en: (form.variant_label_five_en || "").trim() || null,
        fabric_type: (form.fabric_type || "").trim() || null,
        occasion: (form.occasion || "").trim() || null,
        size_guide_id: form.size_guide_hidden ? null : form.size_guide_id || null,
        size_guide_hidden: Boolean(form.size_guide_hidden),
        is_made_to_order: Boolean(form.is_made_to_order),
      };
      const { error } = await (supabase as any).from("products").update(patch).eq("id", product.id);
      if (error) return toast.error(error.message);
      const { error: variantDefaultsError } = await (supabase.from("product_variants") as any)
        .update({ cost_price: patch.cost_price })
        .eq("product_id", product.id);
      if (variantDefaultsError) return toast.error(variantDefaultsError.message);
      const { error: inheritedPriceError } = await (supabase.from("product_variants") as any)
        .update({ selling_price: patch.base_price, original_price: null })
        .eq("product_id", product.id)
        .is("original_price", null);
      if (inheritedPriceError) return toast.error(inheritedPriceError.message);
      const { error: saleOriginalError } = await (supabase.from("product_variants") as any)
        .update({ original_price: patch.base_price })
        .eq("product_id", product.id)
        .not("original_price", "is", null);
      if (saleOriginalError) return toast.error(saleOriginalError.message);
    } else {
      const productLimit = entitlements?.limits?.["products.limit"];
      const isUnlimited = productLimit === -1;
      if (!isUnlimited && typeof productLimit === "number" && productLimit > 0) {
        const { count: currentProductCount } = await supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", brand.id);

        if ((currentProductCount || 0) >= productLimit) {
          return toast.error(
            isAr
              ? `لقد بلغت الحد الأقصى للمنتجات المسموح بها في باقتك (${productLimit} منتج). يرجى ترقية باقتك لإضافة المزيد.`
              : `You have reached the products limit for your plan (${productLimit} products). Please upgrade your plan to add more.`,
          );
        }
      }

      const payload = {
        user_id: user.id,
        brand_id: brand.id,
        name: legacyName,
        name_ar: nameAr || null,
        name_en: nameEn || null,
        description: legacyDesc,
        description_ar: form.description_ar.trim() || null,
        description_en: form.description_en.trim() || null,
        category: form.category && form.category.trim() !== "" ? form.category.trim() : null,
        base_price: form.base_price ? Number(form.base_price) : 0,
        // TODO (Tech Debt / Financial Reporting): Currently defaults to 0 due to database NOT NULL constraint.
        // In a future migration, alter column to nullable to distinguish between 'unknown cost' (null) and 'zero cost' (0),
        // preventing false 100% gross profit margins on financial reports/expenses screens.
        cost_price: form.cost_price ? Number(form.cost_price) : 0,
        image_url: effectiveImageUrl,
        is_active: form.is_active,
        featured_trending: form.featured_trending,
        show_sale_badge: form.show_sale_badge,
        media: form.media as any,
        custom_fields: cleanPassportCustomFields(form.custom_fields ?? []) as any,
        variant_label_size_ar: (form.variant_label_size_ar || "").trim() || null,
        variant_label_size_en: (form.variant_label_size_en || "").trim() || null,
        variant_label_color_ar: (form.variant_label_color_ar || "").trim() || null,
        variant_label_color_en: (form.variant_label_color_en || "").trim() || null,
        variant_label_fabric_ar: (form.variant_label_fabric_ar || "").trim() || null,
        variant_label_fabric_en: (form.variant_label_fabric_en || "").trim() || null,
        variant_label_four_ar: (form.variant_label_four_ar || "").trim() || null,
        variant_label_four_en: (form.variant_label_four_en || "").trim() || null,
        variant_label_five_ar: (form.variant_label_five_ar || "").trim() || null,
        variant_label_five_en: (form.variant_label_five_en || "").trim() || null,
        fabric_type: (form.fabric_type || "").trim() || null,
        occasion: (form.occasion || "").trim() || null,
        size_guide_id: form.size_guide_hidden ? null : form.size_guide_id || null,
        size_guide_hidden: Boolean(form.size_guide_hidden),
        is_made_to_order: Boolean(form.is_made_to_order),
      };
      const { data: newProd, error } = await (supabase.from("products") as any)
        .insert(payload)
        .select("id")
        .single();
      if (error) return toast.error(error.message);

      createdProductId = newProd?.id;
      // Auto-create default standard variant for instant purchaseability
      if (newProd?.id) {
        const initialQty = Math.max(0, parseInt(form.initial_stock || "0", 10) || 0);
        const baseP = form.base_price ? Number(form.base_price) : 0;
        const costP = form.cost_price ? Number(form.cost_price) : 0;
        await (supabase.from("product_variants") as any).insert({
          user_id: user.id,
          brand_id: brand.id,
          product_id: newProd.id,
          size: isAr ? PLACEHOLDER_SIZE_VALUES[0] : PLACEHOLDER_SIZE_VALUES[1],
          color: null,
          fabric: (form.fabric_type || "").trim() || null,
          cost_price: costP,
          selling_price: baseP,
          stock_main: initialQty,
          stock_incubator: 0,
          stock: initialQty,
          sku: null,
          barcode: null,
          image_url: effectiveImageUrl || null,
        });
        prefetchOptionTranslations([form.fabric_type], isAr);
      }
    }
    for (const url of removedCommittedMedia.current) {
      void deletePublicMediaUrl(brand.id, url).catch(() => undefined);
    }
    removedCommittedMedia.current.clear();
    uncommittedUploads.current.clear();
    if (product) {
      toast.success(t("common.save"));
    }
    onSaved(createdProductId);
  };

  return (
    <DialogContent className="max-h-[92vh] md:max-w-3xl p-0 flex flex-col rounded-2xl border border-border-strong shadow-2xl bg-background overflow-hidden">
      {/* Header with gradient bar and stepper indicators */}
      <div className="relative border-b border-border-subtle bg-secondary/20 p-5 pb-4">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-indigo-500 to-purple-600" />
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <span>{product ? t("inventory.editProduct") : t("inventory.newProduct")}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Stepper Tabs Bar */}
        <div className="flex items-center gap-2 mt-4 bg-muted/60 p-1 rounded-xl">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setActiveDialogTab("basic");
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 touch-manipulation ${
              activeDialogTab === "basic"
                ? "bg-background text-primary shadow-sm scale-[0.98]"
                : "text-muted-foreground hover:bg-background/40 hover:text-foreground"
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>{isAr ? "التفاصيل الأساسية" : "Basic Details"}</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setActiveDialogTab("media");
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 touch-manipulation ${
              activeDialogTab === "media"
                ? "bg-background text-primary shadow-sm scale-[0.98]"
                : "text-muted-foreground hover:bg-background/40 hover:text-foreground"
            }`}
          >
            <ImageIcon className="h-4 w-4" />
            <span>{isAr ? "معرض الصور" : "Media Gallery"}</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setActiveDialogTab("customizer");
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 touch-manipulation ${
              activeDialogTab === "customizer"
                ? "bg-background text-primary shadow-sm scale-[0.98]"
                : "text-muted-foreground hover:bg-background/40 hover:text-foreground"
            }`}
          >
            <Sliders className="h-4 w-4" />
            <span>{isAr ? "محرك التخصيص" : "Customization"}</span>
          </button>
        </div>
      </div>

      {/* Wizard Content Block */}
      <div className="flex-1 p-6 space-y-5 overflow-y-auto">
        {activeDialogTab === "basic" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <BilingualField
              labelAr="اسم المنتج — عربي"
              labelEn="Product name — English"
              valueAr={form.name_ar}
              valueEn={form.name_en}
              onChangeAr={(v) => {
                setForm({ ...form, name_ar: v });
                if (v.trim() || form.name_en.trim())
                  setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              onChangeEn={(v) => {
                setForm({ ...form, name_en: v });
                if (v.trim() || form.name_ar.trim())
                  setErrors((prev) => ({ ...prev, name: undefined }));
              }}
            />
            {errors.name && (
              <p className="text-xs text-destructive font-semibold mt-1" role="alert">
                {errors.name}
              </p>
            )}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs font-bold text-muted-foreground">
                  {t("inventory.category")}
                </Label>
                {form.category ? (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, category: "" })}
                    className="text-xs text-destructive hover:underline font-medium"
                  >
                    {isAr ? "إلغاء تعيين القسم (بدون قسم)" : "Clear category (No category)"}
                  </button>
                ) : null}
              </div>
              <div>
                {(categoriesQ.data ?? []).length > 0 ? (
                  <select
                    className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none"
                    value={(() => {
                      if (!form.category) return "";
                      const match = (categoriesQ.data ?? []).find(
                        (c) =>
                          c.slug?.toLowerCase() === form.category.toLowerCase() ||
                          c.name_en?.toLowerCase() === form.category.toLowerCase() ||
                          c.name_ar?.toLowerCase() === form.category.toLowerCase() ||
                          c.id === form.category,
                      );
                      return match ? match.slug || match.name_en : form.category;
                    })()}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    <option value="">{isAr ? "بدون قسم" : "No category"}</option>
                    {(categoriesQ.data ?? []).map((c) => {
                      const val = c.slug || c.name_en;
                      const label = isAr ? c.name_ar || c.name_en : c.name_en;
                      return (
                        <option key={c.id} value={val}>
                          {label}
                        </option>
                      );
                    })}
                    {form.category &&
                      !(categoriesQ.data ?? []).some(
                        (c) =>
                          c.slug?.toLowerCase() === form.category.toLowerCase() ||
                          c.name_en?.toLowerCase() === form.category.toLowerCase() ||
                          c.name_ar?.toLowerCase() === form.category.toLowerCase() ||
                          c.id === form.category,
                      ) && (
                        <option value={form.category}>
                          {form.category} (
                          {isAr ? "قسم حالي غير مسجل" : "Current unlisted category"})
                        </option>
                      )}
                  </select>
                ) : (
                  <Input
                    placeholder={t("inventory.categoryPh")}
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  />
                )}
              </div>
              {(categoriesQ.data ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  {isAr
                    ? "أنشئ أقسامًا من صفحة الأقسام لتظهر هنا كقائمة منسدلة."
                    : "Create categories in the Categories page to get a dropdown here."}
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs font-bold text-muted-foreground">
                {isAr ? "السعر الأساسي للمنتج (د.ب)" : "Base Price (BHD)"}
              </Label>
              <Input
                type="number"
                step="0.001"
                min="0"
                className={`mt-1 h-10.5 rounded-lg ${errors.price ? "border-destructive focus-visible:ring-destructive" : ""}`}
                placeholder="0.000"
                value={form.base_price}
                onChange={(e) => {
                  setForm({ ...form, base_price: e.target.value });
                  const v = e.target.value.trim();
                  if (v && !isNaN(Number(v)) && Number(v) >= 0) {
                    setErrors((prev) => ({ ...prev, price: undefined }));
                  }
                }}
              />
              {errors.price ? (
                <p className="text-xs text-destructive font-semibold mt-1" role="alert">
                  {errors.price}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1.5">
                  {isAr
                    ? "السعر العادي للمنتج، ويُورّث تلقائياً لكل متغير جديد."
                    : "The product's regular price, inherited automatically by every new variant."}
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs font-bold text-muted-foreground">
                {isAr ? "تكلفة القطعة عليك (اختياري)" : "Unit Cost (Optional)"}
              </Label>
              <Input
                type="number"
                step="0.001"
                min="0"
                className={`mt-1 h-10.5 rounded-lg ${errors.cost ? "border-destructive" : ""}`}
                placeholder={isAr ? "0.000 (اختياري)" : "0.000 (optional)"}
                value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
              />
              {errors.cost && <p className="mt-1 text-xs text-destructive">{errors.cost}</p>}
              <p className="mt-1.5 text-xs text-muted-foreground">
                {isAr
                  ? "اتركه فاضي إذا ما تعرف الرقم الآن، تقدر تضيفه لاحقاً لحساب صافي أرباحك بدقة."
                  : "Leave it empty if you don't know it now; you can add it anytime later to track net profit."}
              </p>
            </div>
            {!product && (
              <div>
                <Label className="text-xs font-bold text-muted-foreground">
                  {isAr
                    ? "الكمية المتوفرة بالمحل (المخزون الأولي)"
                    : "In-Store Available Quantity (Initial Stock)"}
                </Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  className="mt-1 h-10.5 rounded-lg"
                  placeholder="10"
                  value={form.initial_stock}
                  onChange={(e) => setForm({ ...form, initial_stock: e.target.value })}
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {isAr
                    ? "الكمية الجاهزة للبيع فوراً. سيتم إنشاء مقاس افتراضي تلقائياً لتتمكن من بيع المنتج مباشرة."
                    : "Ready-to-sell quantity. A default standard variant is created automatically so you can start selling immediately."}
                </p>
              </div>
            )}
            <div>
              <Label className="text-xs font-bold text-muted-foreground">
                {t("inventory.imageUrl")}
              </Label>
              <Input
                className="mt-1 h-10.5 rounded-lg"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between pt-2">
              <Label className="text-xs font-bold text-muted-foreground">
                {isAr ? "الوصف والتفاصيل التسويقية" : "Product Description"}
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const title = form.name_ar || form.name_en || "المنتج";
                  setForm((f) => ({
                    ...f,
                    description_ar: `${title} الفاخر والمميز بلمسة أنيقة وجودة عالية. تصنيع بإتقان يلائم كافة المناسبات ليعكس أناقتك الفريدة.`,
                    description_en: `Premium ${form.name_en || form.name_ar || "product"} crafted with exceptional quality and sophisticated design. Perfectly tailored for everyday elegance and special occasions.`,
                  }));
                  toast.success(
                    isAr
                      ? "تم تم توليد الوصف التسويقي الذكي بنجاح!"
                      : "AI product description generated successfully!",
                  );
                }}
                className="h-8 text-xs font-bold gap-1.5 border-primary/30 text-primary hover:bg-primary/10 rounded-lg"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
                {isAr ? "✨ صياغة وصف ذكي" : "✨ AI Copywriter"}
              </Button>
            </div>
            <BilingualField
              multiline
              labelAr="الوصف — عربي"
              labelEn="Description — English"
              valueAr={form.description_ar}
              valueEn={form.description_en}
              onChangeAr={(v) => setForm({ ...form, description_ar: v })}
              onChangeEn={(v) => setForm({ ...form, description_en: v })}
            />

            <div className="flex items-center justify-between rounded-xl border border-border-strong p-4 bg-secondary/10 transition hover:bg-secondary/20">
              <div>
                <p className="text-sm font-bold text-foreground">
                  {isAr ? "المنتج مفعّل في المتجر" : "Active in storefront"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAr
                    ? "إظهار للعملاء في المتجر العام"
                    : "Show to customers in the public storefront"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`text-xs font-bold ${form.is_active ? "text-emerald-700 dark:text-emerald-500" : "text-muted-foreground"}`}
                >
                  {form.is_active ? (isAr ? "مفعّل" : "Active") : isAr ? "مخفي" : "Hidden"}
                </span>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                  aria-label={isAr ? "إظهار المنتج في المتجر" : "Show product in storefront"}
                />
              </div>
            </div>
            {!product && (
              <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3.5 text-xs text-muted-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="leading-relaxed">
                  {isAr
                    ? "💡 هل لديك مقاسات أو ألوان متعددة؟ سيتم نشر هذا المنتج بمقاس قياسي تلقائياً، ويمكنك إضافة وتخصيص تفاصيل المقاسات والألوان في أي وقت بعد الحفظ."
                    : "💡 Have multiple sizes or colors? This product will be published with a standard size automatically; you can add and customize variants anytime after saving."}
                </span>
              </div>
            )}
            {/* Step 3 (Collapsible): Advanced Details & Specifications */}
            <div className="rounded-xl border border-border-strong bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => setAdvancedOpen((prev) => !prev)}
                className="w-full flex items-center justify-between p-3.5 text-xs font-bold text-foreground bg-secondary/15 hover:bg-secondary/25 transition-colors touch-manipulation"
              >
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-primary" />
                  <span>
                    {isAr
                      ? "خيارات ومواصفات إضافية (الأقمشة، المناسبات، المسميات والشارات)"
                      : "Advanced Options & Details (Fabrics, Occasions, Labels & Badges)"}
                  </span>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                    advancedOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {advancedOpen && (
                <div className="p-4 space-y-4 border-t border-border-subtle animate-in fade-in duration-150">
                  {/* Fabric & Occasion */}
                  {resolveVariantAxis({
                    axis: "fabric",
                    product,
                    addonDefaults: addonAxisDefaults,
                    lang: isAr ? "ar" : "en",
                  }).visible && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs font-bold text-muted-foreground">
                          {isAr ? "نوع القماش" : "Fabric Type"}
                        </Label>
                        <Input
                          className="mt-1 h-9.5 rounded-lg text-xs"
                          placeholder={
                            isAr ? "مثال: كريب ملكي، لينن، حرير..." : "e.g., Royal Crepe, Linen..."
                          }
                          value={form.fabric_type}
                          onChange={(e) => setForm({ ...form, fabric_type: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-bold text-muted-foreground">
                          {isAr ? "مناسبة لـ" : "Suitable for"}
                        </Label>
                        <div className="mt-1">
                          <select
                            className="w-full h-9.5 rounded-lg border border-input bg-background px-3 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none"
                            value={form.occasion}
                            onChange={(e) => setForm({ ...form, occasion: e.target.value })}
                          >
                            <option value="">
                              {isAr ? "اختر المناسبة..." : "Select occasion..."}
                            </option>
                            <option value="يومي">{isAr ? "يومي" : "Daily"}</option>
                            <option value="سهرة">{isAr ? "سهرة" : "Evening"}</option>
                            <option value="مناسبات">{isAr ? "مناسبات" : "Occasions"}</option>
                            <option value="إطلالة رسمية">{isAr ? "إطلالة رسمية" : "Formal"}</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Feature & Sale Switches */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex items-center justify-between rounded-lg border border-border-subtle p-3 bg-secondary/10">
                      <div>
                        <p className="text-xs font-bold text-foreground">
                          {isAr ? "إبراز في الرائج الآن" : "Feature in Trending now"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isAr
                            ? "أولوية في العرض للعملاء"
                            : "Prioritizes this product for discovery"}
                        </p>
                      </div>
                      <Switch
                        checked={form.featured_trending}
                        onCheckedChange={(v) => setForm({ ...form, featured_trending: v })}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-border-subtle p-3 bg-secondary/10">
                      <div>
                        <p className="text-xs font-bold text-foreground">
                          {isAr ? "إظهار شارة التنزيلات" : "Show Sale badge"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isAr
                            ? "تظهر عند وجود سعر أصلي أعلى"
                            : "Shown when an original price is higher"}
                        </p>
                      </div>
                      <Switch
                        checked={form.show_sale_badge}
                        onCheckedChange={(v) => setForm({ ...form, show_sale_badge: v })}
                      />
                    </div>
                  </div>

                  {/* Custom Variant Labels */}
                  <div className="rounded-lg border border-border-subtle p-3.5 bg-secondary/5 space-y-3">
                    <div>
                      <p className="text-xs font-bold text-foreground">
                        {isAr ? "🏷️ مسميات المتغيرات المخصصة" : "🏷️ Custom Variant Labels"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isAr
                          ? "تخصيص أسماء أعمدة المقاس، اللون، والخامة لصفحة عرض المنتج."
                          : "Override default column labels (Size, Color, Fabric) for the storefront."}
                      </p>
                    </div>
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 border-b border-border-subtle pb-2.5">
                        <div>
                          <Label className="text-xs font-bold text-muted-foreground">
                            {isAr ? "مسمى المقاس بالعربية" : "Custom Size Label — Arabic"}
                          </Label>
                          <Input
                            className="mt-1 h-8 rounded-md text-xs"
                            placeholder={
                              addonAxisDefaults?.size === null
                                ? isAr
                                  ? "معطّل افتراضياً (اكتب لتفعيله)"
                                  : "Disabled by default (type to enable)"
                                : addonAxisDefaults?.size?.ar ||
                                  (isAr ? "المقاس / خيار" : "Size / Option")
                            }
                            value={form.variant_label_size_ar || ""}
                            onChange={(e) =>
                              setForm({ ...form, variant_label_size_ar: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs font-bold text-muted-foreground">
                            {isAr ? "مسمى المقاس بالإنجليزية" : "Custom Size Label — English"}
                          </Label>
                          <Input
                            className="mt-1 h-8 rounded-md text-xs"
                            placeholder={
                              addonAxisDefaults?.size === null
                                ? "Disabled by default (type to enable)"
                                : addonAxisDefaults?.size?.en || "Size / Option"
                            }
                            value={form.variant_label_size_en || ""}
                            onChange={(e) =>
                              setForm({ ...form, variant_label_size_en: e.target.value })
                            }
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 border-b border-border-subtle pb-2.5">
                        <div>
                          <Label className="text-xs font-bold text-muted-foreground">
                            {isAr ? "مسمى اللون بالعربية" : "Custom Color Label — Arabic"}
                          </Label>
                          <Input
                            className="mt-1 h-8 rounded-md text-xs"
                            placeholder={
                              addonAxisDefaults?.color === null
                                ? isAr
                                  ? "معطّل افتراضياً (اكتب لتفعيله)"
                                  : "Disabled by default (type to enable)"
                                : addonAxisDefaults?.color?.ar || (isAr ? "اللون" : "Color")
                            }
                            value={form.variant_label_color_ar || ""}
                            onChange={(e) =>
                              setForm({ ...form, variant_label_color_ar: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs font-bold text-muted-foreground">
                            {isAr ? "مسمى اللون بالإنجليزية" : "Custom Color Label — English"}
                          </Label>
                          <Input
                            className="mt-1 h-8 rounded-md text-xs"
                            placeholder={
                              addonAxisDefaults?.color === null
                                ? "Disabled by default (type to enable)"
                                : addonAxisDefaults?.color?.en || "Color"
                            }
                            value={form.variant_label_color_en || ""}
                            onChange={(e) =>
                              setForm({ ...form, variant_label_color_en: e.target.value })
                            }
                          />
                        </div>
                      </div>

                      {/* Axis 3: Fabric / Packaging / Custom */}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 border-b border-border-subtle pb-2.5">
                        <div>
                          <Label className="text-xs font-bold text-muted-foreground">
                            {isAr
                              ? "مسمى الخاصية 3 بالعربية (الخامة / نوع التغليف)"
                              : "Axis 3 Label — Arabic (Fabric / Packaging)"}
                          </Label>
                          <Input
                            className="mt-1 h-8 rounded-md text-xs"
                            placeholder={
                              addonAxisDefaults?.fabric?.ar ||
                              (isAr ? "الخامة أو نوع التغليف" : "Fabric or Packaging")
                            }
                            value={form.variant_label_fabric_ar || ""}
                            onChange={(e) =>
                              setForm({ ...form, variant_label_fabric_ar: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs font-bold text-muted-foreground">
                            {isAr ? "مسمى الخاصية 3 بالإنجليزية" : "Axis 3 Label — English"}
                          </Label>
                          <Input
                            className="mt-1 h-8 rounded-md text-xs"
                            placeholder={addonAxisDefaults?.fabric?.en || "Fabric or Packaging"}
                            value={form.variant_label_fabric_en || ""}
                            onChange={(e) =>
                              setForm({ ...form, variant_label_fabric_en: e.target.value })
                            }
                          />
                        </div>
                      </div>

                      {/* Axis 4 & Axis 5 */}
                      {showExtraAxes || form.variant_label_four_ar || form.variant_label_five_ar ? (
                        <>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 border-b border-border-subtle pb-2.5">
                            <div>
                              <Label className="text-xs font-bold text-muted-foreground">
                                {isAr
                                  ? "مسمى الخاصية 4 بالعربية (مثال: الحشوة / درجة التحميص)"
                                  : "Axis 4 Label — Arabic (e.g. Filling / Roast)"}
                              </Label>
                              <Input
                                className="mt-1 h-8 rounded-md text-xs"
                                placeholder={isAr ? "الحشوة أو درجة التحميص" : "Filling or Roast"}
                                value={form.variant_label_four_ar || ""}
                                onChange={(e) =>
                                  setForm({ ...form, variant_label_four_ar: e.target.value })
                                }
                              />
                            </div>
                            <div>
                              <Label className="text-xs font-bold text-muted-foreground">
                                {isAr ? "مسمى الخاصية 4 بالإنجليزية" : "Axis 4 Label — English"}
                              </Label>
                              <Input
                                className="mt-1 h-8 rounded-md text-xs"
                                placeholder="Filling or Roast"
                                value={form.variant_label_four_en || ""}
                                onChange={(e) =>
                                  setForm({ ...form, variant_label_four_en: e.target.value })
                                }
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pb-1">
                            <div>
                              <Label className="text-xs font-bold text-muted-foreground">
                                {isAr
                                  ? "مسمى الخاصية 5 بالعربية (مثال: الإضافات / المرفقات)"
                                  : "Axis 5 Label — Arabic (e.g. Add-ons)"}
                              </Label>
                              <Input
                                className="mt-1 h-8 rounded-md text-xs"
                                placeholder={isAr ? "الإضافات أو المرفقات" : "Add-ons or Options"}
                                value={form.variant_label_five_ar || ""}
                                onChange={(e) =>
                                  setForm({ ...form, variant_label_five_ar: e.target.value })
                                }
                              />
                            </div>
                            <div>
                              <Label className="text-xs font-bold text-muted-foreground">
                                {isAr ? "مسمى الخاصية 5 بالإنجليزية" : "Axis 5 Label — English"}
                              </Label>
                              <Input
                                className="mt-1 h-8 rounded-md text-xs"
                                placeholder="Add-ons or Options"
                                value={form.variant_label_five_en || ""}
                                onChange={(e) =>
                                  setForm({ ...form, variant_label_five_en: e.target.value })
                                }
                              />
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="pt-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-primary font-bold hover:bg-primary/5 gap-1.5"
                            onClick={() => setShowExtraAxes(true)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>
                              {isAr
                                ? "+ إضافة خاصية إضافية (المحور 4 و 5)"
                                : "+ Add Extra Attributes (Axis 4 & 5)"}
                            </span>
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {storeProfile?.modules?.size_guide && (
                    <div className="rounded-lg border border-border-subtle p-3.5 bg-secondary/5 space-y-3">
                      <div>
                        <p className="text-xs font-bold text-foreground">
                          {isAr ? "📏 دليل المقاسات لهذا المنتج" : "📏 Product Size Guide"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {isAr
                            ? "حدد دليل مقاسات خاص بهذا المنتج، أو اتركه يتبع القسم / الافتراضي للمتجر."
                            : "Assign a dedicated size guide or inherit from category / store default."}
                        </p>
                      </div>
                      <div>
                        <select
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs ring-offset-background file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          value={form.size_guide_hidden ? "__hidden__" : form.size_guide_id || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "__hidden__") {
                              setForm({ ...form, size_guide_hidden: true, size_guide_id: null });
                            } else if (val === "") {
                              setForm({ ...form, size_guide_hidden: false, size_guide_id: null });
                            } else {
                              setForm({ ...form, size_guide_hidden: false, size_guide_id: val });
                            }
                          }}
                        >
                          <option value="">
                            {isAr
                              ? "تلقائي (يتبع تصنيف المنتج أو الافتراضي للمتجر)"
                              : "Automatic (Inherit from category or store default)"}
                          </option>
                          <option value="__hidden__">
                            {isAr
                              ? "🚫 إخفاء دليل المقاسات لهذا المنتج"
                              : "🚫 Hide size guide for this product"}
                          </option>
                          {(sizeGuidesQ.data ?? []).map((g) => (
                            <option key={g.id} value={g.id}>
                              {isAr ? g.name_ar : g.name_en}{" "}
                              {g.is_default ? (isAr ? "(الافتراضي)" : "(Default)") : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeDialogTab === "media" && (
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
        )}

        {activeDialogTab === "customizer" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="rounded-xl border border-border p-5 bg-secondary/10 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle pb-4">
                <div>
                  <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    <span>
                      {isAr ? "⚙️ محرك تصميم وتخصيص المنتج" : "⚙️ Product Customization Engine"}
                    </span>
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-bold text-primary uppercase">
                      Unlimited
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {isAr
                      ? "أضف حقولاً مخصصة غير محدودة لتمكين العميل من تخصيص طلبه."
                      : "Configure unlimited bespoke text fields, dropdown options, and upload forms."}
                  </div>
                </div>
                <div
                  className="flex flex-wrap items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Select
                    onValueChange={(presetKey) => {
                      const addonPreset = customFieldPresets.find((pr) => pr.key === presetKey);
                      const staticPreset =
                        CUSTOMIZER_PRESETS[presetKey as keyof typeof CUSTOMIZER_PRESETS];
                      const preset = addonPreset || staticPreset;
                      if (preset) {
                        const isCustomPreset = Boolean(preset.fields && preset.fields.length > 0);
                        setForm({
                          ...form,
                          is_made_to_order: isCustomPreset ? true : form.is_made_to_order,
                          custom_fields: [
                            ...(form.custom_fields ?? []),
                            ...preset.fields.map(
                              (f: any, index: number) =>
                                ({
                                  ...f,
                                  key: `f${Date.now()}-${index}-${f.key}`,
                                }) as CustomField,
                            ),
                          ],
                        });
                        toast.success(
                          isAr ? "تم تطبيق النموذج بنجاح" : "Preset applied successfully",
                        );
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs w-48 rounded-lg bg-background font-bold">
                      <SelectValue
                        placeholder={isAr ? "⚡ نموذج مسبق سريع" : "⚡ Quick Preset Customizer"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {customFieldPresets.map((pr) => (
                        <SelectItem key={pr.key} value={pr.key}>
                          {isAr ? pr.label.ar : pr.label.en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg font-bold touch-manipulation"
                    onClick={(e) => {
                      e.preventDefault();
                      setForm({
                        ...form,
                        custom_fields: [
                          ...(form.custom_fields ?? []),
                          {
                            key: `f${Date.now()}`,
                            label_ar: "",
                            label_en: "",
                            type: "text",
                            options: [],
                            required: false,
                          },
                        ],
                      });
                    }}
                  >
                    {isAr ? "إضافة حقل" : "Add field"}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between p-3.5 bg-background rounded-lg border border-border">
                <div>
                  <p className="text-xs font-bold text-foreground">
                    {isAr
                      ? "منتج حسب الطلب (لا يُخصم من المخزون)"
                      : "Made to order (no stock deduction)"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isAr
                      ? "المنتجات المصنعة حسب الطلب لا تتطلب توفر مخزون جاهز ولا يتم خصمها من المخزون عند الشراء"
                      : "Made-to-order items do not require ready physical stock and are not depleted on purchase"}
                  </p>
                </div>
                <Switch
                  checked={Boolean(form.is_made_to_order)}
                  onCheckedChange={(checked) => setForm({ ...form, is_made_to_order: checked })}
                />
              </div>

              {Boolean(form.is_made_to_order) && (
                <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 text-xs text-muted-foreground leading-relaxed flex items-start gap-2.5">
                  <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-foreground block mb-0.5">
                      {isAr ? "وضع تنفيذ المنتج في المتجر:" : "Storefront execution mode:"}
                    </span>
                    <span>
                      {isAr
                        ? "إذا أضفت مقاسات جاهزة بجدول المتغيرات، سيتيح المتجر للعميل الاختيار بين (مقاس جاهز) أو (صنع حسب الطلب). أما إذا لم تضف مقاسات جاهزة، فسيتحول المنتج تلقائياً إلى (حصري حسب الطلب) بدون خيارات مقاسات عادية."
                        : "If you add ready sizes in the variants table, customers can choose between ready-to-wear and made-to-order. If no ready sizes are added, it will automatically present as Made-to-Order Only."}
                    </span>
                  </div>
                </div>
              )}

              {(form.custom_fields ?? []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground border-2 border-dashed border-border-strong rounded-xl bg-background/50">
                  <Sliders className="h-8 w-8 opacity-40 mb-2.5 text-muted-foreground" />
                  <span className="text-xs font-bold text-foreground">
                    {isAr ? "لا توجد خيارات مخصصة مفعلة" : "No custom options configured yet"}
                  </span>
                  <span className="text-xs opacity-75 mt-1">
                    {isAr
                      ? "استخدم النماذج السريعة بالأعلى لتعبئة الحقول بضغطة زر!"
                      : "Use the dropdown template presets above to populate in 1-click!"}
                  </span>
                </div>
              ) : (
                <div className="space-y-4">
                  {(form.custom_fields ?? [])
                    .map((field, index) => ({ field, index }))
                    .map(({ field: f, index: i }) => {
                      const upd = (patch: Partial<CustomField>) => {
                        const next = [...form.custom_fields];
                        next[i] = { ...next[i], ...patch };
                        setForm({ ...form, custom_fields: next });
                      };
                      const remove = () =>
                        setForm({
                          ...form,
                          custom_fields: form.custom_fields.filter((_, j) => j !== i),
                        });
                      return (
                        <div
                          key={f.key}
                          className="rounded-xl border border-border p-4 bg-background space-y-3 shadow-sm transition hover:border-primary/40"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <Input
                              className="h-9 text-xs rounded-lg"
                              placeholder={isAr ? "التسمية بالعربية" : "Arabic label"}
                              value={f.label_ar ?? ""}
                              onChange={(e) => upd({ label_ar: e.target.value })}
                            />
                            <Input
                              className="h-9 text-xs rounded-lg"
                              placeholder={isAr ? "التسمية بالإنجليزية" : "English label"}
                              value={f.label_en ?? ""}
                              onChange={(e) => upd({ label_en: e.target.value })}
                            />
                            <Select
                              value={f.type}
                              onValueChange={(v) => upd({ type: v as CustomField["type"] })}
                            >
                              <SelectTrigger className="h-9 text-xs rounded-lg font-bold">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="text">{isAr ? "نص" : "Text"}</SelectItem>
                                <SelectItem value="number">{isAr ? "رقم" : "Number"}</SelectItem>
                                <SelectItem value="select">
                                  {isAr ? "قائمة اختيار" : "Dropdown"}
                                </SelectItem>
                                <SelectItem value="file">
                                  {isAr ? "رفع ملف" : "File upload"}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {f.type === "select" && (
                            <Input
                              className="h-9 text-xs rounded-lg"
                              placeholder={
                                isAr
                                  ? "الخيارات مفصولة بفاصلة (,) أو (،)"
                                  : "Options separated by commas"
                              }
                              defaultValue={(f.options ?? []).join(", ")}
                              onChange={(e) =>
                                upd({
                                  options: e.target.value
                                    .split(/[,،]/)
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                })
                              }
                            />
                          )}

                          {/* Real-time storefront preview block */}
                          <div className="rounded-lg bg-muted/40 p-3 border border-dashed border-border-subtle text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                                {isAr
                                  ? "👁️ معاينة فورية لصفحة المنتج"
                                  : "👁️ Real-time Storefront Preview"}
                              </span>
                            </div>
                            <div className="mt-2 space-y-1">
                              <div className="flex items-center gap-1 font-bold text-foreground/90">
                                <span>
                                  {isAr
                                    ? f.label_ar || f.label_en || "اسم الحقل"
                                    : f.label_en || f.label_ar || "Field Name"}
                                </span>
                                {f.required && <span className="text-red-500 font-bold">*</span>}
                              </div>
                              {f.type === "text" && (
                                <Input
                                  disabled
                                  className="h-8.5 text-xs bg-background rounded-lg"
                                  placeholder={isAr ? "كتابة نص مخصص..." : "Enter custom text..."}
                                />
                              )}
                              {f.type === "number" && (
                                <Input
                                  disabled
                                  type="number"
                                  className="h-8.5 text-xs bg-background rounded-lg"
                                  placeholder="123"
                                />
                              )}
                              {f.type === "file" && (
                                <div className="flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background text-muted-foreground">
                                  <svg
                                    className="h-4 w-4 opacity-60"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                                    />
                                  </svg>
                                  <span className="text-xs font-bold">
                                    {isAr
                                      ? "انقر لرفع ملف مخصص (.pdf, .png, .jpg)"
                                      : "Click to upload custom file (.pdf, .png, .jpg)"}
                                  </span>
                                </div>
                              )}
                              {f.type === "select" && (
                                <div className="flex flex-wrap gap-1.5 pt-0.5">
                                  {(f.options ?? []).length === 0 ? (
                                    <span className="text-xs text-muted-foreground italic">
                                      {isAr ? "لا توجد خيارات بعد" : "No options specified yet"}
                                    </span>
                                  ) : (
                                    (f.options ?? []).map((opt) => (
                                      <div
                                        key={opt}
                                        className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-bold text-foreground shadow-sm"
                                      >
                                        {opt}
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          <div
                            className="flex items-center justify-between border-t border-border-subtle pt-3 text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-2 text-xs font-medium">
                              <Switch
                                checked={!!f.required}
                                onCheckedChange={(v) => upd({ required: v })}
                              />
                              <span className="text-muted-foreground">
                                {isAr ? "حقل إلزامي" : "Required field"}
                              </span>
                            </div>
                            <div className="flex items-center gap-0.5">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 p-0 touch-manipulation"
                                disabled={i === 0}
                                onClick={(e) => {
                                  e.preventDefault();
                                  const next = [...form.custom_fields];
                                  const temp = next[i];
                                  next[i] = next[i - 1];
                                  next[i - 1] = temp;
                                  setForm({ ...form, custom_fields: next });
                                }}
                                title={isAr ? "نقل للأعلى" : "Move Up"}
                              >
                                ▲
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 p-0 touch-manipulation"
                                disabled={i === (form.custom_fields ?? []).length - 1}
                                onClick={(e) => {
                                  e.preventDefault();
                                  const next = [...form.custom_fields];
                                  const temp = next[i];
                                  next[i] = next[i + 1];
                                  next[i + 1] = temp;
                                  setForm({ ...form, custom_fields: next });
                                }}
                                title={isAr ? "نقل للأسفل" : "Move Down"}
                              >
                                ▼
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-7 text-xs rounded font-bold touch-manipulation"
                                onClick={(e) => {
                                  e.preventDefault();
                                  remove();
                                }}
                              >
                                {isAr ? "حذف" : "Remove"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Persistent Footer with back/next and global save actions */}
      <div className="border-t border-border-subtle bg-secondary/20 px-6 py-4.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {activeDialogTab !== "basic" && (
            <Button
              type="button"
              variant="outline"
              className="h-10 px-4 rounded-xl font-bold touch-manipulation"
              onClick={(e) => {
                e.preventDefault();
                if (activeDialogTab === "media") setActiveDialogTab("basic");
                else if (activeDialogTab === "customizer") setActiveDialogTab("media");
              }}
            >
              {isAr ? "السابق" : "Back"}
            </Button>
          )}
          {activeDialogTab !== "customizer" && (
            <Button
              type="button"
              variant="secondary"
              className="h-10 px-4 rounded-xl font-bold touch-manipulation"
              onClick={(e) => {
                e.preventDefault();
                if (activeDialogTab === "basic") setActiveDialogTab("media");
                else if (activeDialogTab === "media") setActiveDialogTab("customizer");
              }}
            >
              {isAr ? "التالي" : "Next"}
            </Button>
          )}
        </div>
        <Button
          type="button"
          onClick={save}
          className="h-10 px-5 rounded-xl font-bold bg-primary hover:bg-primary/95 text-primary-foreground shadow-lg shadow-primary/10 touch-manipulation"
        >
          {t("common.save")}
        </Button>
      </div>
      <ImageCropperDialog
        open={Boolean(cropSrc)}
        imageSrc={cropSrc}
        preset="productPortrait"
        busy={uploading}
        title={isAr ? "ضبط صورة المنتج" : "Frame product image"}
        description={
          isAr
            ? "اختر ملء الإطار أو احتواء كامل لمنع قص أي تفاصيل، أو تخطّ القص لاستخدام الصورة الأصلية."
            : "Choose cover to crop, contain to preserve full height, or skip crop to keep original."
        }
        onCancel={() => {
          setCropSrc(null);
          setPendingImageFile(null);
        }}
        onConfirm={handleCropConfirmed}
        onSkipCrop={handleSkipCrop}
      />
      <VideoOptimizerDialog
        open={Boolean(pendingVideo)}
        file={pendingVideo}
        brandId={brand.id}
        onOpenChange={(open) => {
          if (!open) setPendingVideo(null);
        }}
        onConfirm={handleConfirmProductVideo}
        onCancel={() => setPendingVideo(null)}
      />
    </DialogContent>
  );
}
