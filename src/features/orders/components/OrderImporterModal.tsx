import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sanitizeGCCPhone } from "@/lib/os-formatting";
import { parseCSV } from "@/lib/csv-parser";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sparkles, Upload, Loader2 } from "lucide-react";

export const ORDER_HEADER_MAPS = {
  order_number: ["name", "order number", "order_number", "رقم الطلب", "id"],
  order_date: ["created at", "created_at", "order date", "order_date", "تاريخ الطلب", "date"],
  customer_name: [
    "billing name",
    "shipping name",
    "customer name",
    "اسم العميل",
    "الاسم الكامل",
    "name",
  ],
  customer_phone: ["billing phone", "shipping phone", "phone", "جوال العميل", "رقم الهاتف", "جوال"],
  customer_email: ["email", "billing email", "البريد الالكتروني", "البريد الإلكتروني"],
  total_price: ["total", "order total", "الإجمالي", "إجمالي الطلب", "total_price"],
  item_name: ["lineitem name", "item name", "اسم المنتج", "عنوان المنتج", "product_name"],
  item_quantity: ["lineitem quantity", "quantity", "الكمية", "item quantity"],
  item_price: ["lineitem price", "item price", "سعر المنتج", "السعر"],
};

export function OrderImporterModal({
  brandId,
  onComplete,
  isOpen: controlledIsOpen,
  onOpenChange: setControlledIsOpen,
}: {
  brandId: string;
  onComplete: () => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = setControlledIsOpen || setInternalIsOpen;
  const [step, setStep] = useState<"preset" | "mapper" | "importing" | "success">("preset");
  const [preset, setPreset] = useState<"shopify" | "woocommerce" | "salla" | "zid" | "custom">(
    "shopify",
  );
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, number>>({
    order_number: -1,
    order_date: -1,
    customer_name: -1,
    customer_phone: -1,
    customer_email: -1,
    total_price: -1,
    item_name: -1,
    item_quantity: -1,
    item_price: -1,
  });
  const [progress, setProgress] = useState("");
  const [successCount, setSuccessCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const { lang } = useI18n();
  const isAr = lang === "ar";

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
            ? "ملف الـ CSV فارغ أو يحتوي على صف الرأس فقط."
            : "CSV file is empty or only contains the header row.",
        );
        return;
      }

      const fileHeaders = rows[0].map((h) => h.trim());
      setParsedRows(rows.slice(1));
      setHeaders(fileHeaders);

      // Smart Header Mapping Detector
      const newMappings = {
        order_number: -1,
        order_date: -1,
        customer_name: -1,
        customer_phone: -1,
        customer_email: -1,
        total_price: -1,
        item_name: -1,
        item_quantity: -1,
        item_price: -1,
      };

      Object.entries(ORDER_HEADER_MAPS).forEach(([field, aliases]) => {
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

      const mandatoryMapped = newMappings.order_number !== -1 && newMappings.item_name !== -1;
      if (mandatoryMapped && preset !== "custom") {
        startImport(rows.slice(1), newMappings, fileHeaders);
      } else {
        setStep("mapper");
      }
    };
    reader.readAsText(file);
  };

  const startImport = async (
    dataRows: string[][],
    finalMappings: Record<string, number>,
    headersList: string[] = headers,
  ) => {
    setStep("importing");
    setProgress(
      isAr ? "بدء عملية استيراد الطلبات الفاخرة..." : "Starting premium order import pipeline...",
    );

    const findHeaderIdx = (names: string[]) => {
      return headersList.findIndex((h) =>
        names.some((name) => h.trim().toLowerCase() === name.toLowerCase()),
      );
    };

    const ordersMap = new Map<string, any>();

    dataRows.forEach((row) => {
      let orderNum = "";
      let orderDate = new Date().toISOString();
      let customerName = null;
      let customerPhone = null;
      let customerEmail = null;
      let totalPrice = 0.0;
      let itemName = "";
      let itemQty = 1;
      let itemPrice = 0.0;
      let notesVal = null;

      if (preset === "shopify") {
        const orderNumIdx = findHeaderIdx(["name"]);
        const dateIdx = findHeaderIdx(["created at", "created_at"]);
        const phoneIdx = findHeaderIdx(["billing phone", "shipping phone", "phone"]);
        const emailIdx = findHeaderIdx(["email"]);
        const billingNameIdx = findHeaderIdx(["billing name", "shipping name", "customer name"]);
        const itemQtyIdx = findHeaderIdx(["lineitem quantity", "quantity"]);
        const itemNameIdx = findHeaderIdx(["lineitem name", "item name"]);
        const itemPriceIdx = findHeaderIdx(["lineitem price", "item price"]);
        const totalIdx = findHeaderIdx(["total"]);
        const notesIdx = findHeaderIdx(["note", "notes"]);

        orderNum = orderNumIdx !== -1 ? row[orderNumIdx] : "";
        orderDate =
          dateIdx !== -1 && row[dateIdx]
            ? new Date(row[dateIdx]).toISOString()
            : new Date().toISOString();
        customerPhone = phoneIdx !== -1 ? sanitizeGCCPhone(row[phoneIdx]) : null;
        customerEmail = emailIdx !== -1 ? row[emailIdx] || null : null;
        customerName = billingNameIdx !== -1 ? row[billingNameIdx] || null : null;
        itemQty =
          itemQtyIdx !== -1 ? parseInt(row[itemQtyIdx]?.replace(/[^\d]/g, "") || "1") || 1 : 1;
        itemName = itemNameIdx !== -1 ? row[itemNameIdx] : "Line Item";
        itemPrice =
          itemPriceIdx !== -1
            ? parseFloat(row[itemPriceIdx]?.replace(/[^\d.]/g, "") || "0") || 0.0
            : 0.0;
        totalPrice =
          totalIdx !== -1 ? parseFloat(row[totalIdx]?.replace(/[^\d.]/g, "") || "0") || 0.0 : 0.0;
        notesVal = notesIdx !== -1 ? row[notesIdx] || null : null;
      } else if (preset === "woocommerce") {
        const orderNumIdx = findHeaderIdx(["order number", "order_number", "id", "post_id"]);
        const dateIdx = findHeaderIdx(["order date", "order_date", "post_date"]);
        const phoneIdx = findHeaderIdx(["billing phone", "_billing_phone", "phone"]);
        const emailIdx = findHeaderIdx(["billing email", "_billing_email", "email"]);
        const firstNameIdx = findHeaderIdx(["billing first name", "_billing_first_name"]);
        const lastNameIdx = findHeaderIdx(["billing last name", "_billing_last_name"]);
        const itemQtyIdx = findHeaderIdx(["item quantity", "quantity"]);
        const itemNameIdx = findHeaderIdx(["item name", "name"]);
        const itemPriceIdx = findHeaderIdx(["item price", "price"]);
        const totalIdx = findHeaderIdx(["order total", "_order_total", "total"]);

        orderNum = orderNumIdx !== -1 ? row[orderNumIdx] : "";
        orderDate =
          dateIdx !== -1 && row[dateIdx]
            ? new Date(row[dateIdx]).toISOString()
            : new Date().toISOString();
        customerPhone = phoneIdx !== -1 ? sanitizeGCCPhone(row[phoneIdx]) : null;
        customerEmail = emailIdx !== -1 ? row[emailIdx] || null : null;

        const first = firstNameIdx !== -1 ? row[firstNameIdx] : "";
        const last = lastNameIdx !== -1 ? row[lastNameIdx] : "";
        customerName = `${first} ${last}`.trim() || null;

        itemQty =
          itemQtyIdx !== -1 ? parseInt(row[itemQtyIdx]?.replace(/[^\d]/g, "") || "1") || 1 : 1;
        itemName = itemNameIdx !== -1 ? row[itemNameIdx] : "Line Item";
        itemPrice =
          itemPriceIdx !== -1
            ? parseFloat(row[itemPriceIdx]?.replace(/[^\d.]/g, "") || "0") || 0.0
            : 0.0;
        totalPrice =
          totalIdx !== -1 ? parseFloat(row[totalIdx]?.replace(/[^\d.]/g, "") || "0") || 0.0 : 0.0;
      } else if (preset === "salla" || preset === "zid") {
        const orderNumIdx = findHeaderIdx(["رقم الطلب", "رقم طلب سلة", "id", "order_id"]);
        const dateIdx = findHeaderIdx(["تاريخ الطلب", "تاريخ طلب سلة", "date", "created_at"]);
        const phoneIdx = findHeaderIdx(["جوال العميل", "رقم الجوال", "رقم الهاتف", "phone"]);
        const emailIdx = findHeaderIdx(["البريد الالكتروني", "البريد الإلكتروني", "email"]);
        const nameIdx = findHeaderIdx(["اسم العميل", "الاسم الكامل", "name"]);
        const itemQtyIdx = findHeaderIdx(["الكمية", "كمية المنتج", "quantity"]);
        const itemNameIdx = findHeaderIdx(["اسم المنتج", "عنوان المنتج", "product_name"]);
        const itemPriceIdx = findHeaderIdx(["سعر المنتج", "السعر", "price"]);
        const totalIdx = findHeaderIdx(["إجمالي الطلب", "الإجمالي", "total"]);

        orderNum = orderNumIdx !== -1 ? row[orderNumIdx] : "";
        orderDate =
          dateIdx !== -1 && row[dateIdx]
            ? new Date(row[dateIdx]).toISOString()
            : new Date().toISOString();
        customerPhone = phoneIdx !== -1 ? sanitizeGCCPhone(row[phoneIdx]) : null;
        customerEmail = emailIdx !== -1 ? row[emailIdx] || null : null;
        customerName = nameIdx !== -1 ? row[nameIdx] || null : null;
        itemQty =
          itemQtyIdx !== -1 ? parseInt(row[itemQtyIdx]?.replace(/[^\d]/g, "") || "1") || 1 : 1;
        itemName = itemNameIdx !== -1 ? row[itemNameIdx] : "Line Item";
        itemPrice =
          itemPriceIdx !== -1
            ? parseFloat(row[itemPriceIdx]?.replace(/[^\d.]/g, "") || "0") || 0.0
            : 0.0;
        totalPrice =
          totalIdx !== -1 ? parseFloat(row[totalIdx]?.replace(/[^\d.]/g, "") || "0") || 0.0 : 0.0;
      } else {
        orderNum = finalMappings.order_number !== -1 ? row[finalMappings.order_number] : "";
        orderDate =
          finalMappings.order_date !== -1 && row[finalMappings.order_date]
            ? new Date(row[finalMappings.order_date]).toISOString()
            : new Date().toISOString();
        customerPhone =
          finalMappings.customer_phone !== -1
            ? sanitizeGCCPhone(row[finalMappings.customer_phone])
            : null;
        customerEmail =
          finalMappings.customer_email !== -1 ? row[finalMappings.customer_email] || null : null;
        customerName =
          finalMappings.customer_name !== -1 ? row[finalMappings.customer_name] || null : null;
        itemQty =
          finalMappings.item_quantity !== -1
            ? parseInt(row[finalMappings.item_quantity]?.replace(/[^\d]/g, "") || "1") || 1
            : 1;
        itemName = finalMappings.item_name !== -1 ? row[finalMappings.item_name] : "Line Item";
        itemPrice =
          finalMappings.item_price !== -1
            ? parseFloat(row[finalMappings.item_price]?.replace(/[^\d.]/g, "") || "0") || 0.0
            : 0.0;
        totalPrice =
          finalMappings.total_price !== -1
            ? parseFloat(row[finalMappings.total_price]?.replace(/[^\d.]/g, "") || "0") || 0.0
            : 0.0;
      }

      if (!orderNum) return;

      if (ordersMap.has(orderNum)) {
        const existing = ordersMap.get(orderNum);
        existing.items.push({
          name: itemName,
          quantity: itemQty,
          price: itemPrice,
        });
      } else {
        ordersMap.set(orderNum, {
          orderNumber: orderNum,
          orderDate,
          customerName,
          customerPhone,
          customerEmail,
          totalPrice,
          paymentStatus: "paid",
          source: preset,
          notes: notesVal,
          items: [
            {
              name: itemName,
              quantity: itemQty,
              price: itemPrice,
            },
          ],
        });
      }
    });

    const parsedOrders = Array.from(ordersMap.values());
    setTotalCount(parsedOrders.length);

    if (parsedOrders.length === 0) {
      toast.error(
        isAr
          ? "لم نتمكن من تحديد أي طلبات صالحة في هذا الملف."
          : "No valid orders could be parsed from this file.",
      );
      setStep("preset");
      return;
    }

    try {
      const { importHistoricalOrders } = await import("@/lib/order-importer");

      const batchSize = 25;
      let totalSuccess = 0;

      for (let i = 0; i < parsedOrders.length; i += batchSize) {
        const chunk = parsedOrders.slice(i, i + batchSize);
        setProgress(
          isAr
            ? `جاري استيراد ${i} من أصل ${parsedOrders.length} طلب تاريخي...`
            : `Importing ${i} / ${parsedOrders.length} legacy orders...`,
        );

        const result = await importHistoricalOrders({
          data: {
            brandId,
            orders: chunk,
          },
        });

        totalSuccess += result.successCount;
        setSuccessCount(totalSuccess);
      }

      setStep("success");
      onComplete();
    } catch (err: any) {
      console.error(err);
      toast.error(isAr ? "فشل استيراد الطلبات" : "Order importer pipeline failed");
      setStep("preset");
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setStep("preset");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {controlledIsOpen === undefined && (
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className="hidden h-11 items-center gap-2 whitespace-nowrap rounded-xl border-primary/20 px-4 text-xs font-semibold shadow-sm transition-all hover:border-primary/50 sm:inline-flex"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
            {isAr ? "استيراد طلبات سابقة" : "Import Past Orders"}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-xl p-6 bg-card rounded-2xl border border-border shadow-2xl">
        <DialogHeader className="pb-4 border-b border-border">
          <DialogTitle className="text-lg font-bold font-display flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {isAr ? "معالج ترحيل واستيراد الطلبات السابقة" : "Historical Orders Migration Engine"}
          </DialogTitle>
        </DialogHeader>

        {step === "preset" && (
          <div className="space-y-5 pt-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {isAr
                ? "ارفع ملفات الطلبات السابقة للتصدير من Shopify، WooCommerce، Salla، أو Zid مباشرة لتهيئة سجلات مبيعاتك بالكامل مع مطابقة العملاء."
                : "Upload legacy order CSV exports from Shopify, WooCommerce, Salla, or Zid to populate sales history with zero downtime."}
            </p>

            <div className="grid grid-cols-2 gap-3">
              {[
                { id: "shopify", label: "🛒 Shopify Orders", desc: "orders_export.csv" },
                { id: "woocommerce", label: "📦 WooCommerce CSV", desc: "wc_orders.csv" },
                { id: "salla", label: "🟢 Salla (سلة)", desc: "salla_orders.csv" },
                { id: "zid", label: "🟣 Zid (زد)", desc: "zid_orders.csv" },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPreset(p.id as any)}
                  className={`p-4 rounded-xl border text-start transition-all ${
                    preset === p.id
                      ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                      : "border-border hover:border-border hover:bg-muted/30"
                  }`}
                >
                  <p className="text-xs font-semibold">{p.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{p.desc}</p>
                </button>
              ))}
            </div>

            <div className="pt-4 border-t border-border flex justify-between items-center">
              <Button
                variant="ghost"
                onClick={() => setPreset("custom")}
                className="text-xs text-muted-foreground font-semibold"
              >
                {isAr ? "استخدام مطابقة مخصصة..." : "Use custom column mapper..."}
              </Button>

              <label className="bg-primary text-primary-foreground text-xs font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-primary/15 hover:shadow-xl transition-all cursor-pointer flex items-center gap-2">
                <Upload className="h-4 w-4" />
                {isAr ? "اختر ملف الـ CSV" : "Select CSV File"}
                <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          </div>
        )}

        {step === "mapper" && (
          <div className="space-y-4 pt-4">
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "طابق أعمدة ملف الـ CSV المخصص الخاص بك مع الحقول المطلوبة لترحيل مبيعاتك بنجاح."
                : "Map your custom CSV file columns to match required fields in our historical sales engine."}
            </p>

            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pe-1">
              {[
                { key: "order_number", label: isAr ? "رقم الطلب" : "Order Number", required: true },
                { key: "order_date", label: isAr ? "تاريخ الطلب" : "Order Date", required: true },
                {
                  key: "customer_name",
                  label: isAr ? "اسم العميل" : "Customer Name",
                  required: false,
                },
                {
                  key: "customer_phone",
                  label: isAr ? "رقم جوال العميل" : "Customer Phone",
                  required: false,
                },
                {
                  key: "customer_email",
                  label: isAr ? "البريد الإلكتروني" : "Customer Email",
                  required: false,
                },
                {
                  key: "total_price",
                  label: isAr ? "إجمالي الطلب" : "Total Price",
                  required: true,
                },
                { key: "item_name", label: isAr ? "اسم المنتج" : "Item Name", required: true },
                {
                  key: "item_quantity",
                  label: isAr ? "كمية المنتج" : "Item Quantity",
                  required: true,
                },
                { key: "item_price", label: isAr ? "سعر المنتج" : "Item Price", required: true },
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
                    <SelectTrigger className="w-[180px] h-8 text-xs">
                      <SelectValue placeholder={isAr ? "اختر العمود..." : "Select..."} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="-1">-- {isAr ? "تجاوز" : "Skip"} --</SelectItem>
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

            <div className="pt-4 border-t border-border flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setStep("preset")}
                className="text-xs font-semibold"
              >
                {isAr ? "رجوع" : "Back"}
              </Button>
              <Button
                onClick={() => {
                  if (mappings.order_number === -1 || mappings.item_name === -1) {
                    toast.error(
                      isAr
                        ? "رقم الطلب واسم المنتج حقول إلزامية للتجهيز."
                        : "Order Number and Item Name are mandatory fields.",
                    );
                    return;
                  }
                  startImport(parsedRows, mappings);
                }}
                className="bg-primary text-xs text-primary-foreground font-semibold px-5 py-2"
              >
                {isAr ? "بدء الاستيراد" : "Start Import"}
              </Button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <div className="space-y-1">
              <p className="font-semibold text-sm">
                {isAr ? "جاري استيراد تاريخ مبيعاتك..." : "Processing order database migration..."}
              </p>
              <p className="text-xs text-muted-foreground">{progress}</p>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-5 pt-6">
            <div className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 flex items-center justify-center border border-emerald-100 dark:border-emerald-900">
              <Check className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="font-bold text-lg">
                {isAr ? "اكتمل الترحيل بنجاح وافر!" : "Historical Migration Completed!"}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                {isAr
                  ? `تم بنجاح ترحيل واستيراد ${successCount} من أصل ${totalCount} طلبات سابقة مع مطابقتها بالعملاء بنجاح.`
                  : `Successfully imported ${successCount} out of ${totalCount} historical sales, matching billing phone entries directly.`}
              </p>
            </div>
            <Button
              onClick={handleClose}
              className="bg-primary text-xs font-semibold px-6 py-2.5 rounded-xl shadow-lg shadow-primary/10"
            >
              {isAr ? "استمرار إلى اللوحة" : "Proceed to Dashboard"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
