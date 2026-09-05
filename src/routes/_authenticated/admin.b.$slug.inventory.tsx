import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useMemo, useCallback, useDeferredValue } from "react";
import { supabase } from "@/integrations/supabase/client";
import { importProductCatalog } from "@/lib/universal-importer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Plus,
  Pencil,
  Trash2,
  Package,
  TrendingUp,
  Wand as Wand2,
  Printer,
  Search,
  AlertTriangle,
  Boxes,
  ChevronDown,
  Sparkles,
  Upload,
  Loader2,
  Check,
  Filter,
  CheckSquare,
  Square,
  RefreshCw,
  FileText,
  Image as ImageIcon,
  Sliders,
  X,
  Zap,
  Barcode,
  TableProperties,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import { useT, useI18n } from "@/lib/i18n";
import { ActivityLogList } from "@/components/activity-log-list";
import { PrintLabelButton, printLabels, type LabelData } from "@/components/barcode-label";
import { useProfile } from "@/lib/profile-context";
import { useBrand } from "@/lib/brand-context";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { queryKeys } from "@/lib/query-keys";
import { parseCSV } from "@/lib/csv-parser";
import { Switch } from "@/components/ui/switch";
import { ImageCropperDialog } from "@/components/image-cropper-dialog";
import { CropUploadButton } from "@/components/crop-upload-button";
import { BilingualField } from "@/components/bilingual-field";
import { deletePublicMediaUrl, uploadPublicMedia } from "@/lib/r2-upload";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { parseVariantPrompt, type VariantGenerationPlan } from "@/lib/generate-variants.functions";
import {
  formatSkuToken,
  makeEan13,
  splitVariantValues,
  SIZING_PRESETS,
} from "@/lib/variant-sku-utils";
import { OptimizedVideo, ResponsiveImage } from "@/components/responsive-media";
import { InventoryCommandHeader } from "@/components/inventory/InventoryCommandHeader";
import {
  InventoryScopeSwitcher,
  type InventoryScopeTab,
} from "@/components/inventory/InventoryScopeSwitcher";
import { InventoryToolbar } from "@/components/inventory/InventoryToolbar";
import { InventoryWorkQueue } from "@/components/inventory/InventoryWorkQueue";
import { InventoryMobileCard } from "@/components/inventory/InventoryMobileCard";
import { BulkSelectionToolbar } from "@/components/bulk-selection-toolbar";
import { PackagingMaterialsTab } from "@/components/inventory/PackagingMaterialsTab";
import { ProductBomModal } from "@/components/products/ProductBomModal";
import { BatchIncubatorTransferModal } from "@/components/incubators/BatchIncubatorTransferModal";

import { ListPagination } from "@/components/list-pagination";
import { isLowStock, isOutOfStock } from "@/lib/inventory-health";
import { RoutePendingSkeleton } from "@/components/os/route-pending-skeleton";
import { OsEmptyState } from "@/components/os/os-empty-state";
import {
  FIT_PROFILE_FIELDS,
  matchCustomFieldToMeasurement,
  type FitProfileType,
} from "@/lib/fit-passport";

/** Common measurement units the admin can pick from for a "size" variant. */
const SIZE_UNITS = ["", "cm", "mm", "m", "inch", "ft", "kg", "g", "ml", "l"] as const;

export const Route = createFileRoute("/_authenticated/admin/b/$slug/inventory")({
  component: Inventory,
});

type MediaItem = {
  type: "image" | "video";
  url: string;
  stream_uid?: string;
  stream_iframe_url?: string;
  poster_url?: string;
};
type CustomField = {
  key: string;
  label_ar: string | null;
  label_en: string | null;
  type: "text" | "number" | "select" | "file";
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
  base_price?: number | null;
  cost_price?: number | null;
  variant_label_size_ar?: string | null;
  variant_label_size_en?: string | null;
  variant_label_color_ar?: string | null;
  variant_label_color_en?: string | null;
  variant_label_fabric_ar?: string | null;
  variant_label_fabric_en?: string | null;
  fabric_type?: string | null;
  occasion?: string | null;
};
type Variant = {
  id: string;
  product_id: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  fabric: string | null;
  cost_price: number;
  selling_price: number;
  original_price: number | null;
  stock: number;
  stock_main: number;
  stock_incubator: number;
  barcode: string | null;
  size_unit: string | null;
  created_at?: string;
  image_url: string | null;
};
type Customization = {
  id: string;
  name: string;
  price_delta: number;
  product_ids?: string[] | null;
};

function InventoryDeleteAction({
  message,
  onConfirm,
  mobile = false,
}: {
  message: string;
  onConfirm: () => void | Promise<void>;
  mobile?: boolean;
}) {
  const t = useT();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          className={mobile ? "h-11 w-11 touch-manipulation text-destructive" : "text-destructive"}
          variant="ghost"
          size="icon"
          aria-label={t("common.delete")}
        >
          <Trash2 className={mobile ? "h-5 w-5" : "h-4 w-4"} />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("common.delete")}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => void onConfirm()}
          >
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Inventory() {
  const t = useT();
  const { lang } = useI18n();
  const qc = useQueryClient();
  const brand = useBrand();
  const brandId = brand.id;
  const [tab, setTab] = useState<"products" | "customizations" | "packaging">("products");

  const [productToDelete, setProductToDelete] = useState<string | null>(null);

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

  if (
    products.isLoading ||
    variants.isLoading ||
    customizations.isLoading ||
    businessName.isLoading ||
    salesHistory.isLoading
  ) {
    return <RoutePendingSkeleton />;
  }

  if (
    products.isError ||
    variants.isError ||
    customizations.isError ||
    businessName.isError ||
    salesHistory.isError
  ) {
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
            onClick={() =>
              void Promise.all([
                products.refetch(),
                variants.refetch(),
                customizations.refetch(),
                businessName.refetch(),
                salesHistory.refetch(),
              ])
            }
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
      <div className="flex p-1.5 gap-1.5 bg-muted/40 rounded-xl border border-border/40 backdrop-blur-sm max-w-lg">
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
          products={products.data ?? []}
          variants={variants.data ?? []}
          businessName={businessName.data?.business_name ?? null}
          currency={businessName.data?.currency ?? "BHD"}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: queryKeys.products.all(brandId) });
            qc.invalidateQueries({ queryKey: queryKeys.variants.all(brandId) });
          }}
          salesHistory={salesHistory.data ?? []}
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

const PRODUCT_HEADER_MAPS = {
  name: ["title", "name", "اسم المنتج", "عنوان المنتج", "product name", "product_name"],
  price: [
    "price",
    "price (bhd)",
    "price (sar)",
    "السعر",
    "سعر البيع",
    "selling_price",
    "price_bhd",
  ],
  image: [
    "image src",
    "image",
    "media",
    "صورة المنتج",
    "روابط الصور",
    "image_url",
    "image url",
    "image_src",
  ],
  stock: [
    "variant inventory qty",
    "stock",
    "الكمية",
    "المخزون",
    "inventory",
    "qty",
    "quantity",
    "stock_main",
  ],
};

