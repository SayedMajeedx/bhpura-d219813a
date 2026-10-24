import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, ReceiptText, CheckCircle2, Download, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { parseCSV } from "@/lib/csv-parser";
import { sanitizeGCCPhone } from "@/lib/os-formatting";
import { importHistoricalOrders } from "@/lib/order-importer";
import { downloadTemplate } from "@/features/import-export/lib/import-templates";
import { arNounOblique } from "@/lib/arabic-count";

// -------------------------------------------------------------
// Component: Order Import Section
// -------------------------------------------------------------
export function OrderImportSection({
  brandId,
  isAr,
  onComplete,
}: {
  brandId: string;
  isAr: boolean;
  onComplete: () => void;
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, number>>({
    order_number: -1,
    order_date: -1,
    customer_name: -1,
    customer_phone: -1,
    total_price: -1,
    item_name: -1,
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

      // Auto header detection
      const newMap: Record<string, number> = {
        order_number: -1,
        order_date: -1,
        customer_name: -1,
        customer_phone: -1,
        total_price: -1,
        item_name: -1,
      };

      fileHeaders.forEach((h, idx) => {
        const lower = h.toLowerCase();
        if (lower.includes("order") && lower.includes("number")) newMap.order_number = idx;
        else if (lower.includes("date") || lower.includes("تاريخ")) newMap.order_date = idx;
        else if (lower.includes("customer") || lower.includes("العميل")) newMap.customer_name = idx;
        else if (lower.includes("phone") || lower.includes("جوال") || lower.includes("هاتف"))
          newMap.customer_phone = idx;
        else if (lower.includes("total") || lower.includes("إجمالي")) newMap.total_price = idx;
        else if (lower.includes("item") || lower.includes("منتج")) newMap.item_name = idx;
      });

      setMappings(newMap);
      setStep("map");
    };
    reader.readAsText(file);
  };

  const executeImport = async () => {
    setIsProcessing(true);
    setProgressMsg(isAr ? "جاري تجميع الطلبات السابقة..." : "Bundling legacy orders...");

    try {
      const ordersMap = new Map<string, any>();

      parsedRows.forEach((row, i) => {
        const orderNum =
          mappings.order_number !== -1 ? row[mappings.order_number] : `LEGACY-${i + 1}`;
        const orderDate =
          mappings.order_date !== -1 && row[mappings.order_date]
            ? new Date(row[mappings.order_date]).toISOString()
            : new Date().toISOString();
        const custName = mappings.customer_name !== -1 ? row[mappings.customer_name] : null;
        const custPhone =
          mappings.customer_phone !== -1 ? sanitizeGCCPhone(row[mappings.customer_phone]) : null;
        const total =
          mappings.total_price !== -1
            ? parseFloat(row[mappings.total_price]?.replace(/[^\d.]/g, "") || "0") || 0
            : 0;
        const itemName = mappings.item_name !== -1 ? row[mappings.item_name] : "منتج سابق";

        if (!ordersMap.has(orderNum)) {
          ordersMap.set(orderNum, {
            externalOrderNumber: orderNum,
            createdAt: orderDate,
            customerName: custName,
            customerPhone: custPhone,
            total,
            status: "delivered",
            paymentStatus: "paid",
            source: "csv_import",
            items: [{ name: itemName, quantity: 1, price: total }],
          });
        }
      });

      const parsedOrders = Array.from(ordersMap.values());
      const batchSize = 25;
      let totalSuccess = 0;

      for (let i = 0; i < parsedOrders.length; i += batchSize) {
        const chunk = parsedOrders.slice(i, i + batchSize);
        setProgressMsg(
          isAr
            ? `جاري استيراد ${i} من أصل ${arNounOblique(parsedOrders.length, "order")}...`
            : `Importing ${i} / ${parsedOrders.length} orders...`,
        );

        const result = await importHistoricalOrders({
          data: {
            brandId,
            orders: chunk,
          },
        });
        totalSuccess += result.successCount;
      }

      setLastCount(totalSuccess);
      setStep("success");
      toast.success(
        isAr
          ? `تم استيراد ${arNounOblique(totalSuccess, "order")} بنجاح!`
          : `Successfully imported ${totalSuccess} orders!`,
      );
      onComplete();
    } catch (err: any) {
      console.error(err);
      toast.error(isAr ? "فشل استيراد الطلبات" : "Order importer failed");
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
              <ReceiptText className="h-5 w-5 text-primary" />
              {isAr ? "استيراد وترحيل الطلبات السابقة" : "Historical Orders Migration"}
            </CardTitle>
            <CardDescription>
              {isAr
                ? "ارفع ملف الطلبات والمبيعات التاريخية لتهيئة تقارير المبيعات وحسابات العملاء"
                : "Import legacy sales and order records to establish full historical reporting"}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadTemplate("orders")}
            className="h-8 gap-1.5 text-xs self-start sm:self-center"
          >
            <Download className="h-3.5 w-3.5" />
            {isAr ? "تحميل نموذج CSV تجريبي" : "Download Sample CSV"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {step === "upload" && (
          <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-all bg-muted/20">
            <ReceiptText className="h-10 w-10 mx-auto text-primary mb-3" />
            <h3 className="text-sm font-bold text-foreground mb-1">
              {isAr ? "ارفع ملف CSV للطلبات السابقة" : "Upload Orders CSV File"}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
              {isAr
                ? "سيتم تجميع بنود الطلب الواحد تلقائياً وربط المبيعات بالعملاء"
                : "Line items with matching order numbers will be grouped automatically"}
            </p>
            <label className="inline-block">
              <span className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-4 py-2 text-xs font-bold hover:bg-primary/90 cursor-pointer shadow-sm">
                <Upload className="h-4 w-4 me-1.5" />
                {isAr ? "اختيار ملف الطلبات" : "Choose Orders File"}
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h4 className="text-sm font-bold text-foreground">
                {isAr ? "مطابقة حقول الطلب" : "Order Field Mapping"}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto p-1">
              {[
                { field: "order_number", label: isAr ? "رقم الطلب" : "Order Number" },
                { field: "order_date", label: isAr ? "تاريخ الطلب" : "Order Date" },
                { field: "customer_name", label: isAr ? "اسم العميل" : "Customer Name" },
                { field: "customer_phone", label: isAr ? "جوال العميل" : "Customer Phone" },
                { field: "total_price", label: isAr ? "إجمالي المبلغ" : "Total Amount" },
                { field: "item_name", label: isAr ? "اسم المنتج / البند" : "Line Item Name" },
              ].map(({ field, label }) => (
                <div
                  key={field}
                  className="p-2.5 rounded-lg border border-border bg-muted/30 flex items-center justify-between gap-2"
                >
                  <span className="text-xs font-semibold text-foreground">{label}</span>
                  <select
                    value={mappings[field] ?? -1}
                    onChange={(e) =>
                      setMappings((prev) => ({ ...prev, [field]: Number(e.target.value) }))
                    }
                    className="h-8 rounded-md border border-border bg-background px-2 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 max-w-[150px]"
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

            {isProcessing && (
              <div className="space-y-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-xs font-semibold text-primary">{progressMsg}</p>
                <Progress value={50} className="h-1.5" />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3">
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
                {isAr ? "بدء استيراد الطلبات" : "Import Orders"}
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
                {isAr ? "اكتمل استيراد الطلبات بنجاح!" : "Orders Migration Completed!"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                {isAr
                  ? `تم توثيق ${arNounOblique(lastCount, "order")} في سجل مبيعات متجرك التاريخي.`
                  : `Successfully added ${lastCount} legacy orders to sales records.`}
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
