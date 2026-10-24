import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Users, CheckCircle2, Download, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { parseCSV } from "@/lib/csv-parser";
import { sanitizeGCCPhone } from "@/lib/os-formatting";
import { importCustomerDatabase } from "@/lib/customer-importer";
import { downloadTemplate } from "@/features/import-export/lib/import-templates";
import { arNounOblique } from "@/lib/arabic-count";

// -------------------------------------------------------------
// Component: Customer Import Section
// -------------------------------------------------------------
export function CustomerImportSection({
  brandId,
  isAr,
  onComplete,
}: {
  brandId: string;
  isAr: boolean;
  onComplete: () => void;
}) {
  const [selectedPreset, setSelectedPreset] = useState<
    "shopify" | "salla" | "zid" | "woocommerce" | "whatsapp" | "custom"
  >("shopify");
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, number>>({
    name: -1,
    phone: -1,
    email: -1,
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
        toast.error(isAr ? "الملف فارغ" : "File is empty");
        return;
      }

      const fileHeaders = rows[0].map((h) => h.trim());
      setHeaders(fileHeaders);
      setParsedRows(rows.slice(1));

      // Auto detect phone, name, email
      const newMap = { name: -1, phone: -1, email: -1 };
      fileHeaders.forEach((h, idx) => {
        const lower = h.toLowerCase();
        if (lower.includes("phone") || lower.includes("جوال") || lower.includes("هاتف")) {
          newMap.phone = idx;
        } else if (lower.includes("name") || lower.includes("اسم")) {
          newMap.name = idx;
        } else if (lower.includes("email") || lower.includes("بريد")) {
          newMap.email = idx;
        }
      });

      setMappings(newMap);
      setStep("map");
    };
    reader.readAsText(file);
  };

  const executeImport = async () => {
    if (mappings.name === -1 && mappings.phone === -1) {
      toast.error(isAr ? "يجب ربط حقل الاسم أو الجوال على الأقل" : "Please map name or phone");
      return;
    }

    setIsProcessing(true);

    try {
      const customersToInsert = parsedRows
        .map((row) => {
          const rawName = mappings.name !== -1 ? row[mappings.name]?.trim() : "";
          const rawPhone = mappings.phone !== -1 ? row[mappings.phone]?.trim() : "";
          const rawEmail = mappings.email !== -1 ? row[mappings.email]?.trim() : "";

          const sanitizedPhone = rawPhone ? sanitizeGCCPhone(rawPhone) : null;

          return {
            name: rawName || (sanitizedPhone ? `عميل ${sanitizedPhone}` : "عميل مسجّل"),
            phone: sanitizedPhone,
            email: rawEmail || null,
            notes: `Source: ${selectedPreset}`,
            totalOrders: 0,
            totalSpend: 0,
            tags: [selectedPreset],
          };
        })
        .filter((c) => c.name || c.phone || c.email);

      let insertedCount = 0;
      const batchSize = 50;

      for (let i = 0; i < customersToInsert.length; i += batchSize) {
        const batch = customersToInsert.slice(i, i + batchSize);
        const result = await importCustomerDatabase({
          data: {
            brandId,
            customers: batch,
          },
        });
        insertedCount += result.successCount;
      }

      setLastCount(insertedCount);
      setStep("success");
      toast.success(
        isAr
          ? `تم استيراد ${insertedCount} جهة اتصال بنجاح!`
          : `Successfully imported ${insertedCount} contacts!`,
      );
      onComplete();
    } catch (err: any) {
      console.error(err);
      toast.error(isAr ? "فشل استيراد العملاء" : "Failed to import customers");
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
              <Users className="h-5 w-5 text-primary" />
              {isAr ? "ترحيل واستيراد قاعدة العملاء" : "Customer CRM Migration"}
            </CardTitle>
            <CardDescription>
              {isAr
                ? "انقل بيانات عملائك وأرقام جوالاتهم مع تنقية الأرقام الخليجية تلقائياً لمنع التكرار"
                : "Migrate customer contacts with automatic GCC mobile sanitization and deduplication"}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadTemplate("customers")}
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
            <div>
              <label className="text-xs font-bold text-foreground mb-2 block">
                {isAr ? "اختر صيغة الملف المصدر:" : "Source Format:"}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                {[
                  { id: "shopify", label: "Shopify" },
                  { id: "salla", label: isAr ? "سلة" : "Salla" },
                  { id: "zid", label: isAr ? "زد" : "Zid" },
                  { id: "woocommerce", label: "WooCommerce" },
                  { id: "whatsapp", label: isAr ? "جهات واتساب" : "WhatsApp" },
                  { id: "custom", label: isAr ? "مخصص" : "Custom" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedPreset(item.id as any)}
                    className={`p-2.5 rounded-lg border text-center transition-all text-xs font-semibold ${
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

            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-all bg-muted/20">
              <Users className="h-10 w-10 mx-auto text-primary mb-3" />
              <h3 className="text-sm font-bold text-foreground mb-1">
                {isAr ? "ارفع ملف CSV للعملاء" : "Upload Customer CSV File"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
                {isAr
                  ? "يدعم أرقام الجوال الخليجية (البحرين، السعودية، الإمارات، الكويت، قطر، عمان)"
                  : "Supports GCC regional phone numbers with smart prefix cleaning"}
              </p>
              <label className="inline-block">
                <span className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-4 py-2 text-xs font-bold hover:bg-primary/90 cursor-pointer shadow-sm">
                  <Upload className="h-4 w-4 me-1.5" />
                  {isAr ? "اختيار ملف العملاء" : "Choose Customer File"}
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
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h4 className="text-sm font-bold text-foreground">
                {isAr ? "مطابقة حقول العملاء" : "Customer Fields Mapping"}
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep("upload")}
                className="text-xs"
              >
                {isAr ? "تغيير الملف" : "Change File"}
              </Button>
            </div>

            <div className="space-y-2.5 max-w-md">
              {[
                { field: "name", label: isAr ? "اسم العميل" : "Customer Name" },
                { field: "phone", label: isAr ? "رقم الجوال" : "Mobile Phone" },
                { field: "email", label: isAr ? "البريد الإلكتروني" : "Email Address" },
              ].map(({ field, label }) => (
                <div
                  key={field}
                  className="p-3 rounded-lg border border-border bg-muted/30 flex items-center justify-between"
                >
                  <span className="text-xs font-semibold text-foreground">{label}</span>
                  <select
                    value={mappings[field] ?? -1}
                    onChange={(e) =>
                      setMappings((prev) => ({ ...prev, [field]: Number(e.target.value) }))
                    }
                    className="h-8 rounded-md border border-border bg-background px-2 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 min-w-[150px]"
                  >
                    <option value={-1}>{isAr ? "— تخطي —" : "— Skip —"}</option>
                    {headers.map((h, idx) => (
                      <option key={idx} value={idx}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-4">
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
                {isAr ? "بدء استيراد العملاء" : "Import Customers"}
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
                {isAr ? "اكتمل استيراد العملاء بنجاح!" : "Customer Import Completed!"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                {isAr
                  ? `تم حفظ ${arNounOblique(lastCount, "customer")} في قاعدة البيانات مع ربط جهات الاتصال.`
                  : `Successfully recorded ${lastCount} customer profiles.`}
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
