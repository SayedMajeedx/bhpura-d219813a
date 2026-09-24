import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { importProductCatalog } from "@/lib/universal-importer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Sparkles, Upload, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { parseCSV } from "@/lib/csv-parser";

import {
  DEFAULT_PRODUCT_MAPPINGS,
  detectProductColumns,
  buildProductImportPayload,
  mergeImportRunsBySession,
} from "@/features/inventory/lib/product-import";

type ImportIssueItem = { row: number; code: string; name: string };

export function ProductImporterModal(props: {
  brandId: string;
  onComplete: () => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  renderTrigger?: (onClick: () => void) => React.ReactNode;
}) {
  const {
    brandId,
    onComplete,
    isOpen: controlledIsOpen,
    onOpenChange: setControlledIsOpen,
    renderTrigger,
  } = props;
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = setControlledIsOpen || setInternalIsOpen;
  const [step, setStep] = useState<"preset" | "mapper" | "importing" | "success">("preset");
  const [preset, setPreset] = useState<string>("custom");
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, number>>(DEFAULT_PRODUCT_MAPPINGS);
  const [progress, setProgress] = useState("");
  const [successCount, setSuccessCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [importIssues, setImportIssues] = useState<ImportIssueItem[]>([]);
  const [importSessionId, setImportSessionId] = useState(() => crypto.randomUUID());
  const [totalCount, setTotalCount] = useState(0);
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const importHistoryQuery = useQuery({
    queryKey: ["product-import-history", brandId],
    enabled: isOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_runs")
        .select(
          "id,session_id,source,status,total_count,success_count,skipped_count,failed_count,created_at",
        )
        .eq("brand_id", brandId)
        .eq("entity_type", "products")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return mergeImportRunsBySession(data ?? [], 5);
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

      setMappings(detectProductColumns(fileHeaders));

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

    try {
      const { products: consolidatedPayload, invalidCount } = buildProductImportPayload({
        rows: dataRows,
        headers: headersList,
        preset,
        mappings: finalMappings,
        isAr,
      });
      if (invalidCount > 0) setFailedCount((count) => count + invalidCount);
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
      ) : controlledIsOpen !== undefined ? null : (
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
        <DialogContent className="max-w-xl border-border bg-card/95 backdrop-blur-xl">
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
                    className={`flex flex-col items-start p-3.5 rounded-xl border border-border bg-muted/30 text-start transition-all ${item.color} ${
                      preset === item.id
                        ? "border-primary ring-2 ring-primary/10 bg-primary/5 dark:bg-primary/5"
                        : ""
                    }`}
                  >
                    <span className="text-sm font-semibold font-display text-foreground block">
                      {item.name}
                    </span>
                    <span className="text-xs text-muted-foreground block mt-0.5">{item.desc}</span>
                  </button>
                ))}
              </div>

              <div className="pt-4 border-t border-border flex justify-end">
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
                <div className="space-y-2 border-t border-border-subtle pt-4">
                  <p className="text-xs font-semibold">
                    {isAr ? "آخر عمليات الاستيراد" : "Recent imports"}
                  </p>
                  {importHistoryQuery.data!.map((run: any) => (
                    <div
                      key={run.session_id}
                      className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs"
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
                    className="flex items-center justify-between gap-4 p-3 bg-muted/40 rounded-xl border border-border"
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

              <div className="rounded-xl border border-border-strong bg-muted/20 p-3">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold">
                  <span>{isAr ? "معاينة البيانات" : "Data preview"}</span>
                  <span className="text-muted-foreground">
                    {parsedRows.length} {isAr ? "صف" : "rows"}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-xs">
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

              <div className="pt-4 border-t border-border flex justify-end">
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
              <div className="w-full max-w-xs bg-muted h-1.5 rounded-full overflow-hidden">
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
                <h3 className="text-lg font-bold font-display text-foreground">
                  {isAr ? "اكتمل استيراد الكتالوج بنجاح!" : "Catalog Migration Completed!"}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                  {isAr
                    ? `تم استيراد ${successCount} منتج، وتخطي ${skippedCount} مكرر، وتعذر ${failedCount}.`
                    : `Imported ${successCount} products, skipped ${skippedCount} duplicates, and ${failedCount} failed.`}
                </p>
                {importIssues.length > 0 && (
                  <p className="text-xs text-amber-600">
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
