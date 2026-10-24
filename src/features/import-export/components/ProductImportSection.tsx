import { useState } from "react";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { productImportFields } from "@/features/import-export/lib/store-columns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  Package,
  CheckCircle2,
  FileSpreadsheet,
  Download,
  Check,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { parseCSV } from "@/lib/csv-parser";
import { importProductCatalog } from "@/lib/universal-importer";
import { downloadTemplate } from "@/features/import-export/lib/import-templates";
import { arNoun } from "@/lib/arabic-count";

// -------------------------------------------------------------
// Component: Product Import Section
// -------------------------------------------------------------
export function ProductImportSection({
  brandId,
  isAr,
  onComplete,
}: {
  brandId: string;
  isAr: boolean;
  onComplete: () => void;
}) {
  const [selectedPreset, setSelectedPreset] = useState<
    "shopify" | "salla" | "zid" | "woocommerce" | "custom"
  >("shopify");
  const stock = useAdminStoreProfile(brandId).profile.modules.stock;
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, number>>({
    name: -1,
    price: -1,
    image: -1,
    stock: -1,
    sku: -1,
  });
  const [step, setStep] = useState<"upload" | "map" | "success">("upload");
  const [lastCount, setLastCount] = useState(0);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) {
        toast.error(
          isAr
            ? "الملف فارغ أو لا يحتوي على صفوف بيانات صالحة"
            : "CSV file is empty or missing data rows",
        );
        return;
      }

      const fileHeaders = rows[0].map((h) => h.trim());
      setHeaders(fileHeaders);
      setParsedRows(rows.slice(1));

      // Auto-detect columns
      const newMap: Record<string, number> = { name: -1, price: -1, image: -1, stock: -1, sku: -1 };
      fileHeaders.forEach((h, idx) => {
        const lower = h.toLowerCase();
        if (
          lower.includes("name") ||
          lower.includes("title") ||
          lower.includes("اسم") ||
          lower.includes("عنوان")
        ) {
          if (newMap.name === -1) newMap.name = idx;
        } else if (lower.includes("price") || lower.includes("سعر") || lower.includes("السعر")) {
          if (newMap.price === -1) newMap.price = idx;
        } else if (lower.includes("image") || lower.includes("صورة") || lower.includes("صور")) {
          if (newMap.image === -1) newMap.image = idx;
        } else if (
          lower.includes("stock") ||
          lower.includes("qty") ||
          lower.includes("quantity") ||
          lower.includes("كمية") ||
          lower.includes("مخزون")
        ) {
          if (newMap.stock === -1) newMap.stock = idx;
        } else if (lower.includes("sku") || lower.includes("رمز")) {
          if (newMap.sku === -1) newMap.sku = idx;
        }
      });

      setMappings(newMap);
      setStep("map");
    };
    reader.readAsText(file);
  };

  const executeImport = async () => {
    if (mappings.name === -1) {
      toast.error(isAr ? "يجب ربط حقل اسم المنتج على الأقل" : "Please map product name");
      return;
    }

    setIsProcessing(true);
    setProgressMsg(isAr ? "جاري تجهيز المنتجات للترحيل..." : "Preparing products for migration...");

    try {
      const sessionId = crypto.randomUUID();
      const rawProducts = parsedRows.map((row, index) => {
        const nameVal = mappings.name !== -1 ? row[mappings.name]?.trim() : `Product ${index + 1}`;
        const priceVal =
          mappings.price !== -1
            ? parseFloat(row[mappings.price]?.replace(/[^\d.]/g, "") || "10") || 10
            : 10;
        const imageVal = mappings.image !== -1 ? row[mappings.image]?.trim() || null : null;
        const stockVal =
          mappings.stock !== -1
            ? parseInt(row[mappings.stock]?.replace(/[^\d]/g, "") || "10") || 10
            : 10;
        const skuVal =
          mappings.sku !== -1 && row[mappings.sku]?.trim()
            ? row[mappings.sku].trim().toUpperCase()
            : `SKU-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

        return {
          name: nameVal || `Product ${index + 1}`,
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
              size: null,
              size_unit: null,
              color: null,
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

      const batchSize = 10;
      let inserted = 0;

      for (let i = 0; i < rawProducts.length; i += batchSize) {
        const chunk = rawProducts.slice(i, i + batchSize);
        setProgressMsg(
          isAr
            ? `جاري حفظ الدفعة (${i + 1} إلى ${Math.min(i + batchSize, rawProducts.length)})...`
            : `Inserting batch (${i + 1} - ${Math.min(i + batchSize, rawProducts.length)})...`,
        );

        const result = await importProductCatalog({
          data: {
            brandId,
            importSessionId: sessionId,
            batchIndex: Math.floor(i / batchSize),
            source: selectedPreset,
            products: chunk,
          },
        });
        inserted += result.successCount;
      }

      setLastCount(inserted);
      setStep("success");
      toast.success(
        isAr
          ? `تم استيراد ${arNoun(inserted, "product")} بنجاح!`
          : `Successfully imported ${inserted} products!`,
      );
      onComplete();
    } catch (err: any) {
      console.error(err);
      toast.error(isAr ? "فشل استيراد المنتجات" : "Product import failed");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              {isAr ? "ترحيل واستيراد كتالوج المنتجات" : "Product Catalog Migration"}
            </CardTitle>
            <CardDescription>
              {isAr
                ? "ارفع ملف CSV من متجرك السابق وسيتم استيراد المنتجات، الأسعار، والمخزون مباشرة"
                : "Upload a CSV export from your previous platform to populate inventory seamlessly"}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadTemplate("products", stock)}
            className="h-8 gap-1.5 text-xs self-start sm:self-center"
          >
            <Download className="h-3.5 w-3.5" />
            {isAr ? "تحميل نموذج CSV تجريبي" : "Download Sample CSV"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {step === "upload" && (
          <div className="space-y-5">
            {/* Platform Presets */}
            <div>
              <label className="text-xs font-bold text-foreground mb-2 block">
                {isAr ? "اختر المنصة المصدر للملف:" : "Select Source Platform:"}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {[
                  { id: "shopify", label: "Shopify" },
                  { id: "salla", label: isAr ? "سلة (Salla)" : "Salla" },
                  { id: "zid", label: isAr ? "زد (Zid)" : "Zid" },
                  { id: "woocommerce", label: "WooCommerce" },
                  { id: "custom", label: isAr ? "ملف مخصص" : "Custom CSV" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedPreset(item.id as any)}
                    className={`p-3 rounded-lg border text-center transition-all text-xs font-semibold ${
                      selectedPreset === item.id
                        ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                        : "border-border hover:border-border-strong text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dropzone */}
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-all bg-muted/20">
              <FileSpreadsheet className="h-10 w-10 mx-auto text-primary mb-3" />
              <h3 className="text-sm font-bold text-foreground mb-1">
                {isAr ? "ارفع ملف CSV للمنتجات" : "Upload Product CSV File"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
                {isAr
                  ? "يدعم الملفات المصدرة من المنصات العالمية والعربية مع ترميز UTF-8"
                  : "Supports UTF-8 CSV exports from all regional & global platforms"}
              </p>
              <label className="inline-block">
                <span className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-4 py-2 text-xs font-bold hover:bg-primary/90 cursor-pointer shadow-sm">
                  <Upload className="h-4 w-4 me-1.5" />
                  {isAr ? "اختيار ملف CSV" : "Choose CSV File"}
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h4 className="text-sm font-bold text-foreground">
                  {isAr ? "مطابقة الأعمدة والحقول" : "Field Mapping"}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? `تم اكتشاف ${parsedRows.length} صف من البيانات. راجع ربط الأعمدة:`
                    : `Detected ${parsedRows.length} rows. Verify column bindings:`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep("upload")}
                className="text-xs"
              >
                {isAr ? "تغيير الملف" : "Change File"}
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto p-1">
              {productImportFields(stock, isAr).map(({ field, label }) => (
                <div
                  key={field}
                  className="p-2.5 rounded-lg border border-border bg-muted/30 flex items-center justify-between gap-2"
                >
                  <span className="text-xs font-medium text-foreground">{label}</span>
                  <select
                    value={mappings[field] ?? -1}
                    onChange={(e) =>
                      setMappings((prev) => ({ ...prev, [field]: Number(e.target.value) }))
                    }
                    className="h-8 rounded-md border border-border bg-background px-2 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 max-w-[160px]"
                  >
                    <option value={-1}>{isAr ? "— تخطي الحقل —" : "— Skip —"}</option>
                    {headers.map((h, idx) => (
                      <option key={idx} value={idx}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {isProcessing && (
              <div className="space-y-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-xs font-semibold text-primary">{progressMsg}</p>
                <Progress value={50} className="h-1.5" />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep("upload")}
                disabled={isProcessing}
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={executeImport}
                disabled={isProcessing}
                className="gap-1.5 font-bold"
              >
                {isProcessing ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                {isAr ? "بدء استيراد الكتالوج" : "Start Importing"}
              </Button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="py-8 text-center space-y-4">
            <div className="h-14 w-14 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                {isAr ? "اكتمل استيراد المنتجات بنجاح!" : "Catalog Migration Completed!"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                {isAr
                  ? `تمت إضافة ${arNoun(lastCount, "product")} بنجاح إلى مخزونك. أصبحت جاهزة للتعديل والعرض في المتجر.`
                  : `Successfully added ${lastCount} products to your store inventory.`}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setParsedRows([]);
                setHeaders([]);
                setStep("upload");
              }}
              className="text-xs font-semibold"
            >
              {isAr ? "استيراد ملف إضافي" : "Import Another File"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