function ProductImporterModal({
  brandId,
  onComplete,
  renderTrigger,
}: {
  brandId: string;
  onComplete: () => void;
  renderTrigger?: (onClick: () => void) => React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"preset" | "mapper" | "importing" | "success">("preset");
  const [preset, setPreset] = useState<"shopify" | "salla" | "zid" | "woocommerce" | "custom">(
    "custom",
  );
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, number>>({
    name: -1,
    price: -1,
    image: -1,
    stock: -1,
  });
  const [progress, setProgress] = useState("");
  const [successCount, setSuccessCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [importIssues, setImportIssues] = useState<
    Array<{ row: number; code: string; name: string }>
  >([]);
  const [importSessionId, setImportSessionId] = useState(() => crypto.randomUUID());
  const [totalCount, setTotalCount] = useState(0);
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const importHistoryQuery = useQuery({
    queryKey: ["product-import-history", brandId],
    enabled: isOpen,
    queryFn: async () => {
      const { data, error } = await (supabase.from("import_runs" as never) as any)
        .select(
          "id,session_id,source,status,total_count,success_count,skipped_count,failed_count,created_at",
        )
        .eq("brand_id", brandId)
        .eq("entity_type", "products")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      const sessions = new Map<string, any>();
      for (const row of data ?? []) {
        const existing = sessions.get(row.session_id);
        const current = existing ?? { ...row };
        if (existing) {
          current.total_count += row.total_count;
          current.success_count += row.success_count;
          current.skipped_count += row.skipped_count;
          current.failed_count += row.failed_count;
          if (row.status === "failed" || row.status === "partial") current.status = row.status;
        }
        sessions.set(row.session_id, current);
      }
      return [...sessions.values()].slice(0, 5);
    },
  });

  const handleOpen = () => {
    setImportSessionId(crypto.randomUUID());
    setIsOpen(true);
    setStep("preset");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error(isAr ? "الحد الأقصى لحجم الملف 10 ميجابايت." : "Maximum file size is 10 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) {
        toast.error(
          isAr
            ? "ملف الـ CSV فارغ أو يحتوي على صف الرأس فقط."
            : "CSV file is empty or only contains the header row.",
        );
        return;
      }
      if (rows.length > 5_001) {
        toast.error(isAr ? "الحد الأقصى 5,000 صف لكل ملف." : "Maximum 5,000 rows per file.");
        return;
      }

      const fileHeaders = rows[0].map((h) => h.trim());
      setParsedRows(rows.slice(1));
      setHeaders(fileHeaders);

      // Smart Header Mapping Detector
      const newMappings = { name: -1, price: -1, image: -1, stock: -1 };
      Object.entries(PRODUCT_HEADER_MAPS).forEach(([field, aliases]) => {
        const foundIdx = fileHeaders.findIndex((h) =>
          aliases.some(
            (alias) =>
              h.toLowerCase() === alias.toLowerCase() ||
              h.toLowerCase().includes(alias.toLowerCase()),
          ),
        );
        newMappings[field as keyof typeof newMappings] = foundIdx;
      });

      setMappings(newMappings);

      // A professional import always requires an explicit preview/confirmation,
      // even when a platform preset maps every column successfully.
      setStep("mapper");
    };
    reader.readAsText(file);
  };

  const startImport = async (
    dataRows: string[][],
    finalMappings: Record<string, number>,
    headersList: string[] = headers,
  ) => {
    setStep("importing");
    setProgress(isAr ? "بدء استيراد الكتالوج..." : "Starting product catalog import...");
    setTotalCount(dataRows.length);
    setSuccessCount(0);
    setSkippedCount(0);
    setFailedCount(0);
    setImportIssues([]);

    const findHeaderIdx = (names: string[]) => {
      return headersList.findIndex((h) =>
        names.some((name) => h.trim().toLowerCase() === name.toLowerCase()),
      );
    };

    try {
      const productsPayload = dataRows.map((row) => {
        let nameVal = "";
        let priceVal = 10.0;
        let imageVal: string | null = null;
        let stockVal = 10;
        let skuVal = `SKU-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        let sizeVal: string | null = null;
        let colorVal: string | null = null;

        if (preset === "shopify") {
          const titleIdx = findHeaderIdx(["title"]);
          const priceIdx = findHeaderIdx(["variant price", "price"]);
          const imageIdx = findHeaderIdx(["image src", "image url", "image_src", "image"]);
          const stockIdx = findHeaderIdx(["variant inventory qty", "inventory qty", "stock"]);
          const skuIdx = findHeaderIdx(["variant sku", "sku"]);
          const option1NameIdx = findHeaderIdx(["option1 name"]);
          const option1ValueIdx = findHeaderIdx(["option1 value"]);
          const option2NameIdx = findHeaderIdx(["option2 name"]);
          const option2ValueIdx = findHeaderIdx(["option2 value"]);

          const options = [
            [option1NameIdx, option1ValueIdx],
            [option2NameIdx, option2ValueIdx],
          ] as const;
          for (const [nameIndex, valueIndex] of options) {
            if (nameIndex === -1 || valueIndex === -1 || !row[valueIndex]) continue;
            const optionName = row[nameIndex]?.toLowerCase() || "";
            if (optionName.includes("size") || optionName.includes("مقاس"))
              sizeVal = row[valueIndex];
            else if (
              optionName.includes("color") ||
              optionName.includes("colour") ||
              optionName.includes("لون")
            )
              colorVal = row[valueIndex];
          }

          nameVal = titleIdx !== -1 ? row[titleIdx] : "";
          priceVal =
            priceIdx !== -1
              ? parseFloat(row[priceIdx]?.replace(/[^\d.]/g, "") || "10") || 10.0
              : 10.0;
          imageVal = imageIdx !== -1 ? row[imageIdx] : null;
          stockVal =
            stockIdx !== -1 ? parseInt(row[stockIdx]?.replace(/[^\d]/g, "") || "0") || 0 : 10;
          if (skuIdx !== -1 && row[skuIdx]) {
            skuVal = row[skuIdx];
          }
        } else if (preset === "woocommerce") {
          const nameIdx = findHeaderIdx(["name", "title", "post_title"]);
          const priceIdx = findHeaderIdx([
            "regular price",
            "sale price",
            "price",
            "_regular_price",
          ]);
          const imageIdx = findHeaderIdx(["images", "image_url", "image"]);
          const stockIdx = findHeaderIdx(["stock", "manage_stock", "_stock", "quantity"]);
          const skuIdx = findHeaderIdx(["sku"]);

          nameVal = nameIdx !== -1 ? row[nameIdx] : "";
          priceVal =
            priceIdx !== -1
              ? parseFloat(row[priceIdx]?.replace(/[^\d.]/g, "") || "10") || 10.0
              : 10.0;
          imageVal = imageIdx !== -1 ? row[imageIdx]?.split(",")?.[0]?.trim() || null : null;
          stockVal =
            stockIdx !== -1 ? parseInt(row[stockIdx]?.replace(/[^\d]/g, "") || "0") || 0 : 10;
          if (skuIdx !== -1 && row[skuIdx]) {
            skuVal = row[skuIdx];
          }
        } else if (preset === "salla" || preset === "zid") {
          const nameIdx = findHeaderIdx([
            "اسم المنتج",
            "الاسم",
            "عنوان المنتج",
            "product name",
            "name",
          ]);
          const priceIdx = findHeaderIdx(["السعر", "سعر البيع", "selling_price", "price"]);
          const imageIdx = findHeaderIdx([
            "صورة المنتج",
            "روابط الصور",
            "الصور",
            "image_url",
            "image",
          ]);
          const stockIdx = findHeaderIdx([
            "الكمية",
            "المخزون",
            "كمية المخزون",
            "quantity",
            "stock",
          ]);
          const skuIdx = findHeaderIdx(["رمز المنتج", "sku"]);

          nameVal = nameIdx !== -1 ? row[nameIdx] : "";
          priceVal =
            priceIdx !== -1
              ? parseFloat(row[priceIdx]?.replace(/[^\d.]/g, "") || "10") || 10.0
              : 10.0;
          imageVal = imageIdx !== -1 ? row[imageIdx]?.split(",")?.[0]?.trim() || null : null;
          stockVal =
            stockIdx !== -1 ? parseInt(row[stockIdx]?.replace(/[^\d]/g, "") || "0") || 0 : 10;
          if (skuIdx !== -1 && row[skuIdx]) {
            skuVal = row[skuIdx];
          }
        } else {
          nameVal = finalMappings.name !== -1 ? row[finalMappings.name] : "";
          priceVal =
            finalMappings.price !== -1
              ? parseFloat(row[finalMappings.price]?.replace(/[^\d.]/g, "") || "10") || 10.0
              : 10.0;
          imageVal = finalMappings.image !== -1 ? row[finalMappings.image] : null;
          stockVal =
            finalMappings.stock !== -1
              ? parseInt(row[finalMappings.stock]?.replace(/[^\d]/g, "") || "0") || 10
              : 10;
        }

        return {
          name: nameVal.trim(),
          name_ar: isAr ? nameVal : null,
          name_en: isAr ? null : nameVal,
          description: isAr ? "تم الاستيراد بنجاح" : "Imported product details",
          description_ar: isAr ? "تم الاستيراد بنجاح" : null,
          description_en: isAr ? null : "Imported product details",
          category: "General",
          image_url: imageVal,
          is_active: true,
          variants: [
            {
              size: sizeVal,
              size_unit: null,
              color: colorVal,
              fabric: null,
              sku: skuVal,
              barcode: null,
              cost_price: 0,
              selling_price: priceVal,
              stock_main: stockVal,
              stock_incubator: 0,
            },
          ],
        };
      });

      // Shopify exports one row per variant. Consolidate rows by Handle so a
      // product with five variants is imported as one product, not five products.
      let consolidatedPayload = productsPayload;
      if (preset === "shopify") {
        const handleIdx = findHeaderIdx(["handle"]);
        const groups = new Map<string, (typeof productsPayload)[number]>();
        dataRows.forEach((row, index) => {
          const product = productsPayload[index];
          const key = (handleIdx !== -1 ? row[handleIdx] : product.name).trim().toLowerCase();
          const existing = groups.get(key);
          if (!existing) groups.set(key, product);
          else {
            existing.variants.push(...product.variants);
            if (!existing.image_url && product.image_url) existing.image_url = product.image_url;
            if (!existing.name && product.name) {
              existing.name = product.name;
              existing.name_ar = product.name_ar;
              existing.name_en = product.name_en;
            }
          }
        });
        consolidatedPayload = [...groups.values()];
      }

      consolidatedPayload = consolidatedPayload.filter((product) => {
        const valid =
          product.name.trim().length > 0 &&
          product.variants.every(
            (variant) => Number.isFinite(variant.selling_price) && variant.selling_price >= 0,
          );
        if (!valid) setFailedCount((count) => count + 1);
        return valid;
      });
      setTotalCount(consolidatedPayload.length);

      // Split into batches of 10 to provide elegant live feedback to the merchant!
      const batchSize = 10;
      let totalSuccess = 0;

      for (let i = 0; i < consolidatedPayload.length; i += batchSize) {
        const chunk = consolidatedPayload.slice(i, i + batchSize);
        setProgress(
          isAr
            ? `جاري نقل ${i} من أصل ${consolidatedPayload.length} منتج...`
            : `Migrated ${i} / ${consolidatedPayload.length} products...`,
        );

        const result = await importProductCatalog({
          data: {
            brandId,
            importSessionId,
            batchIndex: Math.floor(i / batchSize),
            source: preset,
            products: chunk,
          },
        });
        totalSuccess += result.successCount;
        setSkippedCount((count) => count + result.skippedCount);
        setFailedCount((count) => count + result.failedCount);
        setImportIssues((issues) => [...issues, ...result.issues].slice(0, 100));
        setSuccessCount(totalSuccess);
      }

      setStep("success");
      await importHistoryQuery.refetch();
      onComplete();
    } catch (err) {
      console.error(err);
      toast.error(isAr ? "تعذّر استيراد الملف" : "Import process failed");
      setStep("preset");
    }
  };

  return (
    <>
      {renderTrigger ? (
        renderTrigger(handleOpen)
      ) : (
        <Button
          variant="outline"
          onClick={handleOpen}
          className="border-primary/20 hover:border-primary/40 hover:bg-primary/5 transition-all text-primary"
        >
          <Sparkles className="h-4 w-4 me-2 animate-pulse text-amber-500" />
          {isAr ? "استيراد كتالوج المنتجات" : "Import Products"}
        </Button>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-xl border-zinc-100 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-xl">
              <Sparkles className="h-5 w-5 text-amber-500" />
              {isAr ? "استيراد ونقل المنتجات" : "Import Product Catalog"}
            </DialogTitle>
          </DialogHeader>

          {step === "preset" && (
            <div className="space-y-4 pt-2 select-none">
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "قم بتصدير الكتالوج الخاص بك من منصتك السابقة، وسيقوم نظامنا تلقائياً بإعادة استضافة صور CDN الخاصة بك على سيرفراتنا الفائقة السرعة واستيراد الكتالوج فوراً."
                  : "Export your product catalog from your previous platform. Our system will automatically re-host all CDN images to public R2 and batch import your data."}
              </p>

              <div className="grid grid-cols-2 gap-4">
                {[
                  {
                    id: "shopify",
                    name: "Shopify CSV",
                    desc: "products_export.csv",
                    color: "hover:border-emerald-500/30",
                  },
                  {
                    id: "salla",
                    name: "Salla (سلة)",
                    desc: "تصدير سلة بصيغة CSV",
                    color: "hover:border-green-500/30",
                  },
                  {
                    id: "zid",
                    name: "Zid (زد)",
                    desc: "تصدير زد بصيغة CSV",
                    color: "hover:border-purple-500/30",
                  },
                  {
                    id: "woocommerce",
                    name: "WooCommerce",
                    desc: "WooCommerce CSV",
                    color: "hover:border-blue-500/30",
                  },
                  {
                    id: "custom",
                    name: isAr ? "CSV مخصص" : "Custom CSV / Sheets",
                    desc: "Excel or Google Sheet CSV",
                    color: "hover:border-primary/30",
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setPreset(item.id as any)}
                    className={`flex flex-col items-start p-3.5 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 text-left transition-all ${item.color} ${
                      preset === item.id
                        ? "border-primary ring-2 ring-primary/10 bg-primary/5 dark:bg-primary/5"
                        : ""
                    }`}
                  >
                    <span className="text-sm font-semibold font-display text-foreground block">
                      {item.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground block mt-0.5">
                      {item.desc}
                    </span>
                  </button>
                ))}
              </div>

              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
                <label className="relative cursor-pointer">
                  <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-xs rounded-xl shadow-lg shadow-primary/10 hover:shadow-xl hover:bg-primary/95 transition-all">
                    <Upload className="h-4 w-4" />
                    {isAr ? "اختر الملف وابدأ الاستيراد" : "Upload & Begin Migration"}
                  </span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </label>
              </div>

              {(importHistoryQuery.data?.length ?? 0) > 0 && (
                <div className="space-y-2 border-t border-border/60 pt-4">
                  <p className="text-xs font-semibold">
                    {isAr ? "آخر عمليات الاستيراد" : "Recent imports"}
                  </p>
                  {importHistoryQuery.data!.map((run: any) => (
                    <div
                      key={run.session_id}
                      className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-[11px]"
                    >
                      <div>
                        <span className="font-semibold uppercase">{run.source}</span>
                        <span className="ms-2 text-muted-foreground">
                          {new Date(run.created_at).toLocaleString(isAr ? "ar-BH" : "en-BH")}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-emerald-600">✓ {run.success_count}</span>
                        {run.skipped_count > 0 && (
                          <span className="text-amber-600">↷ {run.skipped_count}</span>
                        )}
                        {run.failed_count > 0 && (
                          <span className="text-rose-600">× {run.failed_count}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === "mapper" && (
            <div className="space-y-4 pt-2">
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "لم نتمكن من مطابقة بعض الأعمدة تلقائياً. يرجى مطابقة أعمدة ملفك مع سمات المنتج المطلوبة لدينا:"
                  : "We couldn't automatically resolve some fields. Please map your CSV headers to our required product fields:"}
              </p>

              <div className="space-y-4">
                {[
                  { key: "name", label: isAr ? "اسم المنتج" : "Product Title", required: true },
                  { key: "price", label: isAr ? "السعر (د.ب)" : "Price (BHD)", required: true },
                  { key: "image", label: isAr ? "رابط الصورة" : "Image URL", required: false },
                  {
                    key: "stock",
                    label: isAr ? "المخزون الحالي" : "Inventory Stock",
                    required: false,
                  },
                ].map((field) => (
                  <div
                    key={field.key}
                    className="flex items-center justify-between gap-4 p-3 bg-zinc-50 dark:bg-zinc-900/40 rounded-xl border border-zinc-100 dark:border-zinc-800"
                  >
                    <span className="text-xs font-semibold text-foreground">
                      {field.label} {field.required && <span className="text-rose-500">*</span>}
                    </span>
                    <Select
                      value={mappings[field.key]?.toString() || "-1"}
                      onValueChange={(val) =>
                        setMappings((m) => ({ ...m, [field.key]: parseInt(val) }))
                      }
                    >
                      <SelectTrigger className="w-[200px] h-9 text-xs">
                        <SelectValue placeholder={isAr ? "اختر العمود..." : "Select column..."} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="-1">
                          -- {isAr ? "تخطي العمود" : "Skip/Omit Field"} --
                        </SelectItem>
                        {headers.map((h, idx) => (
                          <SelectItem key={idx} value={idx.toString()}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold">
                  <span>{isAr ? "معاينة البيانات" : "Data preview"}</span>
                  <span className="text-muted-foreground">
                    {parsedRows.length} {isAr ? "صف" : "rows"}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-[11px]">
                    <thead>
                      <tr className="border-b">
                        {headers.slice(0, 5).map((header) => (
                          <th key={header} className="p-2 text-start font-semibold">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.slice(0, 5).map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-b last:border-0">
                          {headers.slice(0, 5).map((_, columnIndex) => (
                            <td
                              key={columnIndex}
                              className="max-w-40 truncate p-2 text-muted-foreground"
                            >
                              {row[columnIndex] || "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
                <Button
                  onClick={() => {
                    if (mappings.name === -1 || mappings.price === -1) {
                      toast.error(
                        isAr
                          ? "يجب مطابقة اسم المنتج والسعر على الأقل."
                          : "Product Title and Price fields are mandatory.",
                      );
                      return;
                    }
                    startImport(parsedRows, mappings);
                  }}
                  className="bg-primary text-xs text-primary-foreground font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-primary/10 hover:shadow-xl transition-all"
                >
                  {isAr ? "تأكيد واستيراد الآن" : "Confirm & Import Catalog"}
                </Button>
              </div>
            </div>
          )}

          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12 space-y-6 text-center">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
                <div className="relative h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                  <Loader2 className="h-7 w-7 text-primary animate-spin" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground font-display">
                  {isAr
                    ? "جاري نقل وإعادة توطين كتالوج المنتجات..."
                    : "Processing Universal Catalog Migration..."}
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm font-sans mx-auto leading-relaxed">
                  {progress}
                </p>
              </div>
              <div className="w-full max-w-xs bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-300"
                  style={{ width: `${totalCount > 0 ? (successCount / totalCount) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {step === "success" && (
            <div className="flex flex-col items-center justify-center py-10 space-y-5 text-center">
              <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-500/20 text-emerald-500 flex items-center justify-center">
                <Check className="h-7 w-7 animate-bounce" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold font-display text-zinc-900 dark:text-zinc-100">
                  {isAr ? "اكتمل استيراد الكتالوج بنجاح!" : "Catalog Migration Completed!"}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                  {isAr
                    ? `تم استيراد ${successCount} منتج، وتخطي ${skippedCount} مكرر، وتعذر ${failedCount}.`
                    : `Imported ${successCount} products, skipped ${skippedCount} duplicates, and ${failedCount} failed.`}
                </p>
                {importIssues.length > 0 && (
                  <p className="text-[11px] text-amber-600">
                    {isAr
                      ? "يمكن مراجعة العناصر المتخطاة وتصحيح الملف ثم إعادة المحاولة بأمان."
                      : "Review skipped items, correct the file, and safely retry."}
                  </p>
                )}
              </div>
              <Button
                onClick={() => setIsOpen(false)}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-500/10 hover:shadow-xl transition-all"
              >
                {isAr ? "عرض المنتجات المستوردة" : "View Imported Catalog"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProductsSection({
  products,
  variants,
  businessName,
  currency,
  onChanged,
  salesHistory,
}: {
  products: Product[];
  variants: Variant[];
  businessName: string | null;
  currency: string;
  onChanged: () => void;
  salesHistory: any[];
}) {
  const t = useT();
  const brand = useBrand();
  const brandId = brand.id;
  const [editing, setEditing] = useState<Product | null>(null);
  const [bomTargetProduct, setBomTargetProduct] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [dialogSession, setDialogSession] = useState(0);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "active" | "hidden">("all");
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [incubatorTransferModalOpen, setIncubatorTransferModalOpen] = useState(false);
  const [incubatorTransferProducts, setIncubatorTransferProducts] = useState<Product[]>([]);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

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
        ? Math.max(
            1,
            Math.min(
              45,
              Math.ceil(
                (new Date().getTime() - variantCreatedAt.getTime()) / (1000 * 60 * 60 * 24),
              ),
            ),
          )
        : 45;
      return sum + qtySold / daysElapsed;
    }, 0);
    return productDailyVelocity * 7;
  };

  const del = async (id: string) => {
    const product = products.find((item) => item.id === id);
    const { error } = await supabase.from("products").delete().eq("id", id).eq("brand_id", brandId);
    if (error) toast.error(error.message);
    else {
      const urls = new Set(
        [product?.image_url, ...(product?.media ?? []).map((item) => item.url)].filter(
          (url): url is string => Boolean(url),
        ),
      );
      for (const url of urls) void deletePublicMediaUrl(brandId, url).catch(() => undefined);
      toast.success(t("common.delete"));
      onChanged();
    }
  };

  const handleDuplicateProduct = async (productToDuplicate: Product) => {
    try {
      const copySuffixAr = " (نسخة)";
      const copySuffixEn = " (Copy)";
      const newName = `${productToDuplicate.name}${isAr ? copySuffixAr : copySuffixEn}`;
      const newNameAr = productToDuplicate.name_ar ? `${productToDuplicate.name_ar}${copySuffixAr}` : null;
      const newNameEn = productToDuplicate.name_en ? `${productToDuplicate.name_en}${copySuffixEn}` : null;

      const { data: insertedProduct, error: prodErr } = await (supabase.from("products") as any)
        .insert({
          brand_id: brandId,
          name: newName,
          name_ar: newNameAr,
          name_en: newNameEn,
          description: productToDuplicate.description,
          description_ar: productToDuplicate.description_ar,
          description_en: productToDuplicate.description_en,
          category: productToDuplicate.category,
          base_price: productToDuplicate.base_price,
          is_active: false,
          image_url: productToDuplicate.image_url,
          media: productToDuplicate.media,
          custom_fields: productToDuplicate.custom_fields,
          fabric_type: productToDuplicate.fabric_type,
          occasion: productToDuplicate.occasion,
        })
        .select()
        .single();

      if (prodErr || !insertedProduct) {
        toast.error(prodErr?.message || (isAr ? "فشل تكرار المنتج" : "Failed to duplicate product"));
        return;
      }

      const originalVariants = variants.filter((v) => v.product_id === productToDuplicate.id);
      if (originalVariants.length > 0) {
        const variantsPayload = originalVariants.map((v) => ({
          product_id: insertedProduct.id,
          brand_id: brandId,
          sku: v.sku ? `${v.sku}-COPY-${Math.floor(Math.random() * 1000)}` : null,
          barcode: null,
          size: v.size,
          color: v.color,
          fabric: v.fabric,
          selling_price: v.selling_price,
          cost_price: v.cost_price,
          stock_main: v.stock_main ?? 0,
          stock_incubator: 0,
        }));

        await (supabase.from("product_variants") as any).insert(variantsPayload);
      }

      toast.success(
        isAr
          ? "تم تكرار المنتج كمسودة بنجاح"
          : "Product duplicated as draft successfully",
      );
      onChanged();
    } catch (err: any) {
      toast.error(err?.message || (isAr ? "حدث خطأ أثناء التكرار" : "Error duplicating product"));
    }
  };

  const handlePreviewProduct = (product: Product) => {
    const url = `/${brand.slug}/p/${product.id}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleShareProduct = async (product: Product) => {
    const storeUrl = `${window.location.origin}/${brand.slug}/p/${product.id}`;
    const title = isAr ? product.name_ar || product.name : product.name_en || product.name;
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          url: storeUrl,
        });
        return;
      } catch {
        // user cancelled or fallback
      }
    }
    try {
      await navigator.clipboard.writeText(storeUrl);
      toast.success(isAr ? "تم نسخ رابط المنتج" : "Product link copied");
    } catch {
      toast.error(isAr ? "فشل نسخ الرابط" : "Failed to copy link");
    }
  };

  const isAr = useI18n().lang === "ar";
  const productStock = useCallback(
    (productId: string) =>
      variants
        .filter((variant) => variant.product_id === productId)
        .reduce(
          (sum, variant) =>
            sum + Number(variant.stock_main || 0) + Number(variant.stock_incubator || 0),
          0,
        ),
    [variants],
  );
  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const filteredProducts = products.filter((product) => {
    const productVariants = variants.filter((variant) => variant.product_id === product.id);
    const searchable = [
      product.name,
      product.name_ar,
      product.name_en,
      product.category,
      ...productVariants.flatMap((variant) => [
        variant.sku,
        variant.barcode,
        variant.size,
        variant.color,
      ]),
    ]
      .join(" ")
      .toLowerCase();
    const stock = productStock(product.id);
    return (
      (!normalizedSearch || searchable.includes(normalizedSearch)) &&
      (stockFilter === "all" ||
        (stockFilter === "out" ? stock <= 0 : stock < productWeeklySales(product.id))) &&
      (visibilityFilter === "all" ||
        (visibilityFilter === "active" ? product.is_active : !product.is_active))
    );
  });
  const totalUnits = products.reduce((sum, product) => sum + productStock(product.id), 0);

  const lowStock = products.filter((product) => {
    const stock = productStock(product.id);
    const weeklySales = productWeeklySales(product.id);
    return isLowStock(stock, weeklySales);
  }).length;

  const deadStock = variants.filter((v) => (salesByVariant.get(v.id) || 0) === 0).length;

  const printAll = async () => {
    const labels: LabelData[] = [];
    const [
      { data: freshProducts, error: productsError },
      { data: freshVariants, error: variantsError },
    ] = await Promise.all([
      supabase
        .from("products")
        .select("id, name")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false }),
      supabase
        .from("product_variants")
        .select("product_id, barcode, size, color, selling_price")
        .eq("brand_id", brandId)
        .not("barcode", "is", null)
        .order("created_at"),
    ]);

    if (productsError || variantsError) {
      toast.error(
        productsError?.message ??
          variantsError?.message ??
          (isAr ? "تعذر تحميل الباركودات" : "Could not load barcodes"),
      );
      return;
    }

    const printableProducts = (freshProducts ?? products) as Pick<Product, "id" | "name">[];
    const printableVariants = (freshVariants ?? variants) as Pick<
      Variant,
      "product_id" | "barcode" | "size" | "color" | "selling_price"
    >[];

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

  const variantsByProduct = useMemo(() => {
    const map: Record<string, Variant[]> = {};
    variants.forEach((v) => {
      if (!map[v.product_id]) map[v.product_id] = [];
      map[v.product_id].push(v);
    });
    return map;
  }, [variants]);

  const [scopeFilter, setScopeFilter] = useState<"all" | "low" | "out" | "featured" | "inactive">(
    "all",
  );
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");

  const scopeTabs: InventoryScopeTab[] = [
    {
      id: "all",
      label_en: "All Products",
      label_ar: "جميع المنتجات",
      count: products.length,
      icon: Package,
    },
    {
      id: "low",
      label_en: "Low Stock",
      label_ar: "مخزون منخفض",
      count: lowStock,
      icon: AlertTriangle,
    },
    {
      id: "out",
      label_en: "Out of Stock",
      label_ar: "نفد المخزون",
      count: products.filter((p) => isOutOfStock(productStock(p.id))).length,
      icon: Boxes,
    },
    {
      id: "featured",
      label_en: "Featured / Trending",
      label_ar: "المنتجات المميزة",
      count: products.filter((p) => p.featured_trending).length,
      icon: TrendingUp,
    },
    {
      id: "inactive",
      label_en: "Inactive / Hidden",
      label_ar: "مخفي وغير نشط",
      count: products.filter((p) => !p.is_active).length,
      icon: Search,
    },
  ];

  const categoriesQ = useQuery({
    queryKey: ["categories", brand.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from("categories") as any)
        .select("id, name_en, name_ar, slug")
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) return [];
      return (data ?? []) as Array<{
        id: string;
        name_en: string;
        name_ar: string | null;
        slug: string | null;
      }>;
    },
  });

  const categoryOptions = useMemo(() => {
    const categoriesSet = new Set<string>();
    products.forEach((p) => {
      if (p.category) categoriesSet.add(p.category);
    });

    const categoryLookup = new Map<string, { name_ar?: string | null; name_en?: string | null }>();
    (categoriesQ.data ?? []).forEach((c) => {
      if (c.slug) categoryLookup.set(c.slug.toLowerCase(), c);
      if (c.name_en) categoryLookup.set(c.name_en.toLowerCase(), c);
      if (c.name_ar) categoryLookup.set(c.name_ar.toLowerCase(), c);
    });

    return Array.from(categoriesSet).map((c) => {
      const match = categoryLookup.get(c.toLowerCase());
      return {
        id: c,
        name: match?.name_en || c,
        name_ar: match?.name_ar || match?.name_en || c,
      };
    });
  }, [products, categoriesQ.data]);

  const filteredDisplayProducts = useMemo(() => {
    const result = products.filter((product) => {
      const productVariants = variantsByProduct[product.id] || [];
      const searchable = [
        product.name,
        product.name_ar,
        product.name_en,
        product.category,
        ...productVariants.flatMap((variant) => [
          variant.sku,
          variant.barcode,
          variant.size,
          variant.color,
        ]),
      ]
        .join(" ")
        .toLowerCase();

      const stock = productStock(product.id);
      const matchesSearch = !normalizedSearch || searchable.includes(normalizedSearch);
      const matchesCategory = selectedCategory === "all" || product.category === selectedCategory;

      let matchesScope = true;
      if (scopeFilter === "low") matchesScope = isLowStock(stock, productWeeklySales(product.id));
      else if (scopeFilter === "out") matchesScope = isOutOfStock(stock);
      else if (scopeFilter === "featured") matchesScope = Boolean(product.featured_trending);
      else if (scopeFilter === "inactive") matchesScope = !product.is_active;

      return matchesSearch && matchesCategory && matchesScope;
    });

    if (sortBy === "price-asc") {
      result.sort((a, b) => (a.base_price || 0) - (b.base_price || 0));
    } else if (sortBy === "price-desc") {
      result.sort((a, b) => (b.base_price || 0) - (a.base_price || 0));
    } else if (sortBy === "stock-asc") {
      result.sort((a, b) => productStock(a.id) - productStock(b.id));
    }

    return result;
  }, [
    products,
    variantsByProduct,
    normalizedSearch,
    selectedCategory,
    scopeFilter,
    sortBy,
    productStock,
  ]);

  const filteredProductIds = filteredDisplayProducts.map((product) => product.id);
  const inventoryTotalPages = Math.max(1, Math.ceil(filteredDisplayProducts.length / pageSize));
  const safeInventoryPage = Math.min(page, inventoryTotalPages);
  const paginatedProducts = filteredDisplayProducts.slice(
    (safeInventoryPage - 1) * pageSize,
    safeInventoryPage * pageSize,
  );
  const paginatedProductIds = paginatedProducts.map((product) => product.id);
  useEffect(() => {
    setPage(1);
  }, [search, selectedCategory, scopeFilter, sortBy, pageSize]);
  useEffect(() => {
    if (page > inventoryTotalPages) setPage(inventoryTotalPages);
  }, [page, inventoryTotalPages]);
  const allFilteredProductsSelected =
    filteredProductIds.length > 0 && filteredProductIds.every((id) => selectedProductIds.has(id));
  const toggleSelectedProduct = (productId: string) =>
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  const toggleVisibleProducts = () =>
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (paginatedProductIds.every((id) => next.has(id))) {
        paginatedProductIds.forEach((id) => next.delete(id));
      } else {
        paginatedProductIds.forEach((id) => next.add(id));
      }
      return next;
    });
  const deleteSelectedProducts = async () => {
    const ids = [...selectedProductIds];
    if (ids.length === 0) return;
    const selectedProducts = products.filter((product) => selectedProductIds.has(product.id));
    setBulkDeleting(true);
    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("brand_id", brandId)
        .in("id", ids);
      if (error) throw error;
      const mediaUrls = new Set(
        selectedProducts
          .flatMap((product) => [
            product.image_url,
            ...(product.media ?? []).map((item) => item.url),
          ])
          .filter((url): url is string => Boolean(url)),
      );
      for (const url of mediaUrls) void deletePublicMediaUrl(brandId, url).catch(() => undefined);
      toast.success(isAr ? `تم حذف ${ids.length} منتج` : `${ids.length} products deleted`);
      setSelectedProductIds(new Set());
      setBulkDeleteOpen(false);
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isAr
            ? "تعذر حذف المنتجات"
            : "Could not delete products",
      );
    } finally {
      setBulkDeleting(false);
    }
  };

  const activeFilterCount = (selectedCategory !== "all" ? 1 : 0) + (search ? 1 : 0);

  return (
    <div className="space-y-3.5">
      {/* 1. Integrated Command Header */}
      <InventoryCommandHeader
        lang={isAr ? "ar" : "en"}
        productCount={products.length}
        isCourier={false}
        onCreateNew={() => {
          setEditing(null);
          setDialogSession((v) => v + 1);
          setOpen(true);
        }}
        renderImporters={
          <div className="flex flex-col gap-1 p-1">
            <ProductImporterModal brandId={brandId} onComplete={onChanged} />
            <Button
              variant="ghost"
              size="sm"
              onClick={printAll}
              className="justify-start text-xs font-semibold"
            >
              <Printer className="h-3.5 w-3.5 me-2" />
              {isAr ? "طباعة جميع الباركودات" : "Print All Barcodes"}
            </Button>
          </div>
        }
      />

      {/* 2. Operational Scope Switcher */}
      <InventoryScopeSwitcher
        lang={isAr ? "ar" : "en"}
        tabs={scopeTabs}
        activeTab={scopeFilter}
        onTabChange={(tabId) => setScopeFilter(tabId as any)}
      />

      {/* 3. Compact Command Toolbar */}
      <InventoryToolbar
        lang={isAr ? "ar" : "en"}
        search={search}
        onSearchChange={setSearch}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        categories={categoryOptions}
        sortBy={sortBy}
        onSortChange={setSortBy}
        activeFilterCount={activeFilterCount}
        onClearFilters={() => {
          setSearch("");
          setSelectedCategory("all");
          setScopeFilter("all");
        }}
      />

      <BulkSelectionToolbar
        lang={isAr ? "ar" : "en"}
        entityAr="منتج"
        entityEn="products"
        selectedCount={selectedProductIds.size}
        allFilteredSelected={allFilteredProductsSelected}
        disabled={bulkDeleting || filteredDisplayProducts.length === 0}
        onSelectAll={() =>
          setSelectedProductIds((current) => {
            const next = new Set(current);
            filteredProductIds.forEach((id) => next.add(id));
            return next;
          })
        }
        onDeselectAll={() => setSelectedProductIds(new Set())}
        onDeleteSelected={() => setBulkDeleteOpen(true)}
        onTransferToIncubator={() => {
          const selectedProds = products.filter((p) => selectedProductIds.has(p.id));
          if (selectedProds.length > 0) {
            setIncubatorTransferProducts(selectedProds);
            setIncubatorTransferModalOpen(true);
          }
        }}
      />

      {filteredDisplayProducts.length === 0 && (
        <OsEmptyState
          icon={Package}
          compact
          title={isAr ? "لا توجد منتجات مطابقة" : "No matching products"}
          description={
            products.length === 0
              ? isAr
                ? "ابدأ بإضافة أول منتج إلى مخزون المتجر."
                : "Add the first product to your store inventory."
              : isAr
                ? "غيّر البحث أو الفلاتر لعرض منتجات أخرى."
                : "Change the search or filters to see other products."
          }
          action={
            <Button
              type="button"
              onClick={() => {
                if (products.length === 0) {
                  setEditing(null);
                  setDialogSession((value) => value + 1);
                  setOpen(true);
                } else {
                  setSearch("");
                  setSelectedCategory("all");
                  setScopeFilter("all");
                }
              }}
            >
              {products.length === 0
                ? isAr
                  ? "إضافة منتج"
                  : "Add Product"
                : isAr
                  ? "مسح الفلاتر"
                  : "Clear Filters"}
            </Button>
          }
        />
      )}

      {/* 4. Mobile Purpose-Built Product Cards */}
      <div className="space-y-3 block sm:hidden" hidden={filteredDisplayProducts.length === 0}>
        {paginatedProducts.map((p) => {
          const pVariants = variantsByProduct[p.id] || [];
          const totalStock = productStock(p.id);
          const minPrice =
            pVariants.length > 0
              ? Math.min(...pVariants.map((v) => Number(v.selling_price || 0)))
              : Number(p.base_price || 0);

          return (
            <InventoryMobileCard
              key={p.id}
              lang={isAr ? "ar" : "en"}
              product={p}
              variants={pVariants}
              totalStock={totalStock}
              minPrice={minPrice}
              currency={currency}
              onEdit={(prod) => {
                setEditing(prod);
                setDialogSession((v) => v + 1);
                setOpen(true);
              }}
              onDelete={(id) => setProductToDelete(id)}
              onPrintLabel={(prod) => {
                const labels: LabelData[] = (variantsByProduct[prod.id] || [])
                  .filter((v) => Boolean(v.barcode))
                  .map((v) => ({
                    code: v.barcode!,
                    productName: prod.name,
                    size: v.size,
                    color: v.color,
                    price: v.selling_price,
                    businessName,
                  }));
                if (labels.length > 0) printLabels(labels);
                else
                  toast.error(isAr ? "لا يوجد باركود لهذا المنتج" : "No barcode for this product");
              }}
              onTransferToIncubator={(prod) => {
                setIncubatorTransferProducts([prod]);
                setIncubatorTransferModalOpen(true);
              }}
              onDuplicate={handleDuplicateProduct}
              onPreview={handlePreviewProduct}
              onShare={handleShareProduct}
              renderVariantList={(prod) => (
                <VariantList
                  productId={prod.id}
                  productName={prod.name}
                  businessName={businessName}
                  variants={variantsByProduct[prod.id] || []}
                  onChanged={onChanged}
                  salesByVariant={salesByVariant}
                  product={prod}
                />
              )}
              selected={selectedProductIds.has(p.id)}
              onToggleSelected={toggleSelectedProduct}
            />
          );
        })}
      </div>

      {/* 5. Desktop High-Density Work Queue */}
      <div className={filteredDisplayProducts.length === 0 ? "hidden" : "hidden sm:block"}>
        <InventoryWorkQueue
          lang={isAr ? "ar" : "en"}
          products={paginatedProducts}
          variantsByProduct={variantsByProduct}
          currency={currency}
          isLoading={false}
          isError={false}
          onEdit={(prod) => {
            setEditing(prod);
            setDialogSession((v) => v + 1);
            setOpen(true);
          }}
          onDelete={(id) => setProductToDelete(id)}
          onPrintLabel={(prod) => {
            const labels: LabelData[] = (variantsByProduct[prod.id] || [])
              .filter((v) => Boolean(v.barcode))
              .map((v) => ({
                code: v.barcode!,
                productName: prod.name,
                size: v.size,
                color: v.color,
                price: v.selling_price,
                businessName,
              }));
            if (labels.length > 0) printLabels(labels);
            else toast.error(isAr ? "لا يوجد باركود لهذا المنتج" : "No barcode for this product");
          }}
          onConfigureBom={(prod) => setBomTargetProduct(prod)}
          onTransferToIncubator={(prod) => {
            setIncubatorTransferProducts([prod]);
            setIncubatorTransferModalOpen(true);
          }}
          onDuplicate={handleDuplicateProduct}
          onPreview={handlePreviewProduct}
          onShare={handleShareProduct}
          renderVariantList={(prod) => (
            <VariantList
              productId={prod.id}
              productName={prod.name}
              businessName={businessName}
              variants={variantsByProduct[prod.id] || []}
              onChanged={onChanged}
              salesByVariant={salesByVariant}
              product={prod}
            />
          )}
          selectedProductIds={selectedProductIds}
          onToggleProduct={toggleSelectedProduct}
          onToggleAll={toggleVisibleProducts}
        />
      </div>

      <ListPagination
        lang={isAr ? "ar" : "en"}
        entityAr="منتج"
        entityEn="Products"
        totalItems={filteredDisplayProducts.length}
        page={safeInventoryPage}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isAr
                ? `حذف ${selectedProductIds.size} منتج؟`
                : `Delete ${selectedProductIds.size} products?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isAr
                ? "سيتم حذف المنتجات المحددة ومتغيراتها ومخزونها نهائياً. لا يمكن التراجع عن هذا الإجراء."
                : "The selected products, their variants, and inventory will be permanently deleted. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>
              {isAr ? "إلغاء" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void deleteSelectedProducts();
              }}
            >
              {bulkDeleting
                ? isAr
                  ? "جاري الحذف..."
                  : "Deleting..."
                : isAr
                  ? "تأكيد الحذف"
                  : "Confirm Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!productToDelete}
        onOpenChange={(open) => !open && setProductToDelete(null)}
      >
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {isAr
                ? "هل أنت متأكد من رغبتك في حذف هذا المنتج نهائياً؟ لا يمكن التراجع عن هذا الإجراء."
                : "Are you sure you want to permanently delete this product? This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setProductToDelete(null)}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (productToDelete) {
                  void del(productToDelete);
                  setProductToDelete(null);
                }
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
      >
        <ProductDialog
          key={`${editing?.id ?? "new"}-${dialogSession}`}
          product={editing}
          onSaved={() => {
            setOpen(false);
            setEditing(null);
            onChanged();
          }}
        />
      </Dialog>

      {bomTargetProduct && (
        <ProductBomModal
          open={!!bomTargetProduct}
          onOpenChange={(open) => {
            if (!open) setBomTargetProduct(null);
          }}
          productId={bomTargetProduct.id}
          productName={bomTargetProduct.name}
          directPackagingCost={Number((bomTargetProduct as any).direct_packaging_cost || 0)}
          onSaved={onChanged}
        />
      )}

      {incubatorTransferModalOpen && (
        <BatchIncubatorTransferModal
          open={incubatorTransferModalOpen}
          onOpenChange={setIncubatorTransferModalOpen}
          targetProducts={incubatorTransferProducts}
          variantsByProduct={variantsByProduct}
          onSuccess={() => {
            setSelectedProductIds(new Set());
            void onChanged();
          }}
        />
      )}
    </div>
  );
}

const CUSTOMIZER_PRESETS = {
  print: {
    label_en: "Print / Stamp Shop Preset",
    label_ar: "نموذج مطبعة / متجر أختام",
    fields: [
      {
        key: "stamp_size",
        label_ar: "مقاس الختم / الطباعة",
        label_en: "Stamp/Print Size Swatches",
        type: "select",
        options: ["Q13 (13*49mm)", "Q20 (20*20mm)", "Q30 (30*30mm)"],
        required: true,
      },
      {
        key: "ink_color",
        label_ar: "لون الحبر",
        label_en: "Ink/Color Picker",
        type: "select",
        options: ["Black", "Blue", "Red", "Green"],
        required: true,
      },
      {
        key: "logo_upload",
        label_ar: "تحميل شعار الختم / التصميم",
        label_en: "Upload Logo File Input",
        type: "file",
        options: [],
        required: false,
      },
      {
        key: "custom_note",
        label_ar: "نص الكتابة المطلوب للختم",
        label_en: "Custom Note Text Area",
        type: "text",
        options: [],
        required: false,
      },
    ],
  },
  fashion: {
    label_en: "Fashion / Abaya Preset",
    label_ar: "نموذج أزياء / عبايات",
    fields: [
      {
        key: "length",
        label_ar: "الطول",
        label_en: "Length",
        type: "text",
        options: [],
        required: false,
      },
      {
        key: "bust",
        label_ar: "الصدر",
        label_en: "Bust",
        type: "text",
        options: [],
        required: false,
      },
      {
        key: "sleeve",
        label_ar: "الكم",
        label_en: "Sleeve",
        type: "text",
        options: [],
        required: false,
      },
      {
        key: "shoulder",
        label_ar: "الكتف",
        label_en: "Shoulder",
        type: "text",
        options: [],
        required: false,
      },
    ],
  },
  passport_abaya: {
    label_en: "Fit Passport — Abaya",
    label_ar: "Fit Passport — عباية",
    fields: [
      {
        key: "passport_abaya_length",
        label_ar: "الطول",
        label_en: "Length",
        type: "number",
        options: [],
        required: true,
      },
      {
        key: "passport_abaya_bust",
        label_ar: "الصدر",
        label_en: "Bust",
        type: "number",
        options: [],
        required: true,
      },
      {
        key: "passport_abaya_sleeve",
        label_ar: "طول الكم",
        label_en: "Sleeve length",
        type: "number",
        options: [],
        required: true,
      },
      {
        key: "passport_abaya_shoulder",
        label_ar: "عرض الكتف",
        label_en: "Shoulder",
        type: "number",
        options: [],
        required: true,
      },
      {
        key: "passport_abaya_waist",
        label_ar: "الخصر (اختياري)",
        label_en: "Waist (optional)",
        type: "number",
        options: [],
        required: false,
      },
      {
        key: "passport_abaya_hips",
        label_ar: "الأرداف (اختياري)",
        label_en: "Hips (optional)",
        type: "number",
        options: [],
        required: false,
      },
      {
        key: "passport_abaya_arm_width",
        label_ar: "عرض الذراع (اختياري)",
        label_en: "Arm width (optional)",
        type: "number",
        options: [],
        required: false,
      },
    ],
  },
  passport_dress: {
    label_en: "Fit Passport — Dress",
    label_ar: "Fit Passport — فستان",
    fields: [
      {
        key: "passport_dress_length",
        label_ar: "الطول",
        label_en: "Length",
        type: "number",
        options: [],
        required: true,
      },
      {
        key: "passport_dress_bust",
        label_ar: "الصدر",
        label_en: "Bust",
        type: "number",
        options: [],
        required: true,
      },
      {
        key: "passport_dress_waist",
        label_ar: "الخصر",
        label_en: "Waist",
        type: "number",
        options: [],
        required: true,
      },
      {
        key: "passport_dress_shoulder",
        label_ar: "عرض الكتف",
        label_en: "Shoulder",
        type: "number",
        options: [],
        required: true,
      },
      {
        key: "passport_dress_sleeve",
        label_ar: "طول الكم (اختياري)",
        label_en: "Sleeve length (optional)",
        type: "number",
        options: [],
        required: false,
      },
      {
        key: "passport_dress_hips",
        label_ar: "الأرداف (اختياري)",
        label_en: "Hips (optional)",
        type: "number",
        options: [],
        required: false,
      },
      {
        key: "passport_dress_arm_width",
        label_ar: "عرض الذراع (اختياري)",
        label_en: "Arm width (optional)",
        type: "number",
        options: [],
        required: false,
      },
    ],
  },
  gift: {
    label_en: "Gift / Perfume Preset",
    label_ar: "نموذج هدايا / عطور",
    fields: [
      {
        key: "gift_box",
        label_ar: "إضافة صندوق هدايا فاخر",
        label_en: "Gift Box Add-On (+X BHD)",
        type: "select",
        options: ["No / لا", "Yes (+2.000 BHD) / نعم (+2.000 د.ب)"],
        required: true,
      },
      {
        key: "greeting_card",
        label_ar: "نص كرت الإهداء",
        label_en: "Greeting Card Message Text Area",
        type: "text",
        options: [],
        required: false,
      },
    ],
  },
  jewelry: {
    label_en: "Jewelry / Engraving Preset",
    label_ar: "نموذج مجوهرات / حفر",
    fields: [
      {
        key: "engraving_text",
        label_ar: "النص المطلوب للحفر",
        label_en: "Custom Engraving Text",
        type: "text",
        options: [],
        required: false,
      },
      {
        key: "font_style",
        label_ar: "خط الكتابة",
        label_en: "Font Style Selector",
        type: "select",
        options: ["Arabic Calligraphy / ديواني", "Classic Serif", "Modern Sans-Serif"],
        required: false,
      },
      {
        key: "material_swatch",
        label_ar: "نوع المعدن",
        label_en: "Material/Metal Swatch",
        type: "select",
        options: ["Gold / ذهب", "Silver / فضة", "Rose Gold / روز جولد"],
        required: true,
      },
    ],
  },
};

function cleanPassportCustomFields(fields: CustomField[]) {
  const passportMode = fields.some((field) => field.key.includes("passport_"));
  if (!passportMode) return fields;
  return fields.filter(
    (field) => field.key.includes("passport_") || !matchCustomFieldToMeasurement(field),
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
    base_price: product?.base_price ? String(product.base_price) : "0",
    cost_price: product?.cost_price ? String(product.cost_price) : "0",
    image_url: product?.image_url ?? "",
    is_active: product?.is_active ?? false,
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
    fabric_type: (product as any)?.fabric_type ?? "",
    occasion: (product as any)?.occasion ?? "",
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
      is_active: product?.is_active ?? false,
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
      fabric_type: (product as any)?.fabric_type ?? "",
      occasion: (product as any)?.occasion ?? "",
    });
    setErrors({});
    setActiveDialogTab("basic");
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

  const handleFilePicked = (file: File) => {
    if (file.type.startsWith("video")) {
      const ext = file.name.split(".").pop() ?? "mp4";
      setPendingVideo(file);
      void uploadBlob(file, ext, "video").finally(() => setPendingVideo(null));
      return;
    }
    setPendingImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setCropSrc(String(reader.result));
    reader.readAsDataURL(file);
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
    if (!form.cost_price.trim() || isNaN(Number(form.cost_price)) || Number(form.cost_price) < 0) {
      newErrors.cost = isAr ? "أدخل تكلفة صحيحة" : "Enter a valid non-negative cost";
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

    if (product) {
      if (form.is_active) {
        const { count, error: variantCountError } = await supabase
          .from("product_variants")
          .select("id", { count: "exact", head: true })
          .eq("product_id", product.id);
        if (variantCountError) return toast.error(variantCountError.message);
        if (!count) {
          setActiveDialogTab("basic");
          return toast.error(
            isAr
              ? "أضف متغيراً واحداً على الأقل قبل تفعيل المنتج في المتجر."
              : "Add at least one variant before activating this product in the storefront.",
          );
        }
      }
      const patch = {
        name: legacyName,
        name_ar: nameAr || null,
        name_en: nameEn || null,
        description: legacyDesc,
        description_ar: form.description_ar.trim() || null,
        description_en: form.description_en.trim() || null,
        category: form.category,
        base_price: form.base_price ? Number(form.base_price) : 0,
        cost_price: form.cost_price ? Number(form.cost_price) : 0,
        image_url: form.image_url,
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
        fabric_type: (form.fabric_type || "").trim() || null,
        occasion: (form.occasion || "").trim() || null,
      };
      const { error } = await supabase.from("products").update(patch).eq("id", product.id);
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
        base_price: form.base_price ? Number(form.base_price) : 0,
        cost_price: form.cost_price ? Number(form.cost_price) : 0,
        image_url: form.image_url,
        // A product without variants cannot be purchased. Keep new products
        // hidden until inventory has been configured explicitly.
        is_active: false,
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
        fabric_type: (form.fabric_type || "").trim() || null,
        occasion: (form.occasion || "").trim() || null,
      };
      const { error } = await (supabase.from("products") as any).insert(payload);
      if (error) return toast.error(error.message);
    }
    for (const url of removedCommittedMedia.current) {
      void deletePublicMediaUrl(brand.id, url).catch(() => undefined);
    }
    removedCommittedMedia.current.clear();
    uncommittedUploads.current.clear();
    toast.success(
      !product
        ? isAr
          ? "تم حفظ المنتج كمخفي. أضف المتغيرات ثم فعّله من تعديل المنتج."
          : "Product saved as hidden. Add variants, then activate it from Edit product."
        : t("common.save"),
    );
    onSaved();
  };

  return (
    <DialogContent className="max-h-[92vh] md:max-w-3xl p-0 flex flex-col rounded-2xl border border-border/80 shadow-2xl bg-background overflow-hidden">
      {/* Header with gradient bar and stepper indicators */}
      <div className="relative border-b border-border/60 bg-secondary/20 p-5 pb-4">
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
              <Label className="text-xs font-bold text-muted-foreground">
                {t("inventory.category")}
              </Label>
              <div className="mt-1">
                {(categoriesQ.data ?? []).length > 0 ? (
                  <select
                    className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:ring-1 focus:ring-primary outline-none"
                    value={form.category}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-bold text-muted-foreground">
                  {isAr ? "نوع القماش" : "Fabric Type"}
                </Label>
                <Input
                  className="mt-1 h-10.5 rounded-lg"
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
                    className="w-full h-10.5 rounded-lg border border-input bg-background px-3 text-sm focus:ring-1 focus:ring-primary outline-none"
                    value={form.occasion}
                    onChange={(e) => setForm({ ...form, occasion: e.target.value })}
                  >
                    <option value="">{isAr ? "اختر المناسبة..." : "Select occasion..."}</option>
                    <option value="يومي">{isAr ? "يومي" : "Daily"}</option>
                    <option value="سهرة">{isAr ? "سهرة" : "Evening"}</option>
                    <option value="مناسبات">{isAr ? "مناسبات" : "Occasions"}</option>
                    <option value="إطلالة رسمية">{isAr ? "إطلالة رسمية" : "Formal"}</option>
                  </select>
                </div>
              </div>
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
                {isAr ? "تكلفة الوحدة (د.ب)" : "Unit Cost (BHD)"}
              </Label>
              <Input
                type="number"
                step="0.001"
                min="0"
                className={`mt-1 h-10.5 rounded-lg ${errors.cost ? "border-destructive" : ""}`}
                placeholder="0.000"
                value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
              />
              {errors.cost && <p className="mt-1 text-xs text-destructive">{errors.cost}</p>}
              <p className="mt-1.5 text-xs text-muted-foreground">
                {isAr
                  ? "تُورّث للمتغيرات وتُحتسب ضمن تكلفة البضاعة المباعة عند البيع، وليست مصروفاً فورياً."
                  : "Inherited by variants and recognized as COGS when sold; it is not an immediate expense."}
              </p>
            </div>
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

            <div className="flex items-center justify-between rounded-xl border border-border/80 p-4 bg-secondary/10 transition hover:bg-secondary/20">
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
                  disabled={!product}
                  aria-label={isAr ? "إظهار المنتج في المتجر" : "Show product in storefront"}
                />
              </div>
            </div>
            {!product && (
              <p className="-mt-2 text-xs text-amber-700 dark:text-amber-400">
                {isAr
                  ? "سيُحفظ المنتج كمخفي. أضف متغيراً واحداً على الأقل، ثم فعّله من تعديل المنتج."
                  : "This product will be saved as hidden. Add at least one variant, then activate it from Edit product."}
              </p>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-xl border border-border/80 p-4 bg-secondary/10 transition hover:bg-secondary/20">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {isAr ? "إبراز في الرائج الآن" : "Feature in Trending now"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isAr
                      ? "يعطي المنتج أولوية للعملاء."
                      : "Prioritizes this product for discovery."}
                  </p>
                </div>
                <Switch
                  checked={form.featured_trending}
                  onCheckedChange={(v) => setForm({ ...form, featured_trending: v })}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/80 p-4 bg-secondary/10 transition hover:bg-secondary/20">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {isAr ? "إظهار شارة التنزيلات" : "Show Sale badge"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isAr
                      ? "تظهر عند وجود سعر أصلي أعلى."
                      : "Shown when an original price is higher."}
                  </p>
                </div>
                <Switch
                  checked={form.show_sale_badge}
                  onCheckedChange={(v) => setForm({ ...form, show_sale_badge: v })}
                />
              </div>
            </div>

            {/* 🏷️ Custom Variant Labels Section */}
            <div className="rounded-xl border border-border/80 p-5 bg-secondary/10 space-y-4">
              <div>
                <p className="text-sm font-bold text-foreground">
                  {isAr ? "🏷️ مسميات المتغيرات المخصصة" : "🏷️ Custom Variant Labels"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAr
                    ? "تخصيص أسماء أعمدة المقاس، اللون، والخامة لتظهر بالاسم المفضل في صفحة عرض المنتج باللغتين العربية والإنجليزية."
                    : "Override default column labels (Size, Color, Fabric) to match your custom product's options in both Arabic and English."}
                </p>
              </div>
              <div className="space-y-4.5">
                {/* Size Label */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 border-b border-border/40 pb-3">
                  <div>
                    <Label className="text-xs font-bold text-muted-foreground">
                      {isAr ? "مسمى المقاس بالعربية (مثال: التصميم)" : "Custom Size Label — Arabic"}
                    </Label>
                    <Input
                      className="mt-1 h-9.5 rounded-lg text-xs"
                      placeholder={isAr ? "المقاس / خيار" : "Size / Option"}
                      value={form.variant_label_size_ar || ""}
                      onChange={(e) => setForm({ ...form, variant_label_size_ar: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-muted-foreground">
                      {isAr
                        ? "مسمى المقاس بالإنجليزية (مثال: Stamp Size)"
                        : "Custom Size Label — English"}
                    </Label>
                    <Input
                      className="mt-1 h-9.5 rounded-lg text-xs"
                      placeholder="Size / Option"
                      value={form.variant_label_size_en || ""}
                      onChange={(e) => setForm({ ...form, variant_label_size_en: e.target.value })}
                    />
                  </div>
                </div>

                {/* Color Label */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 border-b border-border/40 pb-3">
                  <div>
                    <Label className="text-xs font-bold text-muted-foreground">
                      {isAr ? "مسمى اللون بالعربية" : "Custom Color Label — Arabic"}
                    </Label>
                    <Input
                      className="mt-1 h-9.5 rounded-lg text-xs"
                      placeholder={isAr ? "اللون" : "Color"}
                      value={form.variant_label_color_ar || ""}
                      onChange={(e) => setForm({ ...form, variant_label_color_ar: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-muted-foreground">
                      {isAr ? "مسمى اللون بالإنجليزية" : "Custom Color Label — English"}
                    </Label>
                    <Input
                      className="mt-1 h-9.5 rounded-lg text-xs"
                      placeholder="Color"
                      value={form.variant_label_color_en || ""}
                      onChange={(e) => setForm({ ...form, variant_label_color_en: e.target.value })}
                    />
                  </div>
                </div>

                {/* Fabric Label */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs font-bold text-muted-foreground">
                      {isAr ? "مسمى الخامة بالعربية" : "Custom Fabric Label — Arabic"}
                    </Label>
                    <Input
                      className="mt-1 h-9.5 rounded-lg text-xs"
                      placeholder={isAr ? "الخامة" : "Fabric"}
                      value={form.variant_label_fabric_ar || ""}
                      onChange={(e) =>
                        setForm({ ...form, variant_label_fabric_ar: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-muted-foreground">
                      {isAr ? "مسمى الخامة بالإنجليزية" : "Custom Fabric Label — English"}
                    </Label>
                    <Input
                      className="mt-1 h-9.5 rounded-lg text-xs"
                      placeholder="Fabric"
                      value={form.variant_label_fabric_en || ""}
                      onChange={(e) =>
                        setForm({ ...form, variant_label_fabric_en: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
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
                      <span className="absolute top-2 start-2 bg-black/80 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
                        {m.type === "video"
                          ? isAr
                            ? "🎬 فيديو"
                            : "🎬 Video"
                          : isAr
                            ? "📷 صورة"
                            : "📷 Image"}
                      </span>
                      {i === 0 && (
                        <span className="absolute top-2 end-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded shadow">
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
                        <span className="text-[10px] text-muted-foreground block">
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
                <div>
                  <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    <span>
                      {isAr ? "⚙️ محرك تصميم وتخصيص المنتج" : "⚙️ Product Customization Engine"}
                    </span>
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary uppercase">
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
                      const preset =
                        CUSTOMIZER_PRESETS[presetKey as keyof typeof CUSTOMIZER_PRESETS];
                      if (preset) {
                        const isPassportPreset =
                          presetKey === "passport_abaya" || presetKey === "passport_dress";
                        const retainedFields = isPassportPreset
                          ? (form.custom_fields ?? []).filter(
                              (field) =>
                                !field.key.includes("passport_") &&
                                !matchCustomFieldToMeasurement(field),
                            )
                          : (form.custom_fields ?? []);
                        setForm({
                          ...form,
                          custom_fields: [
                            ...retainedFields,
                            ...preset.fields.map(
                              (f, index) =>
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
                      <SelectItem value="print">
                        {isAr ? "أختام وطباعة" : "Print / Stamp Shop"}
                      </SelectItem>
                      <SelectItem value="fashion">
                        {isAr ? "عبايات وأزياء" : "Fashion / Abaya"}
                      </SelectItem>
                      <SelectItem value="passport_abaya">
                        {isAr ? "📏 مقاسات Passport — عباية" : "📏 Fit Passport — Abaya"}
                      </SelectItem>
                      <SelectItem value="passport_dress">
                        {isAr ? "📏 مقاسات Passport — فستان" : "📏 Fit Passport — Dress"}
                      </SelectItem>
                      <SelectItem value="gift">
                        {isAr ? "عطور وهدايا" : "Gift / Perfume"}
                      </SelectItem>
                      <SelectItem value="jewelry">
                        {isAr ? "مجوهرات وحفر" : "Jewelry / Engraving"}
                      </SelectItem>
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

              {(form.custom_fields ?? []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground border-2 border-dashed border-border/70 rounded-xl bg-background/50">
                  <Sliders className="h-8 w-8 opacity-40 mb-2.5 text-muted-foreground" />
                  <span className="text-xs font-bold text-foreground">
                    {isAr ? "لا توجد خيارات مخصصة مفعلة" : "No custom options configured yet"}
                  </span>
                  <span className="text-[10px] opacity-75 mt-1">
                    {isAr
                      ? "استخدم النماذج السريعة بالأعلى لتعبئة الحقول بضغطة زر!"
                      : "Use the dropdown template presets above to populate in 1-click!"}
                  </span>
                </div>
              ) : (
                <div className="space-y-4">
                  {(() => {
                    const passportType: FitProfileType | null = (form.custom_fields ?? []).some(
                      (field) => field.key.includes("passport_dress"),
                    )
                      ? "dress"
                      : (form.custom_fields ?? []).some((field) =>
                            field.key.includes("passport_abaya"),
                          )
                        ? "abaya"
                        : null;
                    if (!passportType) return null;
                    return (
                      <div className="rounded-2xl border border-primary/25 bg-primary/[0.045] p-4 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-primary">
                              Pura Fit Passport ·{" "}
                              {passportType === "abaya"
                                ? isAr
                                  ? "عباية"
                                  : "Abaya"
                                : isAr
                                  ? "فستان"
                                  : "Dress"}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {isAr
                                ? "هذا المنتج يستخدم ملف المقاسات المحفوظ، ولا يعرض حقول قياس مكررة للعميل."
                                : "This product uses the saved fit profile without showing duplicate measurement fields."}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setForm({
                                ...form,
                                custom_fields: (form.custom_fields ?? []).filter(
                                  (field) => !field.key.includes("passport_"),
                                ),
                              })
                            }
                          >
                            {isAr ? "إزالة Passport" : "Remove Passport"}
                          </Button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {FIT_PROFILE_FIELDS[passportType].map(([key, ar, en, required]) => (
                            <span
                              key={key}
                              className="rounded-full border bg-background px-2.5 py-1 text-[11px]"
                            >
                              {isAr ? ar : en} ·{" "}
                              {required
                                ? isAr
                                  ? "إجباري"
                                  : "Required"
                                : isAr
                                  ? "اختياري"
                                  : "Optional"}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {(form.custom_fields ?? [])
                    .map((field, index) => ({ field, index }))
                    .filter(
                      ({ field }) =>
                        !field.key.includes("passport_") &&
                        (!(form.custom_fields ?? []).some((entry) =>
                          entry.key.includes("passport_"),
                        ) ||
                          !matchCustomFieldToMeasurement(field)),
                    )
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
                          <div className="rounded-lg bg-muted/40 p-3 border border-dashed border-border/60 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
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
                                  <span className="text-[10px] font-bold">
                                    {isAr
                                      ? "انقر لرفع ملف مخصص (.pdf, .png, .jpg)"
                                      : "Click to upload custom file (.pdf, .png, .jpg)"}
                                  </span>
                                </div>
                              )}
                              {f.type === "select" && (
                                <div className="flex flex-wrap gap-1.5 pt-0.5">
                                  {(f.options ?? []).length === 0 ? (
                                    <span className="text-[11px] text-muted-foreground italic">
                                      {isAr ? "لا توجد خيارات بعد" : "No options specified yet"}
                                    </span>
                                  ) : (
                                    (f.options ?? []).map((opt) => (
                                      <div
                                        key={opt}
                                        className="rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-bold text-foreground shadow-sm"
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
                            className="flex items-center justify-between border-t border-border/40 pt-3 text-xs"
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
                                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-7 text-[11px] rounded font-bold touch-manipulation"
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
      <div className="border-t border-border/60 bg-secondary/20 px-6 py-4.5 flex items-center justify-between">
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
    </DialogContent>
  );
}

type BulkVariantRow = {
  size: string;
  size_unit: string;
  color: string;
  fabric: string;
  sku: string;
  barcode: string;
  cost_price: number;
  selling_price: number;
  sale_price: string;
  stock_main: number;
  stock_incubator: number;
};

function BulkVariantDialog({
  productId,
  product,
  variants,
  canViewFinancials,
  onChanged,
}: {
  productId: string;
  product?: Product;
  variants: Variant[];
  canViewFinancials: boolean;
  onChanged: () => void;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const existingSku = variants.find((v) => v.sku)?.sku || "";
  const blank: VariantGenerationPlan = {
    base_sku: existingSku,
    sizes: [],
    colors: [],
    fabric: "",
    size_unit: "",
    cost_price: Number(product?.cost_price ?? 0),
    selling_price: Number(product?.base_price ?? 0),
    stock_main: 0,
    stock_incubator: 0,
    size_stock_map: {},
  };
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<VariantGenerationPlan>(blank);
  const [salePriceText, setSalePriceText] = useState("");
  const [sizesText, setSizesText] = useState("");
  const [colorsText, setColorsText] = useState("");
  const [rows, setRows] = useState<BulkVariantRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Batch action state
  const [batchMainStock, setBatchMainStock] = useState<string>("");
  const [batchIncubatorStock, setBatchIncubatorStock] = useState<string>("");
  const [batchSalePrice, setBatchSalePrice] = useState<string>("");

  const applyPlan = (next: VariantGenerationPlan) => {
    setPlan(next);
    setSalePriceText(
      next.selling_price > 0 && next.selling_price < Number(product?.base_price ?? 0)
        ? String(next.selling_price)
        : "",
    );
    setSizesText(next.sizes.join(", "));
    setColorsText(next.colors.join(", "));
    setRows([]);
  };

  const applyPreset = (preset: (typeof SIZING_PRESETS)[number]) => {
    setSizesText(preset.sizes.join(", "));
    if (preset.unit) {
      setPlan((prev) => ({ ...prev, size_unit: preset.unit }));
    }
  };

  const parseWithAi = async () => {
    if (prompt.trim().length < 2)
      return toast.error(isAr ? "اكتب وصفاً للمتغيرات أولاً" : "Describe the variants first");
    setParsing(true);
    try {
      const productTitle = product?.name_ar || product?.name_en || product?.name || "";
      const result = await parseVariantPrompt({
        data: {
          prompt,
          language: isAr ? "ar" : "en",
          product_title: productTitle,
          base_sku: plan.base_sku || existingSku,
          base_price: Number(product?.base_price ?? 0),
          cost_price: Number(product?.cost_price ?? 0),
        },
      });
      applyPlan(result);
      const sizeCount = result.sizes.length || 0;
      const colorCount = result.colors.length || 0;
      let toastMsg = "";
      if (isAr) {
        if (sizeCount > 0 && colorCount > 0) {
          toastMsg = `تم استخراج ${sizeCount} مقاس و ${colorCount} لون بنجاح`;
        } else if (sizeCount > 0) {
          toastMsg = `تم استخراج ${sizeCount} مقاس بنجاح`;
        } else if (colorCount > 0) {
          toastMsg = `تم استخراج ${colorCount} ألوان بنجاح`;
        } else {
          toastMsg = "تم تحليل البيانات بنجاح";
        }
      } else {
        if (sizeCount > 0 && colorCount > 0) {
          toastMsg = `Extracted ${sizeCount} sizes and ${colorCount} colors`;
        } else if (sizeCount > 0) {
          toastMsg = `Extracted ${sizeCount} sizes`;
        } else if (colorCount > 0) {
          toastMsg = `Extracted ${colorCount} colors`;
        } else {
          toastMsg = "Data extracted successfully";
        }
      }
      toast.success(toastMsg);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast.error(
        message.includes("RATE_LIMITED")
          ? isAr
            ? "تم استخدام المحلل السريع بدون انتظار"
            : "Quick analyzer used seamlessly"
          : isAr
            ? "تعذر فهم الطلب بالكامل. يمكنك مراجعة الحقول وإكمالها يدوياً."
            : "Could not fully parse request. You can edit the fields manually.",
      );
    } finally {
      setParsing(false);
    }
  };

  const buildPreview = () => {
    const sizes = splitVariantValues(sizesText);
    const colors = splitVariantValues(colorsText);
    const combinations = Math.max(1, sizes.length) * Math.max(1, colors.length);
    if (combinations > 100)
      return toast.error(
        isAr ? "الحد الأقصى 100 متغير في المرة الواحدة" : "Maximum 100 variants per batch",
      );
    if (!plan.base_sku.trim())
      return toast.error(isAr ? "أدخل رمز المنتج الأساسي" : "Enter a base SKU");

    const basePrice = Number(product?.base_price ?? 0);
    const enteredSalePrice = salePriceText.trim() === "" ? null : Number(salePriceText);
    if (
      enteredSalePrice !== null &&
      (!Number.isFinite(enteredSalePrice) || enteredSalePrice < 0 || enteredSalePrice > basePrice)
    )
      return toast.error(
        isAr
          ? "لا يمكن أن يكون سعر التخفيض أعلى من السعر الأساسي."
          : "Sale price cannot be higher than the regular price.",
      );

    const salePrice =
      enteredSalePrice !== null && enteredSalePrice > 0 && enteredSalePrice < basePrice
        ? enteredSalePrice
        : null;

    const usedBarcodes = new Set(variants.map((v) => v.barcode).filter(Boolean) as string[]);
    const sizeAxis = sizes.length ? sizes : [""];
    const colorAxis = colors.length ? colors : [""];

    const generated = sizeAxis.flatMap((size) =>
      colorAxis.map((color) => {
        const tokens = [color ? formatSkuToken(color) : "", size ? formatSkuToken(size) : ""]
          .filter(Boolean)
          .join("-");

        const baseSkuFormatted = plan.base_sku.trim().toUpperCase();
        const sku = `${baseSkuFormatted}${tokens ? `-${tokens}` : ""}`;

        const sizeSpecificStock =
          size && plan.size_stock_map && plan.size_stock_map[size] !== undefined
            ? plan.size_stock_map[size]
            : plan.stock_main;

        return {
          ...plan,
          stock_main: sizeSpecificStock,
          cost_price: Number(product?.cost_price ?? 0),
          selling_price: salePrice ?? basePrice,
          sale_price: salePrice === null ? "" : String(salePrice),
          size,
          color,
          size_unit: plan.size_unit,
          sku,
          barcode: makeEan13(usedBarcodes),
        } as BulkVariantRow;
      }),
    );
    setRows(generated);
  };

  const patchRow = (index: number, patch: Partial<BulkVariantRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const applyBatchMainStock = () => {
    const val = parseInt(batchMainStock, 10);
    if (isNaN(val) || val < 0) return;
    setRows((current) => current.map((row) => ({ ...row, stock_main: val })));
    setBatchMainStock("");
  };

  const applyBatchIncubatorStock = () => {
    const val = parseInt(batchIncubatorStock, 10);
    if (isNaN(val) || val < 0) return;
    setRows((current) => current.map((row) => ({ ...row, stock_incubator: val })));
    setBatchIncubatorStock("");
  };

  const applyBatchSalePrice = () => {
    const val = Number(batchSalePrice);
    const basePrice = Number(product?.base_price ?? 0);
    if (isNaN(val) || val < 0 || val > basePrice) {
      toast.error(isAr ? "سعر التخفيض غير صالح" : "Invalid sale price");
      return;
    }
    const formatted = val > 0 && val < basePrice ? String(val) : "";
    setRows((current) => current.map((row) => ({ ...row, sale_price: formatted })));
    setBatchSalePrice("");
  };

  const saveAll = async () => {
    const existingSkus = new Set(variants.map((v) => v.sku?.trim().toUpperCase()).filter(Boolean));
    const existingBarcodes = new Set(
      variants.map((v) => v.barcode?.trim().toUpperCase()).filter(Boolean),
    );
    const seenSkus = new Set<string>();
    const seenBarcodes = new Set<string>();
    const invalid = rows.some((row) => {
      const sku = row.sku.trim().toUpperCase();
      const barcode = row.barcode.trim().toUpperCase();
      const bad =
        !sku ||
        !barcode ||
        existingSkus.has(sku) ||
        existingBarcodes.has(barcode) ||
        seenSkus.has(sku) ||
        seenBarcodes.has(barcode) ||
        (row.sale_price !== "" &&
          (!Number.isFinite(Number(row.sale_price)) ||
            Number(row.sale_price) < 0 ||
            Number(row.sale_price) > Number(product?.base_price ?? 0))) ||
        row.cost_price < 0 ||
        !Number.isInteger(row.stock_main) ||
        row.stock_main < 0 ||
        !Number.isInteger(row.stock_incubator) ||
        row.stock_incubator < 0;
      seenSkus.add(sku);
      seenBarcodes.add(barcode);
      return bad;
    });
    if (!rows.length || invalid)
      return toast.error(
        isAr
          ? "راجع الرموز والأسعار والمخزون؛ توجد قيمة ناقصة أو مكررة"
          : "Review SKUs, barcodes, prices, and stock; a value is missing or duplicated",
      );
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("AUTH_REQUIRED");
      const { error } = await (supabase.from("product_variants") as any).insert(
        rows.map((row) => ({
          user_id: user.id,
          brand_id: brand.id,
          product_id: productId,
          size: row.size || null,
          size_unit: row.size_unit || null,
          color: row.color || null,
          fabric: row.fabric || null,
          sku: row.sku.trim(),
          barcode: row.barcode.trim(),
          cost_price: Number(product?.cost_price ?? 0),
          selling_price:
            Number(row.sale_price) > 0 && Number(row.sale_price) < Number(product?.base_price ?? 0)
              ? Number(row.sale_price)
              : Number(product?.base_price ?? 0),
          original_price:
            Number(row.sale_price) > 0 && Number(row.sale_price) < Number(product?.base_price ?? 0)
              ? Number(product?.base_price ?? 0)
              : null,
          stock_main: row.stock_main,
          stock_incubator: row.stock_incubator,
          stock: Number(row.stock_main || 0) + Number(row.stock_incubator || 0),
        })),
      );
      if (error) throw error;
      let activationFailed = false;
      if (variants.length === 0) {
        const { error: activationError } = await supabase
          .from("products")
          .update({ is_active: true })
          .eq("id", productId);
        activationFailed = Boolean(activationError);
      }
      if (activationFailed) {
        toast.error(
          isAr
            ? "تمت إضافة المتغيرات، لكن تعذر تفعيل المنتج تلقائياً."
            : "Variants added, but the product could not be activated automatically.",
        );
      } else {
        toast.success(
          variants.length === 0
            ? isAr
              ? `تمت إضافة ${rows.length} متغير وتفعيل المنتج تلقائياً.`
              : `${rows.length} variants added and the product was activated automatically.`
            : isAr
              ? `تمت إضافة ${rows.length} متغير`
              : `${rows.length} variants added`,
        );
      }
      setOpen(false);
      setRows([]);
      setPrompt("");
      setPlan(blank);
      setSalePriceText("");
      setSizesText("");
      setColorsText("");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : isAr ? "فشل الحفظ" : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setPlan({
            ...blank,
            base_sku: existingSku,
            cost_price: Number(product?.cost_price ?? 0),
            selling_price: Number(product?.base_price ?? 0),
          });
          setSalePriceText("");
          setSizesText("");
          setColorsText("");
          setRows([]);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Wand2 className="me-2 h-4 w-4" />
          {isAr ? "إنشاء متغيرات متعددة" : "Bulk / AI variants"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isAr ? "منشئ متغيرات المنتج الذكي" : "Smart Product Variant Builder"}
          </DialogTitle>
        </DialogHeader>

        {/* AI & NLP PROMPT BOX */}
        <div className="rounded-lg border bg-secondary/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="font-semibold">
              {isAr
                ? "صف المتغيرات بالعربية أو الإنجليزية (الذكاء الاصطناعي)"
                : "Describe variants in English or Arabic (AI Parser)"}
            </Label>
            <span className="text-[11px] text-muted-foreground">
              {isAr
                ? "يدعم مقاسات العبايات، الملابس، الألوان، الأسعار، والمخزون"
                : "Supports Abayas, Apparel, Shoes, Colors, Prices & Stock"}
            </span>
          </div>
          <textarea
            className="min-h-20 w-full rounded-md border border-input bg-background p-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              isAr
                ? "مثال: كود NP24، الألوان كحلي وعنابي وبيج، مقاسات العبايات من 52 إلى 60 زوجي، خامة كريب ملكي، السعر 25 د.ب والتخفيض 19 د.ب، المخزون 5 لكل مقاس"
                : "Example: code DRS-01, colors Black, Olive and Burgundy, sizes S to XL, Fabric Linen, price 25 BHD, sale 19, stock 5 per variant"
            }
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Button type="button" onClick={parseWithAi} disabled={parsing}>
              {parsing ? (
                <>
                  <Wand2 className="me-2 h-4 w-4 animate-spin" />
                  {isAr ? "جاري التحليل..." : "Parsing..."}
                </>
              ) : (
                <>
                  <Wand2 className="me-2 h-4 w-4" />
                  {isAr ? "تحليل فوري بالذكاء الاصطناعي" : "Instant AI / NLP Parse"}
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "الذكاء الاصطناعي يعبئ الحقول للمراجعة. لن يتم حفظ شيء قبل المعاينة والتأكيد."
                : "AI fills fields for review. Nothing is saved until you preview and confirm."}
            </p>
          </div>
        </div>

        {/* QUICK SIZING PRESET PILLS */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            {isAr ? "قوالب مقاسات جاهزة بنقرة واحدة:" : "1-Click Sizing Quick Presets:"}
          </Label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {SIZING_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2.5 bg-background hover:bg-secondary"
                onClick={() => applyPreset(preset)}
              >
                {isAr ? preset.labelAr : preset.labelEn}
              </Button>
            ))}
          </div>
        </div>

        {/* STRUCTURED VARIANT PLAN FIELDS */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>{isAr ? "رمز المنتج الأساسي" : "Base SKU"}</Label>
            <Input
              value={plan.base_sku}
              onChange={(e) => setPlan({ ...plan, base_sku: e.target.value })}
              placeholder={existingSku || "e.g. DRS-01"}
            />
          </div>
          <div>
            <Label>{isAr ? "المقاسات (بفاصلة)" : "Sizes (comma separated)"}</Label>
            <Input
              value={sizesText}
              onChange={(e) => setSizesText(e.target.value)}
              placeholder={isAr ? "52, 54, 56, 58, 60" : "S, M, L, XL"}
            />
          </div>
          <div>
            <Label>{isAr ? "الألوان (بفاصلة)" : "Colors (comma separated)"}</Label>
            <Input
              value={colorsText}
              onChange={(e) => setColorsText(e.target.value)}
              placeholder={isAr ? "كحلي, عنابي, بيج" : "Black, Navy, Olive"}
            />
          </div>
          <div>
            <Label>{isAr ? "الخامة" : "Fabric"}</Label>
            <Input
              value={plan.fabric}
              onChange={(e) => setPlan({ ...plan, fabric: e.target.value })}
              placeholder={isAr ? "كريب ملكي / حرير" : "Silk / Linen / Crepe"}
            />
          </div>
          <div>
            <Label>{isAr ? "وحدة المقاس" : "Size unit"}</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3"
              value={plan.size_unit}
              onChange={(e) =>
                setPlan({
                  ...plan,
                  size_unit: e.target.value as VariantGenerationPlan["size_unit"],
                })
              }
            >
              {SIZE_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit || "—"}
                </option>
              ))}
            </select>
          </div>
          {canViewFinancials && (
            <div>
              <Label>{isAr ? "التكلفة الموروثة" : "Inherited cost"}</Label>
              <Input
                className="bg-muted/50 text-muted-foreground disabled:cursor-not-allowed disabled:opacity-100"
                type="number"
                min="0"
                step="0.01"
                value={Number(product?.cost_price ?? 0)}
                disabled
              />
            </div>
          )}
          <div>
            <Label>{isAr ? "سعر التخفيض (اختياري)" : "Sale price (optional)"}</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              max={Math.max(0, Number(product?.base_price ?? 0))}
              placeholder={
                isAr
                  ? `الأساسي ${Number(product?.base_price ?? 0)}`
                  : `Regular ${Number(product?.base_price ?? 0)}`
              }
              value={salePriceText}
              onChange={(e) => setSalePriceText(e.target.value)}
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              {isAr
                ? "اتركه فارغاً أو أدخل 0 أو السعر الأساسي لإزالة التخفيض."
                : "Leave blank, enter 0, or use the regular price to remove the sale."}
            </p>
          </div>
          <div>
            <Label>{isAr ? "مخزون الرئيسي" : "Main stock"}</Label>
            <Input
              type="number"
              min="0"
              value={plan.stock_main}
              onChange={(e) => setPlan({ ...plan, stock_main: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>{isAr ? "مخزون الحاضنة" : "Incubator stock"}</Label>
            <Input
              type="number"
              min="0"
              value={plan.stock_incubator}
              onChange={(e) => setPlan({ ...plan, stock_incubator: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={buildPreview}>
            <Boxes className="me-2 h-4 w-4" />
            {isAr ? "إنشاء المعاينة وتوليد الباركود" : "Build Preview & Barcodes"}
          </Button>
          {rows.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setRows([])}
            >
              {isAr ? "مسح المعاينة" : "Clear preview"}
            </Button>
          )}
        </div>

        {/* PREVIEW TABLE WITH BATCH POWER TOOLS */}
        {rows.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Label className="font-semibold">
                {isAr
                  ? `معاينة ${rows.length} متغير جاهز للحفظ`
                  : `Preview ${rows.length} variants ready to save`}
              </Label>
              <span className="text-xs text-muted-foreground">
                {isAr
                  ? "تم توليد رموز SKU وباركود EAN-13 متوافقة مع الطابعات"
                  : "Generated printer-safe SKUs and unique EAN-13 barcodes"}
              </span>
            </div>

            {/* BATCH QUICK FILL TOOLBAR */}
            <div className="rounded-md border bg-muted/40 p-2.5 flex items-center gap-4 flex-wrap text-xs">
              <span className="font-semibold text-muted-foreground">
                {isAr ? "تعديل جماعي:" : "Batch edit:"}
              </span>
              <div className="flex items-center gap-1.5">
                <span>{isAr ? "الرئيسي:" : "Main:"}</span>
                <Input
                  className="h-7 w-16 text-xs"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={batchMainStock}
                  onChange={(e) => setBatchMainStock(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={applyBatchMainStock}
                >
                  {isAr ? "تطبيق للكل" : "Apply all"}
                </Button>
              </div>

              <div className="flex items-center gap-1.5">
                <span>{isAr ? "الحاضنة:" : "Incubator:"}</span>
                <Input
                  className="h-7 w-16 text-xs"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={batchIncubatorStock}
                  onChange={(e) => setBatchIncubatorStock(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={applyBatchIncubatorStock}
                >
                  {isAr ? "تطبيق للكل" : "Apply all"}
                </Button>
              </div>

              <div className="flex items-center gap-1.5">
                <span>{isAr ? "التخفيض:" : "Sale:"}</span>
                <Input
                  className="h-7 w-20 text-xs"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={String(product?.base_price ?? 0)}
                  value={batchSalePrice}
                  onChange={(e) => setBatchSalePrice(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={applyBatchSalePrice}
                >
                  {isAr ? "تطبيق للكل" : "Apply all"}
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[1000px] text-sm">
                <thead className="bg-secondary">
                  <tr>
                    {[
                      isAr ? "المقاس" : "Size",
                      isAr ? "اللون" : "Color",
                      isAr ? "الخامة" : "Fabric",
                      "SKU",
                      isAr ? "الباركود (EAN-13)" : "Barcode (EAN-13)",
                      ...(canViewFinancials ? [isAr ? "التكلفة" : "Cost"] : []),
                      isAr ? "سعر التخفيض" : "Sale price",
                      isAr ? "الرئيسي" : "Main",
                      isAr ? "الحاضنة" : "Incubator",
                      "",
                    ].map((label) => (
                      <th key={label} className="p-2 text-start font-semibold">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${index}-${row.barcode}`} className="border-t hover:bg-muted/30">
                      {(["size", "color", "fabric", "sku", "barcode"] as const).map((field) => (
                        <td key={field} className="p-1">
                          <Input
                            className="h-8 min-w-24"
                            value={row[field]}
                            onChange={(e) => patchRow(index, { [field]: e.target.value })}
                          />
                        </td>
                      ))}
                      {canViewFinancials && (
                        <td className="p-1">
                          <Input
                            className="h-8 w-24 bg-muted/50 text-muted-foreground disabled:cursor-not-allowed disabled:opacity-100"
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.cost_price}
                            disabled
                          />
                        </td>
                      )}
                      <td className="p-1">
                        <Input
                          className="h-8 w-24"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={String(product?.base_price ?? 0)}
                          value={row.sale_price}
                          onChange={(e) => patchRow(index, { sale_price: e.target.value })}
                        />
                      </td>
                      <td className="p-1">
                        <Input
                          className="h-8 w-20"
                          type="number"
                          min="0"
                          value={row.stock_main}
                          onChange={(e) => patchRow(index, { stock_main: Number(e.target.value) })}
                        />
                      </td>
                      <td className="p-1">
                        <Input
                          className="h-8 w-20"
                          type="number"
                          min="0"
                          value={row.stock_incubator}
                          onChange={(e) =>
                            patchRow(index, { stock_incubator: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="p-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            setRows((current) => current.filter((_, i) => i !== index))
                          }
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={saveAll} disabled={!rows.length || saving}>
            {saving
              ? isAr
                ? "جاري الحفظ..."
                : "Saving..."
              : isAr
                ? `حفظ ${rows.length} متغير`
                : `Save ${rows.length} variants`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface VariantImageUploaderProps {
  brandId: string;
  imageUrl: string | null;
  onChange: (url: string | null) => void;
  isAr: boolean;
}

function VariantImageUploader({ brandId, imageUrl, onChange, isAr }: VariantImageUploaderProps) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: Blob) => {
    try {
      setUploading(true);
      const url = await uploadPublicMedia(brandId, file, "product");
      onChange(url);
      toast.success(isAr ? "تم الرفع بنجاح" : "Uploaded successfully");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative group w-11 h-11 rounded-lg border border-dashed border-input flex items-center justify-center bg-muted/40 hover:bg-muted/80 transition-all cursor-pointer overflow-hidden shrink-0">
      {uploading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : imageUrl ? (
        <>
          <img src={imageUrl} alt="variant" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 transition-opacity">
            <CropUploadButton
              onCrop={handleUpload}
              preset="productPortrait"
              busy={uploading}
              size="icon"
              variant="ghost"
              className="h-6 w-6 rounded bg-white/20 p-1 text-white hover:bg-white/30 hover:text-white"
              title={isAr ? "تغيير" : "Change"}
            >
              <Pencil className="h-3 w-3" />
            </CropUploadButton>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="p-1 rounded bg-rose-600/80 text-white hover:bg-rose-600 transition-colors"
              title={isAr ? "حذف" : "Remove"}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </>
      ) : (
        <CropUploadButton
          onCrop={handleUpload}
          preset="productPortrait"
          busy={uploading}
          size="icon"
          variant="ghost"
          className="h-full w-full rounded-lg text-muted-foreground hover:text-primary"
          title={isAr ? "ضبط صورة المتغير" : "Frame variant image"}
        >
          <Upload className="h-3.5 w-3.5" />
        </CropUploadButton>
      )}
    </div>
  );
}

function StockStepper({ value, onChange }: { value: number; onChange: (val: number) => void }) {
  return (
    <div
      className="inline-flex items-center border border-input bg-background rounded-lg overflow-hidden h-9 shadow-sm shrink-0 select-none max-w-[105px]"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="w-8 h-full flex items-center justify-center hover:bg-muted active:scale-90 transition-all text-muted-foreground hover:text-foreground font-black text-sm border-r border-input"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onChange(Math.max(0, value - 1));
        }}
      >
        -
      </button>
      <input
        type="number"
        className="w-9 text-center bg-transparent border-0 outline-none h-full font-bold text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none px-0.5"
        value={value}
        onChange={(e) => {
          e.stopPropagation();
          onChange(Math.max(0, parseInt(e.target.value) || 0));
        }}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        className="w-8 h-full flex items-center justify-center hover:bg-muted active:scale-90 transition-all text-muted-foreground hover:text-foreground font-black text-sm border-l border-input"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onChange(value + 1);
        }}
      >
        +
      </button>
    </div>
  );
}

function PremiumCurrencyInput({
  value,
  onChange,
  onBlur,
  className = "",
  placeholder = "0.000",
  disabled = false,
  onClear,
  clearLabel = "Remove sale",
}: {
  value: string;
  onChange: (val: string) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  onClear?: () => void;
  clearLabel?: string;
}) {
  return (
    <div
      className="relative inline-flex items-center w-full min-w-[115px] max-w-[130px] shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="number"
        step="0.001"
        placeholder={placeholder}
        className={`w-full h-9.5 ${onClear && value ? "pl-7" : "pl-2.5"} pr-8 text-center font-mono font-bold bg-background border border-input rounded-xl outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-xs shadow-2xs transition-all disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground disabled:opacity-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${className}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={onBlur}
        disabled={disabled}
      />
      {onClear && value && !disabled && (
        <button
          type="button"
          className="absolute start-2 rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title={clearLabel}
          aria-label={clearLabel}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClear}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <span className="absolute end-2.5 text-[9px] font-black text-muted-foreground/60 pointer-events-none uppercase tracking-tight">
        BHD
      </span>
    </div>
  );
}

function VariantDesktopRow({
  v,
  canViewFinancials,
  barcodeLabel,
  SIZE_UNITS,
  salesByVariant,
  t,
  isAr,
  brand,
  update,
  productName,
  businessName,
  genBarcode,
  del,
  isSelected,
  onToggleSelect,
  renderImageCol,
  renderSkuCol,
  renderBarcodeCol,
  product,
}: {
  v: Variant;
  canViewFinancials: boolean;
  barcodeLabel: string;
  SIZE_UNITS: readonly string[];
  salesByVariant: Map<string, number>;
  t: any;
  isAr: boolean;
  brand: { id: string };
  update: (v: Variant, patch: Partial<Variant>) => void;
  productName: string;
  businessName: string | null;
  genBarcode: () => string;
  del: (id: string) => void;
  isSelected: boolean;
  onToggleSelect: () => void;
  renderImageCol: boolean;
  renderSkuCol: boolean;
  renderBarcodeCol: boolean;
  product?: Product;
}) {
  const [costVal, setCostVal] = useState(String(v.cost_price));
  const [sellingVal, setSellingVal] = useState(
    Number(v.original_price || 0) > Number(v.selling_price || 0) ? String(v.selling_price) : "",
  );

  useEffect(() => {
    setCostVal(String(v.cost_price));
  }, [v.cost_price]);

  useEffect(() => {
    setSellingVal(
      Number(v.original_price || 0) > Number(v.selling_price || 0) ? String(v.selling_price) : "",
    );
  }, [v.original_price, v.selling_price]);

  const costNum = Number(costVal) || 0;
  const sellingNum = sellingVal ? Number(sellingVal) : Number(product?.base_price ?? 0);
  const currentMargin = sellingNum > 0 ? ((sellingNum - costNum) / sellingNum) * 100 : 0;

  const commitSalePrice = (rawValue: string) => {
    const regularPrice = Number(product?.base_price ?? 0);
    const salePrice = rawValue === "" ? 0 : Number(rawValue);
    if (rawValue === "" || salePrice === 0 || salePrice === regularPrice) {
      setSellingVal("");
      update(v, { selling_price: regularPrice });
      return;
    }
    if (!Number.isFinite(salePrice) || salePrice < 0 || salePrice > regularPrice) {
      setSellingVal(
        Number(v.original_price || 0) > Number(v.selling_price || 0) ? String(v.selling_price) : "",
      );
      toast.error(
        isAr
          ? "لا يمكن أن يكون سعر التخفيض أعلى من السعر الأساسي. امسح الحقل لإزالة التخفيض."
          : "Sale price cannot exceed the regular price. Clear the field to remove the sale.",
      );
      return;
    }
    update(v, { selling_price: salePrice });
  };

  // Local state for combined attributes inline editor
  const [isEditingAttrs, setIsEditingAttrs] = useState(false);
  const [sizeVal, setSizeVal] = useState(v.size ?? "");
  const [sizeUnitVal, setSizeUnitVal] = useState(v.size_unit ?? "");
  const [colorVal, setColorVal] = useState(v.color ?? "");
  const [fabricVal, setFabricVal] = useState(v.fabric ?? "");

  // Sync back on external changes
  useEffect(() => {
    setSizeVal(v.size ?? "");
    setSizeUnitVal(v.size_unit ?? "");
    setColorVal(v.color ?? "");
    setFabricVal(v.fabric ?? "");
  }, [v.size, v.size_unit, v.color, v.fabric]);

  const saveAttributes = () => {
    update(v, {
      size: sizeVal || null,
      size_unit: sizeUnitVal || null,
      color: colorVal || null,
      fabric: fabricVal || null,
    });
    setIsEditingAttrs(false);
  };

  return (
    <tr
      className={`border-t border-border transition-all ${isSelected ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-secondary/15"}`}
    >
      {/* Checkbox */}
      <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer transition-all"
          checked={isSelected}
          onChange={onToggleSelect}
        />
      </td>

      {/* Combined Variant Attributes */}
      <td className="px-2 py-3 text-start align-middle" onClick={(e) => e.stopPropagation()}>
        {isEditingAttrs ? (
          <div className="flex flex-col gap-2.5 p-3 bg-card/95 backdrop-blur-md border border-primary/30 rounded-2xl w-[320px] sm:w-[350px] shadow-xl animate-in fade-in zoom-in-95 duration-150 relative z-40">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  {(isAr ? product?.variant_label_size_ar : product?.variant_label_size_en) ||
                    product?.variant_label_size_en ||
                    product?.variant_label_size_ar ||
                    (isAr ? "المقاس" : "Size")}
                </span>
                <input
                  className="h-9 w-full px-2.5 rounded-xl border border-input bg-background text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  value={sizeVal}
                  onChange={(e) => setSizeVal(e.target.value)}
                  placeholder={isAr ? "المقاس" : "Size"}
                />
              </div>
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  {isAr ? "الوحدة" : "Unit"}
                </span>
                <select
                  className="h-9 w-full px-2 rounded-xl border border-input bg-background text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  value={sizeUnitVal}
                  onChange={(e) => setSizeUnitVal(e.target.value)}
                >
                  {SIZE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u || "—"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  {(isAr ? product?.variant_label_color_ar : product?.variant_label_color_en) ||
                    product?.variant_label_color_en ||
                    product?.variant_label_color_ar ||
                    (isAr ? "اللون" : "Color")}
                </span>
                <input
                  className="h-9 w-full px-2.5 rounded-xl border border-input bg-background text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  value={colorVal}
                  onChange={(e) => setColorVal(e.target.value)}
                  placeholder={isAr ? "اللون" : "Color"}
                />
              </div>
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  {(isAr ? product?.variant_label_fabric_ar : product?.variant_label_fabric_en) ||
                    product?.variant_label_fabric_en ||
                    product?.variant_label_fabric_ar ||
                    (isAr ? "الخامة" : "Fabric")}
                </span>
                <input
                  className="h-9 w-full px-2.5 rounded-xl border border-input bg-background text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  value={fabricVal}
                  onChange={(e) => setFabricVal(e.target.value)}
                  placeholder={isAr ? "الخامة" : "Fabric"}
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border/60 mt-0.5">
              <span className="text-[10px] text-muted-foreground font-medium">
                {isAr ? "تعديل المتغير" : "Edit Variant Attributes"}
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  className="h-8 px-3 rounded-lg hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-muted-foreground flex items-center gap-1 text-xs font-semibold transition-colors"
                  onClick={() => setIsEditingAttrs(false)}
                >
                  <X className="h-3.5 w-3.5" />
                  <span>{isAr ? "إلغاء" : "Cancel"}</span>
                </button>
                <button
                  type="button"
                  className="h-8 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1 text-xs font-bold transition-all shadow-xs"
                  onClick={saveAttributes}
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>{isAr ? "حفظ" : "Save"}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap group/v">
            {[v.size, v.color, v.fabric].some(Boolean) ? (
              <>
                {v.size && (
                  <span className="inline-flex items-center bg-primary/5 text-primary text-xs font-semibold px-2 py-0.5 border border-primary/10 rounded-md">
                    {v.size} {v.size_unit || ""}
                  </span>
                )}
                {v.color && (
                  <span className="inline-flex items-center bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 text-xs font-semibold px-2 py-0.5 border border-slate-200 dark:border-slate-700 rounded-md gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                    {v.color}
                  </span>
                )}
                {v.fabric && (
                  <span className="inline-flex items-center bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 text-xs font-semibold px-2 py-0.5 border border-zinc-200 dark:border-slate-700 rounded-md">
                    {v.fabric}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground text-xs italic">
                {isAr ? "متغير قياسي" : "Standard Variant"}
              </span>
            )}

            {!renderBarcodeCol && (v.barcode || v.sku) && (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground/85 bg-muted/70 px-1.5 py-0.5 rounded-md border border-border/60 shrink-0">
                <Barcode className="h-3 w-3 text-primary/80" />
                <span>{v.barcode || v.sku}</span>
              </span>
            )}

            <button
              type="button"
              className="p-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground opacity-0 group-hover/v:opacity-100 transition-opacity"
              onClick={() => setIsEditingAttrs(true)}
              title={isAr ? "تعديل الخصائص" : "Edit attributes"}
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        )}
      </td>

      {/* Image Column */}
      {renderImageCol && (
        <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-center">
            <VariantImageUploader
              brandId={brand.id}
              imageUrl={v.image_url}
              onChange={(url) => update(v, { image_url: url })}
              isAr={isAr}
            />
          </div>
        </td>
      )}

      {/* SKU Column */}
      {renderSkuCol && (
        <td className="px-2 py-3 text-start" onClick={(e) => e.stopPropagation()}>
          <input
            className="w-full bg-transparent hover:bg-muted/30 focus:bg-background border border-transparent hover:border-input focus:border-input px-2 py-1 rounded-md transition outline-none font-mono text-xs"
            defaultValue={v.sku ?? ""}
            onBlur={(e) => update(v, { sku: e.target.value || null })}
            placeholder="—"
          />
        </td>
      )}

      {/* Barcode Column */}
      {renderBarcodeCol && (
        <td className="px-2 py-3 text-start" onClick={(e) => e.stopPropagation()}>
          <div className="flex min-w-0 items-center gap-1.5">
            <input
              className="min-w-0 flex-1 bg-transparent hover:bg-muted/30 focus:bg-background border border-transparent hover:border-input focus:border-input px-2 py-1 rounded-md transition font-mono text-xs outline-none"
              placeholder={isAr ? "بدون" : "None"}
              defaultValue={v.barcode ?? ""}
              onBlur={(e) => update(v, { barcode: e.target.value.trim() || null })}
            />
            <button
              type="button"
              title={isAr ? "توليد باركود" : "Generate barcode"}
              className="text-muted-foreground hover:text-primary p-1 rounded-md hover:bg-secondary active:scale-95 transition touch-manipulation"
              onClick={(e) => {
                e.preventDefault();
                update(v, { barcode: genBarcode() });
              }}
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
      )}

      {/* Cost Column */}
      {canViewFinancials && (
        <td className="px-2 py-3 text-center">
          <PremiumCurrencyInput
            value={costVal}
            onChange={setCostVal}
            onBlur={(e) => update(v, { cost_price: Number(e.target.value) })}
            disabled
          />
        </td>
      )}

      {/* Price Column */}
      <td className="px-2 py-3 text-center">
        <PremiumCurrencyInput
          value={sellingVal}
          onChange={setSellingVal}
          onBlur={(e) => commitSalePrice(e.target.value)}
          onClear={() => commitSalePrice("")}
          clearLabel={isAr ? "إزالة التخفيض" : "Remove sale"}
          placeholder={String(product?.base_price ?? "0.000")}
        />
      </td>

      {/* Original Price Column */}
      <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
        <input
          type="number"
          step="0.001"
          min="0"
          className="w-full h-9 px-2 text-center bg-muted/40 border border-transparent rounded-lg font-medium text-xs max-w-[100px] disabled:opacity-100"
          value={product?.base_price ?? 0}
          disabled
        />
      </td>

      {/* Margin Column */}
      {canViewFinancials && (
        <td className="px-2 py-3 text-center">
          {(() => {
            let marginBg =
              "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30";
            if (currentMargin < 20) {
              marginBg =
                "bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30";
            } else if (currentMargin < 50) {
              marginBg =
                "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30";
            }
            return (
              <span
                className={`inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${marginBg}`}
              >
                <TrendingUp className="h-3 w-3" />
                {currentMargin.toFixed(0)}%
              </span>
            );
          })()}
        </td>
      )}

      {/* Stock Main */}
      <td className="px-2 py-3 text-center">
        <StockStepper
          value={v.stock_main ?? 0}
          onChange={(val) => update(v, { stock_main: val })}
        />
      </td>

      {/* Stock Incubator */}
      <td className="px-2 py-3 text-center">
        <StockStepper
          value={v.stock_incubator ?? 0}
          onChange={(val) => update(v, { stock_incubator: val })}
        />
      </td>

      {/* Stock Total Run Rate Column */}
      <td className="px-2 py-3 text-center">
        <div className="font-extrabold text-sm text-foreground">
          {(v.stock_main ?? 0) + (v.stock_incubator ?? 0)}
        </div>
        {(() => {
          const stock = (v.stock_main ?? 0) + (v.stock_incubator ?? 0);
          const qtySold = salesByVariant.get(v.id) || 0;
          const variantCreatedAt = v.created_at ? new Date(v.created_at) : null;
          const daysElapsed = variantCreatedAt
            ? Math.max(
                1,
                Math.min(
                  45,
                  Math.ceil(
                    (new Date().getTime() - variantCreatedAt.getTime()) / (1000 * 60 * 60 * 24),
                  ),
                ),
              )
            : 45;
          const dailyVelocity = qtySold / daysElapsed;

          let runRateText = isAr ? "لا مبيعات" : "No sales";
          let runRateColor = "text-muted-foreground/60 text-[9px]";

          if (stock <= 0) {
            runRateText = isAr ? "نفد" : "Out of stock";
            runRateColor = "text-rose-600 dark:text-rose-400 font-bold text-[9px]";
          } else if (dailyVelocity > 0) {
            const days = Math.ceil(stock / dailyVelocity);
            runRateText = isAr ? `ينفد في ${days} ي` : `${days} d left`;
            runRateColor =
              days <= 7
                ? "text-amber-600 dark:text-amber-400 font-bold text-[9px]"
                : "text-emerald-600 dark:text-emerald-400 font-medium text-[9px]";
          }

          return (
            <div className={`text-[9px] mt-0.5 whitespace-nowrap leading-none ${runRateColor}`}>
              {runRateText}
            </div>
          );
        })()}
      </td>

      {/* Delete button */}
      <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
        <InventoryDeleteAction
          message={t("inventory.deleteVariantConfirm")}
          onConfirm={() => del(v.id)}
        />
      </td>
    </tr>
  );
}

function VariantMobileCard({
  v,
  canViewFinancials,
  barcodeLabel,
  SIZE_UNITS,
  salesByVariant,
  t,
  isAr,
  brand,
  update,
  del,
  mainLabel,
  incLabel,
  isSelected,
  onToggleSelect,
  product,
}: {
  v: Variant;
  canViewFinancials: boolean;
  barcodeLabel: string;
  SIZE_UNITS: readonly string[];
  salesByVariant: Map<string, number>;
  t: any;
  isAr: boolean;
  brand: { id: string };
  update: (v: Variant, patch: Partial<Variant>) => void;
  del: (id: string) => void;
  mainLabel: string;
  incLabel: string;
  isSelected: boolean;
  onToggleSelect: () => void;
  product?: Product;
}) {
  const [costVal, setCostVal] = useState(String(v.cost_price));
  const [sellingVal, setSellingVal] = useState(
    Number(v.original_price || 0) > Number(v.selling_price || 0) ? String(v.selling_price) : "",
  );

  useEffect(() => {
    setCostVal(String(v.cost_price));
  }, [v.cost_price]);

  useEffect(() => {
    setSellingVal(
      Number(v.original_price || 0) > Number(v.selling_price || 0) ? String(v.selling_price) : "",
    );
  }, [v.original_price, v.selling_price]);

  const costNum = Number(costVal) || 0;
  const sellingNum = sellingVal ? Number(sellingVal) : Number(product?.base_price ?? 0);
  const currentMargin = sellingNum > 0 ? ((sellingNum - costNum) / sellingNum) * 100 : 0;

  const commitSalePrice = (rawValue: string) => {
    const regularPrice = Number(product?.base_price ?? 0);
    const salePrice = rawValue === "" ? 0 : Number(rawValue);
    if (rawValue === "" || salePrice === 0 || salePrice === regularPrice) {
      setSellingVal("");
      update(v, { selling_price: regularPrice });
      return;
    }
    if (!Number.isFinite(salePrice) || salePrice < 0 || salePrice > regularPrice) {
      setSellingVal(
        Number(v.original_price || 0) > Number(v.selling_price || 0) ? String(v.selling_price) : "",
      );
      toast.error(
        isAr
          ? "لا يمكن أن يكون سعر التخفيض أعلى من السعر الأساسي. امسح الحقل لإزالة التخفيض."
          : "Sale price cannot exceed the regular price. Clear the field to remove the sale.",
      );
      return;
    }
    update(v, { selling_price: salePrice });
  };

  return (
    <div
      className={`rounded-xl border p-4 space-y-3.5 shadow-sm transition-all bg-background ${isSelected ? "border-primary bg-primary/5/10" : "border-border"}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2.5">
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="h-4.5 w-4.5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer transition-all"
            checked={isSelected}
            onChange={onToggleSelect}
          />
          <div className="flex items-center gap-1.5 flex-wrap">
            {[v.size, v.color, v.fabric].some(Boolean) ? (
              <>
                {v.size && (
                  <span className="inline-flex items-center bg-primary/5 text-primary text-[10px] font-bold px-1.5 py-0.5 border border-primary/10 rounded-sm">
                    {v.size} {v.size_unit || ""}
                  </span>
                )}
                {v.color && (
                  <span className="inline-flex items-center bg-slate-100 text-slate-800 text-[10px] font-bold px-1.5 py-0.5 border border-slate-200 rounded-sm">
                    {v.color}
                  </span>
                )}
                {v.fabric && (
                  <span className="inline-flex items-center bg-zinc-100 text-zinc-800 text-[10px] font-bold px-1.5 py-0.5 border border-zinc-200 rounded-sm">
                    {v.fabric}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground text-xs italic font-semibold">
                {isAr ? "متغير قياسي" : "Standard Variant"}
              </span>
            )}
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <InventoryDeleteAction
            message={t("inventory.deleteVariantConfirm")}
            onConfirm={() => del(v.id)}
            mobile
          />
        </div>
      </div>

      {/* Quick stock is the default mobile workflow. */}
      <div
        className="grid grid-cols-2 gap-3 rounded-xl border border-primary/15 bg-primary/5 p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <Label className="text-[10px] font-black uppercase text-muted-foreground/85">
            {mainLabel}
          </Label>
          <div className="mt-1">
            <StockStepper
              value={v.stock_main ?? 0}
              onChange={(val) => update(v, { stock_main: val })}
            />
          </div>
        </div>
        <div>
          <Label className="text-[10px] font-black uppercase text-muted-foreground/85">
            {incLabel}
          </Label>
          <div className="mt-1">
            <StockStepper
              value={v.stock_incubator ?? 0}
              onChange={(val) => update(v, { stock_incubator: val })}
            />
          </div>
        </div>
      </div>

      <details
        className="group rounded-xl border border-border/60 bg-muted/15"
        onClick={(e) => e.stopPropagation()}
      >
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-bold [&::-webkit-details-marker]:hidden">
          <span>{isAr ? "تفاصيل السعر والباركود والصورة" : "Price, barcode & image details"}</span>
          <span className="text-muted-foreground group-open:hidden">{isAr ? "فتح" : "Open"}</span>
          <span className="hidden text-muted-foreground group-open:inline">
            {isAr ? "إغلاق" : "Close"}
          </span>
        </summary>
        <div className="grid grid-cols-2 gap-3 border-t border-border/50 p-3">
          {/* Inherited cost and optional sale price */}
          {canViewFinancials && (
            <div>
              <Label className="text-[10px] font-black uppercase text-muted-foreground/85">
                {t("inventory.cost")}
              </Label>
              <div className="mt-1">
                <PremiumCurrencyInput
                  value={costVal}
                  onChange={setCostVal}
                  onBlur={(e) => update(v, { cost_price: Number(e.target.value) })}
                  className="h-10 rounded-xl text-xs"
                  disabled
                />
              </div>
            </div>
          )}
          <div>
            <Label className="text-[10px] font-black uppercase text-muted-foreground/85">
              {isAr ? "سعر التخفيض" : "Sale Price"}
            </Label>
            <div className="mt-1">
              <PremiumCurrencyInput
                value={sellingVal}
                onChange={setSellingVal}
                onBlur={(e) => commitSalePrice(e.target.value)}
                onClear={() => commitSalePrice("")}
                clearLabel={isAr ? "إزالة التخفيض" : "Remove sale"}
                className="h-10 rounded-xl text-xs"
                placeholder={String(product?.base_price ?? "0.000")}
              />
            </div>
          </div>

          {/* Dynamic image picker and regular price */}
          <div>
            <Label className="text-[10px] font-black uppercase text-muted-foreground/85">
              {isAr ? "صورة المتغير" : "Variant Image"}
            </Label>
            <div className="mt-1">
              <VariantImageUploader
                brandId={brand.id}
                imageUrl={v.image_url}
                onChange={(url) => update(v, { image_url: url })}
                isAr={isAr}
              />
            </div>
          </div>
          <div>
            <Label className="text-[10px] font-black uppercase text-muted-foreground/85">
              {isAr ? "السعر العادي" : "Regular Price"}
            </Label>
            <input
              type="number"
              step="0.001"
              min="0"
              className="mt-1 h-9 w-full rounded-lg border border-input bg-muted/40 px-3 text-xs font-semibold disabled:opacity-100"
              value={product?.base_price ?? 0}
              disabled
            />
          </div>

          {/* SKU & Barcode */}
          <div>
            <Label className="text-[10px] font-black uppercase text-muted-foreground/85">SKU</Label>
            <input
              className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-mono outline-none focus:ring-1 focus:ring-primary"
              defaultValue={v.sku ?? ""}
              onBlur={(e) => update(v, { sku: e.target.value || null })}
              placeholder="—"
            />
          </div>
          <div>
            <Label className="text-[10px] font-black uppercase text-muted-foreground/85">
              {barcodeLabel}
            </Label>
            <input
              className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-mono outline-none focus:ring-1 focus:ring-primary"
              defaultValue={v.barcode ?? ""}
              onBlur={(e) => update(v, { barcode: e.target.value.trim() || null })}
              placeholder="—"
            />
          </div>
        </div>
      </details>

      {/* Summary Footer */}
      <div className="flex items-center justify-between rounded-xl bg-secondary/25 px-4 py-3 text-xs border border-border/45 font-semibold">
        <span>
          {t("inventory.stock")}:{" "}
          <b className="text-sm font-black">{(v.stock_main ?? 0) + (v.stock_incubator ?? 0)}</b>
        </span>
        {(() => {
          const stock = (v.stock_main ?? 0) + (v.stock_incubator ?? 0);
          const qtySold = salesByVariant.get(v.id) || 0;
          const variantCreatedAt = v.created_at ? new Date(v.created_at) : null;
          const daysElapsed = variantCreatedAt
            ? Math.max(
                1,
                Math.min(
                  45,
                  Math.ceil(
                    (new Date().getTime() - variantCreatedAt.getTime()) / (1000 * 60 * 60 * 24),
                  ),
                ),
              )
            : 45;
          const dailyVelocity = qtySold / daysElapsed;

          let runRateText = isAr ? "لا مبيعات مؤخراً" : "No recent sales";
          let runRateColor = "text-muted-foreground/80";

          if (stock <= 0) {
            runRateText = isAr ? "نفد المخزون" : "Out of stock";
            runRateColor = "text-rose-600 dark:text-rose-500 font-extrabold";
          } else if (dailyVelocity > 0) {
            const days = Math.ceil(stock / dailyVelocity);
            runRateText = isAr ? `ينفد خلال ${days} يوم` : `Out of stock in ${days} d`;
            runRateColor =
              days <= 7
                ? "text-amber-600 dark:text-amber-500 font-extrabold animate-pulse"
                : "text-emerald-600 dark:text-emerald-500 font-extrabold";
          }

          return <span className={runRateColor}>{runRateText}</span>;
        })()}
        {canViewFinancials && (
          <span className="text-primary font-black">
            {t("inventory.margin")}: {currentMargin.toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}

function VariantList({
  productId,
  productName,
  businessName,
  variants,
  onChanged,
  salesByVariant,
  product,
}: {
  productId: string;
  productName: string;
  businessName: string | null;
  variants: Variant[];
  onChanged: () => void;
  salesByVariant: Map<string, number>;
  product?: Product;
}) {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { canViewFinancials } = useProfile();
  const brand = useBrand();
  const [adding, setAdding] = useState(false);
  const empty = {
    size: "",
    size_unit: "",
    color: "",
    fabric: "",
    sku: "",
    barcode: "",
    cost_price: String(product?.cost_price ?? 0),
    selling_price: "",
    original_price: "",
    stock_main: "0",
    stock_incubator: "0",
    image_url: "",
  };
  const [row, setRow] = useState(empty);

  const startAdding = () => {
    setRow({
      ...empty,
      cost_price: String(product?.cost_price ?? 0),
      selling_price: "",
      original_price: String(product?.base_price ?? 0),
    });
    setAdding(true);
  };

  const genBarcode = () => {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const body = `29${Date.now().toString().slice(-6)}${String(random[0] % 10000).padStart(4, "0")}`;
    const weightedSum = body
      .split("")
      .reduce((sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    return `${body}${(10 - (weightedSum % 10)) % 10}`;
  };

  const normalizeBarcode = (value: unknown) =>
    String(value ?? "")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .toUpperCase();
  const barcodeInUse = (value: unknown, exceptId?: string) => {
    const normalized = normalizeBarcode(value);
    return (
      !!normalized &&
      variants.some(
        (variant) => variant.id !== exceptId && normalizeBarcode(variant.barcode) === normalized,
      )
    );
  };

  const add = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    if (barcodeInUse(row.barcode)) {
      toast.error(
        isAr
          ? "هذا الباركود مستخدم بالفعل لمنتج آخر"
          : "This barcode is already assigned to another variant",
      );
      return;
    }
    const { error } = await (supabase.from("product_variants") as any).insert({
      user_id: user.id,
      brand_id: brand.id,
      product_id: productId,
      size: row.size || null,
      size_unit: row.size_unit || null,
      color: row.color || null,
      fabric: row.fabric || null,
      sku: row.sku || null,
      barcode: row.barcode.trim() || null,
      cost_price: Number(product?.cost_price ?? 0),
      selling_price: row.selling_price
        ? Number(row.selling_price)
        : Number(product?.base_price ?? 0),
      original_price:
        row.selling_price && Number(row.selling_price) < Number(product?.base_price ?? 0)
          ? Number(product?.base_price ?? 0)
          : null,
      stock_main: Number(row.stock_main),
      stock_incubator: Number(row.stock_incubator),
      stock: Number(row.stock_main || 0) + Number(row.stock_incubator || 0),
      image_url: row.image_url || null,
    });
    if (error) return toast.error(error.message);
    if (variants.length === 0) {
      const { error: activationError } = await supabase
        .from("products")
        .update({ is_active: true })
        .eq("id", productId);
      if (activationError) {
        onChanged();
        return toast.error(
          isAr
            ? "تمت إضافة المتغير، لكن تعذر تفعيل المنتج تلقائياً."
            : "Variant added, but the product could not be activated automatically.",
        );
      }
      toast.success(
        isAr
          ? "تمت إضافة أول متغير وتفعيل المنتج تلقائياً."
          : "First variant added and the product was activated automatically.",
      );
    }
    setRow(empty);
    setAdding(false);
    onChanged();
  };

  const update = async (v: Variant, patch: Partial<Variant>) => {
    if (
      Object.prototype.hasOwnProperty.call(patch, "barcode") &&
      barcodeInUse(patch.barcode, v.id)
    ) {
      toast.error(
        isAr
          ? "هذا الباركود مستخدم بالفعل لمنتج آخر"
          : "This barcode is already assigned to another variant",
      );
      return;
    }
    const normalizedPatch: any = { ...patch };
    if (typeof patch.selling_price === "number") {
      const regularPrice = Number(product?.base_price ?? 0);
      normalizedPatch.original_price = patch.selling_price < regularPrice ? regularPrice : null;
    }
    if (patch.stock_main !== undefined || patch.stock_incubator !== undefined) {
      const mainStock =
        patch.stock_main !== undefined ? Number(patch.stock_main) : Number(v.stock_main ?? 0);
      const incStock =
        patch.stock_incubator !== undefined
          ? Number(patch.stock_incubator)
          : Number(v.stock_incubator ?? 0);
      normalizedPatch.stock_main = mainStock;
      normalizedPatch.stock_incubator = incStock;
      normalizedPatch.stock = mainStock + incStock;
    }
    const { error } = await (supabase.from("product_variants") as any)
      .update(normalizedPatch)
      .eq("id", v.id);
    if (error) toast.error(error.message);
    else onChanged();
  };

  const del = async (id: string) => {
    const { error } = await supabase.from("product_variants").delete().eq("id", id);
    if (error) toast.error(error.message);
    else onChanged();
  };

  const mainLabel = isAr ? "الرئيسي" : "Main";
  const incLabel = isAr ? "الحاضنة" : "Incubator";
  const barcodeLabel = isAr ? "الباركود" : "Barcode";

  // State for dynamic columns compacting / hiding
  type VariantViewMode = "quick" | "barcodes" | "full";
  const [viewMode, setViewMode] = useState<VariantViewMode>("quick");

  const hasAnyImage = useMemo(
    () => variants.some((v) => v.image_url && v.image_url.trim()),
    [variants],
  );
  const hasAnySku = useMemo(() => variants.some((v) => v.sku && v.sku.trim()), [variants]);
  const hasAnyBarcode = useMemo(
    () => variants.some((v) => v.barcode && v.barcode.trim()),
    [variants],
  );

  const renderImageCol = viewMode === "full" || (viewMode === "barcodes" && hasAnyImage);
  const renderSkuCol = viewMode === "full" || viewMode === "barcodes";
  const renderBarcodeCol = viewMode === "full" || viewMode === "barcodes";

  // Selected state for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isAllSelected = variants.length > 0 && selectedIds.size === variants.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(variants.map((v) => v.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const bulkSetPrice = async () => {
    const val = prompt(
      isAr
        ? "أدخل سعر البيع الجديد لكافة المتغيرات المحددة:"
        : "Enter new selling price for all selected variants:",
    );
    if (val === null) return;
    const price = Number(val);
    if (isNaN(price) || price < 0) return toast.error(isAr ? "سعر غير صالح" : "Invalid price");
    const { error } = await supabase
      .from("product_variants")
      .update({ selling_price: price })
      .in("id", Array.from(selectedIds));
    if (error) toast.error(error.message);
    else {
      toast.success(isAr ? "تم تحديث الأسعار بنجاح" : "Prices updated successfully");
      setSelectedIds(new Set());
      onChanged();
    }
  };

  const bulkAddStock = async (amount: number) => {
    const selectedVariants = variants.filter((v) => selectedIds.has(v.id));
    const promises = selectedVariants.map((v) => {
      const newMain = Math.max(0, (v.stock_main ?? 0) + amount);
      const inc = v.stock_incubator ?? 0;
      return (supabase.from("product_variants") as any)
        .update({
          stock_main: newMain,
          stock: newMain + inc,
        })
        .eq("id", v.id);
    });
    const results = await Promise.all(promises);
    const hasError = results.some((r) => r.error);
    if (hasError) toast.error(isAr ? "فشل تحديث المخزون" : "Failed to update some stock entries");
    else {
      toast.success(
        isAr ? `تمت إضافة ${amount}+ مخزون بنجاح` : `Added +${amount} stock successfully`,
      );
      setSelectedIds(new Set());
      onChanged();
    }
  };

  const bulkApplyMarkup = async () => {
    const val = prompt(
      isAr
        ? "أدخل نسبة الهامش الربحي المئوية (مثال: 50 لـ 50%):"
        : "Enter markup percentage (e.g. 50 for 55%):",
    );
    if (val === null) return;
    const markup = Number(val);
    if (isNaN(markup) || markup < 0)
      return toast.error(isAr ? "نسبة مئوية غير صالحة" : "Invalid markup percentage");
    const selectedVariants = variants.filter((v) => selectedIds.has(v.id));
    const promises = selectedVariants.map((v) => {
      const newPrice = v.cost_price * (1 + markup / 100);
      return supabase
        .from("product_variants")
        .update({ selling_price: Number(newPrice.toFixed(3)) })
        .eq("id", v.id);
    });
    const results = await Promise.all(promises);
    const hasError = results.some((r) => r.error);
    if (hasError)
      toast.error(isAr ? "فشل تطبيق الهامش الربحي" : "Failed to apply markup on some variants");
    else {
      toast.success(isAr ? "تم تطبيق الهامش الربحي بنجاح" : "Markup applied successfully");
      setSelectedIds(new Set());
      onChanged();
    }
  };

  const bulkDelete = async () => {
    if (
      !confirm(
        isAr
          ? "هل أنت متأكد من حذف المتغيرات المحددة؟"
          : "Are you sure you want to delete the selected variants?",
      )
    )
      return;
    const { error } = await supabase
      .from("product_variants")
      .delete()
      .in("id", Array.from(selectedIds));
    if (error) toast.error(error.message);
    else {
      toast.success(isAr ? "تم حذف المتغيرات بنجاح" : "Variants deleted successfully");
      setSelectedIds(new Set());
      onChanged();
    }
  };

  // Auto-calculated total table width
  const totalTableWidth =
    44 +
    270 +
    (renderImageCol ? 96 : 0) +
    (renderSkuCol ? 120 : 0) +
    (renderBarcodeCol ? 190 : 0) +
    (canViewFinancials ? 110 : 0) +
    110 +
    110 +
    (canViewFinancials ? 96 : 0) +
    115 +
    115 +
    88 +
    60;

  return (
    <div className="mt-4 border-t border-border pt-4">
      {/* Mobile Stacked Card View */}
      <div className="space-y-4 md:hidden">
        {variants.map((v) => (
          <VariantMobileCard
            key={v.id}
            v={v}
            canViewFinancials={canViewFinancials}
            barcodeLabel={barcodeLabel}
            SIZE_UNITS={SIZE_UNITS}
            salesByVariant={salesByVariant}
            t={t}
            isAr={isAr}
            brand={brand}
            update={update}
            del={del}
            mainLabel={mainLabel}
            incLabel={incLabel}
            isSelected={selectedIds.has(v.id)}
            onToggleSelect={() => toggleSelect(v.id)}
            product={product}
          />
        ))}

        {/* Adding state on Mobile */}
        {adding && (
          <div className="rounded-xl border border-primary/35 bg-secondary/35 p-4 space-y-4 shadow-sm animate-in fade-in duration-200">
            <div className="font-extrabold text-sm text-foreground">
              {t("inventory.addVariant")}
            </div>
            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                  {(isAr ? product?.variant_label_size_ar : product?.variant_label_size_en) ||
                    product?.variant_label_size_en ||
                    product?.variant_label_size_ar ||
                    t("inventory.size")}
                </Label>
                <Input
                  className="mt-1 h-9 rounded-md text-xs"
                  value={row.size}
                  onChange={(e) => setRow({ ...row, size: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                  {isAr ? "الوحدة" : "Unit"}
                </Label>
                <select
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                  value={row.size_unit}
                  onChange={(e) => setRow({ ...row, size_unit: e.target.value })}
                >
                  {SIZE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u || "—"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                  {(isAr ? product?.variant_label_color_ar : product?.variant_label_color_en) ||
                    product?.variant_label_color_en ||
                    product?.variant_label_color_ar ||
                    t("inventory.color")}
                </Label>
                <Input
                  className="mt-1 h-9 rounded-md text-xs"
                  value={row.color}
                  onChange={(e) => setRow({ ...row, color: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                  {(isAr ? product?.variant_label_fabric_ar : product?.variant_label_fabric_en) ||
                    product?.variant_label_fabric_en ||
                    product?.variant_label_fabric_ar ||
                    t("inventory.fabric")}
                </Label>
                <Input
                  className="mt-1 h-9 rounded-md text-xs"
                  value={row.fabric}
                  onChange={(e) => setRow({ ...row, fabric: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                  {t("inventory.sku")}
                </Label>
                <Input
                  className="mt-1 h-9 rounded-md text-xs"
                  value={row.sku}
                  onChange={(e) => setRow({ ...row, sku: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                  {barcodeLabel}
                </Label>
                <Input
                  className="mt-1 h-9 rounded-md text-xs"
                  value={row.barcode}
                  onChange={(e) => setRow({ ...row, barcode: e.target.value })}
                />
              </div>
              {canViewFinancials && (
                <div>
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                    {t("inventory.cost")}
                  </Label>
                  <Input
                    type="number"
                    step="0.001"
                    className="mt-1 h-9 rounded-md bg-muted/50 text-xs font-bold text-muted-foreground disabled:cursor-not-allowed disabled:opacity-100"
                    value={row.cost_price}
                    disabled
                  />
                </div>
              )}
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                  {isAr ? "سعر التخفيض (اختياري)" : "Sale Price (optional)"}
                </Label>
                <Input
                  type="number"
                  step="0.001"
                  className="mt-1 h-9 rounded-md text-xs font-bold"
                  value={row.selling_price}
                  onChange={(e) => setRow({ ...row, selling_price: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                  {isAr ? "السعر العادي" : "Regular Price"}
                </Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  className="mt-1 h-9 rounded-md text-xs"
                  value={product?.base_price ?? 0}
                  disabled
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                  {mainLabel}
                </Label>
                <Input
                  type="number"
                  className="mt-1 h-9 rounded-md text-xs"
                  value={row.stock_main}
                  onChange={(e) => setRow({ ...row, stock_main: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                  {incLabel}
                </Label>
                <Input
                  type="number"
                  className="mt-1 h-9 rounded-md text-xs"
                  value={row.stock_incubator}
                  onChange={(e) => setRow({ ...row, stock_incubator: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground block uppercase mb-1">
                  {isAr ? "صورة المتغير" : "Variant Image"}
                </Label>
                <div className="mt-1">
                  <VariantImageUploader
                    brandId={brand.id}
                    imageUrl={row.image_url}
                    onChange={(url) => setRow({ ...row, image_url: url || "" })}
                    isAr={isAr}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
              <Button
                type="button"
                variant="ghost"
                className="h-8 rounded-lg text-xs font-bold touch-manipulation"
                onClick={(e) => {
                  e.preventDefault();
                  setAdding(false);
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                className="h-8 rounded-lg text-xs font-bold touch-manipulation"
                onClick={(e) => {
                  e.preventDefault();
                  add();
                }}
              >
                {t("common.save")}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Redesigned Table View */}
      <div className="hidden w-full md:block border border-border/75 rounded-2xl shadow-2xs bg-background overflow-hidden relative">
        {/* View Mode Segmented Switcher Bar */}
        <div className="flex items-center justify-between p-2 bg-muted/30 border-b border-border/60">
          <div className="flex items-center gap-1.5 bg-background/80 p-1 rounded-xl border border-border/50 shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode("quick")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === "quick"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Zap className="h-3.5 w-3.5" />
              <span>{isAr ? "الأسعار والمخزون السريع" : "Quick Stock & Prices"}</span>
              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 ms-1">
                {isAr ? "بدون تمرير" : "Zero Scroll"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("barcodes")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === "barcodes"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Barcode className="h-3.5 w-3.5" />
              <span>{isAr ? "الباركود و SKU" : "Barcodes & SKUs"}</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("full")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === "full"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <TableProperties className="h-3.5 w-3.5" />
              <span>{isAr ? "المصفوفة الكاملة" : "Full Matrix"}</span>
            </button>
          </div>

          <div className="text-[11px] font-bold text-muted-foreground px-2">
            {variants.length} {isAr ? "متغيرات" : "variants"}
          </div>
        </div>

        <div className="w-full overflow-x-auto os-scrollbar">
          <table className="w-full text-xs text-start border-collapse min-w-[700px]">
            <thead>
              <tr className="text-start text-xs uppercase tracking-wider border-b bg-muted/40 font-semibold text-muted-foreground">
                <th className="px-2 py-3 text-center align-middle">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer transition-all"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-2 py-3 text-start font-black text-[10px]">
                  {(() => {
                    const sizeLbl =
                      (isAr ? product?.variant_label_size_ar : product?.variant_label_size_en) ||
                      product?.variant_label_size_en ||
                      product?.variant_label_size_ar ||
                      (isAr ? "المقاس" : "Size");
                    const colorLbl =
                      (isAr ? product?.variant_label_color_ar : product?.variant_label_color_en) ||
                      product?.variant_label_color_en ||
                      product?.variant_label_color_ar ||
                      (isAr ? "اللون" : "Color");
                    const fabricLbl =
                      (isAr
                        ? product?.variant_label_fabric_ar
                        : product?.variant_label_fabric_en) ||
                      product?.variant_label_fabric_en ||
                      product?.variant_label_fabric_ar ||
                      (isAr ? "الخامة" : "Fabric");
                    return isAr
                      ? `المتغير (${sizeLbl} / ${colorLbl} / ${fabricLbl})`
                      : `Variant (${sizeLbl} / ${colorLbl} / ${fabricLbl})`;
                  })()}
                </th>
                {renderImageCol && (
                  <th className="px-2 py-3 text-center font-black text-[10px]">
                    {isAr ? "الصورة" : "Image"}
                  </th>
                )}
                {renderSkuCol && (
                  <th className="px-2 py-3 text-start font-black text-[10px]">
                    {t("inventory.sku")}
                  </th>
                )}
                {renderBarcodeCol && (
                  <th className="px-2 py-3 text-start font-black text-[10px]">{barcodeLabel}</th>
                )}
                {canViewFinancials && (
                  <th className="px-2 py-3 text-center font-black text-[10px]">
                    {t("inventory.cost")}
                  </th>
                )}
                <th className="px-2 py-3 text-center font-black text-[10px]">
                  {isAr ? "سعر التخفيض" : "Sale Price"}
                </th>
                <th className="px-2 py-3 text-center font-black text-[10px]">
                  {isAr ? "السعر العادي" : "Regular Price"}
                </th>
                {canViewFinancials && (
                  <th className="px-2 py-3 text-center font-black text-[10px]">
                    {t("inventory.margin")}
                  </th>
                )}
                <th className="px-2 py-3 text-center font-black text-[10px]">{mainLabel}</th>
                <th className="px-2 py-3 text-center font-black text-[10px]">{incLabel}</th>
                <th className="px-2 py-3 text-center font-black text-[10px]">
                  {t("inventory.stock")}
                </th>
                <th aria-label={isAr ? "الإجراءات" : "Actions"}></th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <VariantDesktopRow
                  key={v.id}
                  v={v}
                  canViewFinancials={canViewFinancials}
                  barcodeLabel={barcodeLabel}
                  SIZE_UNITS={SIZE_UNITS}
                  salesByVariant={salesByVariant}
                  t={t}
                  isAr={isAr}
                  brand={brand}
                  update={update}
                  productName={productName}
                  businessName={businessName}
                  genBarcode={genBarcode}
                  del={del}
                  isSelected={selectedIds.has(v.id)}
                  onToggleSelect={() => toggleSelect(v.id)}
                  renderImageCol={renderImageCol}
                  renderSkuCol={renderSkuCol}
                  renderBarcodeCol={renderBarcodeCol}
                  product={product}
                />
              ))}

              {/* Adding desktop row (perfect matching design) */}
              {adding && (
                <tr className="border-t border-border bg-secondary/30 animate-in fade-in duration-150">
                  <td></td>
                  {/* Variant (combined attributes inputs) */}
                  <td className="px-2 py-3">
                    <div className="grid grid-cols-2 gap-1.5 max-w-[320px]">
                      <div className="flex gap-1">
                        <Input
                          className="h-8 w-16 text-start text-xs font-semibold"
                          value={row.size}
                          onChange={(e) => setRow({ ...row, size: e.target.value })}
                          placeholder={
                            (isAr
                              ? product?.variant_label_size_ar
                              : product?.variant_label_size_en) ||
                            product?.variant_label_size_en ||
                            product?.variant_label_size_ar ||
                            "Size"
                          }
                        />
                        <select
                          className="h-8 rounded border border-input bg-background px-1 text-xs outline-none"
                          value={row.size_unit}
                          onChange={(e) => setRow({ ...row, size_unit: e.target.value })}
                        >
                          {SIZE_UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u === "" ? "—" : u}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Input
                        className="h-8 w-full text-xs font-semibold"
                        value={row.color}
                        onChange={(e) => setRow({ ...row, color: e.target.value })}
                        placeholder={
                          (isAr
                            ? product?.variant_label_color_ar
                            : product?.variant_label_color_en) ||
                          product?.variant_label_color_en ||
                          product?.variant_label_color_ar ||
                          "Color"
                        }
                      />
                      <Input
                        className="h-8 w-full text-xs font-semibold col-span-2"
                        value={row.fabric}
                        onChange={(e) => setRow({ ...row, fabric: e.target.value })}
                        placeholder={
                          (isAr
                            ? product?.variant_label_fabric_ar
                            : product?.variant_label_fabric_en) ||
                          product?.variant_label_fabric_en ||
                          product?.variant_label_fabric_ar ||
                          "Fabric"
                        }
                      />
                    </div>
                  </td>

                  {/* Optional Image */}
                  {renderImageCol && <td></td>}

                  {/* Optional SKU */}
                  {renderSkuCol && (
                    <td className="px-2 py-3">
                      <Input
                        className="h-8 w-full text-xs font-mono"
                        value={row.sku}
                        placeholder="SKU"
                        onChange={(e) => setRow({ ...row, sku: e.target.value })}
                      />
                    </td>
                  )}

                  {/* Optional Barcode */}
                  {renderBarcodeCol && (
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-1">
                        <Input
                          className="h-8 w-full text-xs font-mono"
                          value={row.barcode}
                          placeholder={barcodeLabel}
                          onChange={(e) => setRow({ ...row, barcode: e.target.value })}
                        />
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-primary p-1 rounded-sm hover:bg-secondary touch-manipulation active:scale-95 transition"
                          onClick={(e) => {
                            e.preventDefault();
                            setRow({ ...row, barcode: genBarcode() });
                          }}
                        >
                          <Wand2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  )}

                  {/* Financials (Cost) */}
                  {canViewFinancials && (
                    <td className="px-2 py-3 text-center">
                      <div className="relative inline-flex items-center w-full max-w-[100px] shrink-0">
                        <Input
                          className="h-8 w-full bg-muted/50 pl-2 pr-7 text-center text-xs font-bold text-muted-foreground disabled:cursor-not-allowed disabled:opacity-100"
                          type="number"
                          step="0.001"
                          value={row.cost_price}
                          disabled
                        />
                        <span className="absolute right-2 text-[8px] font-black text-muted-foreground/50 pointer-events-none uppercase">
                          BHD
                        </span>
                      </div>
                    </td>
                  )}

                  {/* Selling Price */}
                  <td className="px-2 py-3 text-center">
                    <div className="relative inline-flex items-center w-full max-w-[100px] shrink-0">
                      <Input
                        className="h-8 w-full pl-2 pr-7 text-center text-xs font-bold"
                        type="number"
                        step="0.001"
                        value={row.selling_price}
                        onChange={(e) => setRow({ ...row, selling_price: e.target.value })}
                      />
                      <span className="absolute right-2 text-[8px] font-black text-muted-foreground/50 pointer-events-none uppercase">
                        BHD
                      </span>
                    </div>
                  </td>

                  {/* Original Price */}
                  <td className="px-2 py-3 text-center">
                    <Input
                      className="h-8 w-full text-center text-xs max-w-[100px]"
                      type="number"
                      step="0.001"
                      min="0"
                      value={product?.base_price ?? 0}
                      disabled
                    />
                  </td>

                  {/* Margin column (blank on add) */}
                  {canViewFinancials && <td></td>}

                  {/* Main Stock */}
                  <td className="px-2 py-3 text-center">
                    <Input
                      className="h-8 w-full text-center text-xs max-w-[80px] font-bold"
                      type="number"
                      value={row.stock_main}
                      onChange={(e) => setRow({ ...row, stock_main: e.target.value })}
                    />
                  </td>

                  {/* Incubator Stock */}
                  <td className="px-2 py-3 text-center">
                    <Input
                      className="h-8 w-full text-center text-xs max-w-[80px] font-bold"
                      type="number"
                      value={row.stock_incubator}
                      onChange={(e) => setRow({ ...row, stock_incubator: e.target.value })}
                    />
                  </td>

                  {/* Total stock & Actions */}
                  <td></td>
                  <td className="px-2 py-3">
                    <div className="flex justify-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 px-3 rounded-lg text-xs font-bold"
                        onClick={(e) => {
                          e.preventDefault();
                          add();
                        }}
                      >
                        {t("common.save")}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-xs"
                        onClick={(e) => {
                          e.preventDefault();
                          setAdding(false);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Control Buttons Footer */}
      <div className="mt-4.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {!adding && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 px-3.5 rounded-xl text-xs font-bold hover:bg-secondary/40 touch-manipulation"
              onClick={(e) => {
                e.preventDefault();
                startAdding();
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> {t("inventory.addVariant")}
            </Button>
          )}
          <BulkVariantDialog
            productId={productId}
            product={product}
            variants={variants}
            canViewFinancials={canViewFinancials}
            onChanged={onChanged}
          />
        </div>
      </div>

      {/* FLOATING BULK ACTIONS TOOLBAR */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 max-w-[95vw] overflow-x-auto bg-white/85 dark:bg-black/75 backdrop-blur-2xl backdrop-saturate-200 border border-white/50 dark:border-white/15 shadow-2xl rounded-2xl py-2.5 px-4 flex items-center gap-3 z-55 animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center gap-2 border-r border-border pr-4 shrink-0">
            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[10px] text-primary-foreground font-black">
              {selectedIds.size}
            </div>
            <span className="text-xs font-bold text-muted-foreground">
              {isAr ? "محدد" : "selected"}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground rounded-lg px-2.5"
              onClick={bulkSetPrice}
            >
              {isAr ? "تحديد السعر" : "Set Price"}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground rounded-lg px-2.5"
              onClick={() => bulkAddStock(5)}
            >
              {isAr ? "مخزون 5+" : "+5 Stock"}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground rounded-lg px-2.5"
              onClick={() => bulkAddStock(10)}
            >
              {isAr ? "مخزون 10+" : "+10 Stock"}
            </Button>
            {canViewFinancials && (
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground rounded-lg px-2.5"
                onClick={bulkApplyMarkup}
              >
                {isAr ? "تطبيق الهامش" : "Cost Markup %"}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="h-8 text-xs font-bold rounded-lg px-2.5"
              onClick={bulkDelete}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              {isAr ? "حذف" : "Delete"}
            </Button>
          </div>

          <button
            type="button"
            className="p-1 rounded-md hover:bg-muted text-muted-foreground/60 transition-colors ml-2"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function CustomizationsSection({
  brandId,
  items,
  products,
  onChanged,
}: {
  brandId: string;
  items: Customization[];
  products: Product[];
  onChanged: () => void;
}) {
  const t = useT();
  const isAr = useI18n().lang === "ar";
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState("");

  const [editingAddon, setEditingAddon] = useState<Customization | null>(null);
  const [editProductIds, setEditingProductIds] = useState<string[]>([]);
  const [editSearch, setEditSearch] = useState("");

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const q = productSearch.toLowerCase().trim();
    return products.filter(
      (p) =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q)),
    );
  }, [products, productSearch]);

  const filteredEditProducts = useMemo(() => {
    if (!editSearch.trim()) return products;
    const q = editSearch.toLowerCase().trim();
    return products.filter(
      (p) =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q)),
    );
  }, [products, editSearch]);

  const toggleProductForNew = (pid: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid],
    );
  };

  const toggleProductForEdit = (pid: string) => {
    setEditingProductIds((prev) =>
      prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid],
    );
  };

  const add = async () => {
    if (!name.trim()) return;
    if (scope === "selected" && selectedProductIds.length === 0) {
      toast.error(
        isAr
          ? "يرجى اختيار منتج واحد على الأقل أو تحديد 'جميع المنتجات'"
          : "Please select at least one product or choose 'All products'",
      );
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await (supabase.from("customization_options") as any).insert({
      user_id: user.id,
      brand_id: brandId,
      name: name.trim(),
      price_delta: Number(price),
      product_ids: scope === "all" ? [] : selectedProductIds,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(isAr ? "تمت إضافة خيار التخصيص بنجاح" : "Customization add-on created");
      setName("");
      setPrice("0");
      setScope("all");
      setSelectedProductIds([]);
      onChanged();
    }
  };

  const saveProductScope = async () => {
    if (!editingAddon) return;
    const { error } = await (supabase.from("customization_options") as any)
      .update({
        product_ids: editProductIds,
      })
      .eq("id", editingAddon.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(isAr ? "تم تحديث المنتجات المخصصة للإضافة" : "Add-on products updated");
      setEditingAddon(null);
      onChanged();
    }
  };

  const del = async (id: string) => {
    const { error } = await supabase.from("customization_options").delete().eq("id", id);
    if (error) toast.error(error.message);
    else onChanged();
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6">
        <h3 className="font-bold text-base mb-1">
          {isAr ? "إضافة إضافات وتخصيصات جديدة" : "Add Customization Add-ons"}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">{t("inventory.addonsIntro")}</p>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4 items-end">
          <div className="md:col-span-6">
            <Label className="text-xs mb-1 block">{isAr ? "اسم الإضافة" : "Add-on Name"}</Label>
            <Input
              placeholder={t("inventory.addonName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="md:col-span-3">
            <Label className="text-xs mb-1 block">{isAr ? "السعر الإضافي" : "Price Delta"}</Label>
            <Input
              type="number"
              step="0.01"
              placeholder={t("inventory.addonPrice")}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div className="md:col-span-3">
            <Button onClick={add} className="w-full">
              <Plus className="h-4 w-4 me-1" />
              {isAr ? "إضافة للإضافة" : "Create Add-on"}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 mb-4 space-y-3">
          <Label className="text-xs font-bold text-foreground block">
            {isAr ? "نطاق التطبيق (المنتجات المتاحة فيها هذه الإضافة):" : "Applies to Products:"}
          </Label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setScope("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                scope === "all"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-background border border-border hover:bg-muted"
              }`}
            >
              🌐 {isAr ? "جميع المنتجات في المخزون" : "All Products"}
            </button>
            <button
              type="button"
              onClick={() => setScope("selected")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                scope === "selected"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-background border border-border hover:bg-muted"
              }`}
            >
              🎯 {isAr ? "منتجات محددة فقط" : "Chosen Products Only"}{" "}
              {selectedProductIds.length > 0 && `(${selectedProductIds.length})`}
            </button>
          </div>

          {scope === "selected" && (
            <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="absolute start-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder={isAr ? "ابحث باسم المنتج أو القسم..." : "Search product..."}
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="ps-9 h-8 text-xs rounded-lg"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    if (selectedProductIds.length === products.length) {
                      setSelectedProductIds([]);
                    } else {
                      setSelectedProductIds(products.map((p) => p.id));
                    }
                  }}
                >
                  {selectedProductIds.length === products.length
                    ? isAr
                      ? "إلغاء الكل"
                      : "Deselect All"
                    : isAr
                      ? "تحديد الكل"
                      : "Select All"}
                </Button>
              </div>

              <div className="max-h-48 overflow-y-auto divide-y divide-border/40 rounded-lg border border-border/60 bg-background/80 p-1">
                {filteredProducts.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3 text-center">
                    {isAr ? "لا توجد منتجات مطابقة" : "No matching products found"}
                  </p>
                ) : (
                  filteredProducts.map((p) => {
                    const isChecked = selectedProductIds.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        onClick={() => toggleProductForNew(p.id)}
                        className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-md cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                        />
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt=""
                            className="h-7 w-7 rounded object-cover border border-border"
                          />
                        ) : (
                          <div className="h-7 w-7 rounded bg-muted flex items-center justify-center text-[10px]">
                            📦
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{p.name}</p>
                          {p.category && (
                            <p className="text-[10px] text-muted-foreground">{p.category}</p>
                          )}
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div className="pt-2">
          <h4 className="font-bold text-sm mb-3">
            {isAr ? "قائمة إضافات التخصيص المتاحة:" : "Existing Customization Add-ons"}
          </h4>

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("inventory.noAddons")}</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border/60 bg-background/50 overflow-hidden">
              {items.map((i) => {
                const pIds = Array.isArray(i.product_ids) ? i.product_ids : [];
                const isAll = pIds.length === 0;

                return (
                  <li
                    key={i.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{i.name}</p>
                        <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                          + {formatMoney(Number(i.price_delta))}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {isAll ? (
                          <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 font-medium">
                            🌐 {isAr ? "متاح لكل المنتجات" : "All products"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-amber-600 dark:text-amber-400 font-medium">
                            🎯{" "}
                            {isAr ? `${pIds.length} منتج محدد` : `${pIds.length} chosen products`}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs font-medium rounded-lg"
                        onClick={() => {
                          setEditingAddon(i);
                          setEditingProductIds(Array.isArray(i.product_ids) ? i.product_ids : []);
                          setEditSearch("");
                        }}
                      >
                        <Boxes className="h-3.5 w-3.5 me-1" />
                        {isAr ? "تخصيص المنتجات" : "Assign Products"}
                      </Button>

                      <InventoryDeleteAction
                        message={t("common.confirmDelete")}
                        onConfirm={() => del(i.id)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      <Dialog open={!!editingAddon} onOpenChange={(open) => !open && setEditingAddon(null)}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Boxes className="h-5 w-5 text-primary" />
              {isAr
                ? `تحديد المنتجات المتاحة للإضافة: ${editingAddon?.name ?? ""}`
                : `Assign Products to: ${editingAddon?.name ?? ""}`}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={isAr ? "ابحث باسم المنتج..." : "Search product..."}
                  value={editSearch}
                  onChange={(e) => setEditSearch(e.target.value)}
                  className="ps-9 text-xs rounded-xl"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => {
                  if (editProductIds.length === products.length) {
                    setEditingProductIds([]);
                  } else {
                    setEditingProductIds(products.map((p) => p.id));
                  }
                }}
              >
                {editProductIds.length === products.length
                  ? isAr
                    ? "إلغاء الكل"
                    : "Deselect All"
                  : isAr
                    ? "تحديد الكل"
                    : "Select All"}
              </Button>
            </div>

            <div className="flex items-center gap-2 text-xs mb-2">
              <button
                type="button"
                className={`px-3 py-1 rounded-md text-xs font-medium border ${
                  editProductIds.length === 0
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-muted"
                }`}
                onClick={() => setEditingProductIds([])}
              >
                🌐 {isAr ? "تطبيق على جميع المنتجات" : "Apply to All Products"}
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-border/40 rounded-xl border border-border/60 bg-card p-1">
              {filteredEditProducts.length === 0 ? (
                <p className="text-xs text-muted-foreground p-4 text-center">
                  {isAr ? "لا توجد منتجات مطابقة" : "No matching products found"}
                </p>
              ) : (
                filteredEditProducts.map((p) => {
                  const isChecked = editProductIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      onClick={() => toggleProductForEdit(p.id)}
                      className="flex items-center gap-3 p-2.5 hover:bg-muted/40 rounded-lg cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt=""
                          className="h-8 w-8 rounded object-cover border border-border"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-xs">
                          📦
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{p.name}</p>
                        {p.category && (
                          <p className="text-[10px] text-muted-foreground">{p.category}</p>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditingAddon(null)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button onClick={saveProductScope}>
              <Check className="h-4 w-4 me-1" />
              {isAr ? "حفظ التغييرات" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
