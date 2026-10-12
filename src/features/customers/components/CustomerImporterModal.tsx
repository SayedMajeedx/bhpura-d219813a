import { useState } from "react";
import { importCustomerDatabase } from "@/lib/customer-importer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Users, Check, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { parseCSV } from "@/lib/csv-parser";
import { sanitizeGCCPhone } from "@/lib/os-formatting";

import { parseVCard } from "@/features/customers/lib/vcard";
import { CUSTOMER_HEADER_MAPS } from "@/features/customers/lib/customer-header-maps";

export function CustomerImporterModal({
  brandId,
  onComplete,
  isOpen: controlledIsOpen,
  onOpenChange: setControlledIsOpen,
  renderTrigger,
}: {
  brandId: string;
  onComplete: () => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  renderTrigger?: (onClick: () => void) => React.ReactNode;
}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = setControlledIsOpen || setInternalIsOpen;
  const [step, setStep] = useState<"preset" | "mapper" | "importing" | "success">("preset");

  const handleOpen = () => {
    setIsOpen(true);
    setStep("preset");
  };
  const [preset, setPreset] = useState<
    "shopify" | "salla" | "zid" | "woocommerce" | "whatsapp" | "custom"
  >("custom");
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, number>>({
    name: -1,
    phone: -1,
    email: -1,
    orders: -1,
    spend: -1,
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

      // Handle vCard / VCF Phone contacts directly!
      if (file.name.endsWith(".vcf") || text.includes("BEGIN:VCARD")) {
        setPreset("whatsapp");
        const contacts = parseVCard(text);
        if (contacts.length === 0) {
          toast.error(
            isAr
              ? "لم نتمكن من العثور على أي جهات اتصال صالحة في ملف vCard."
              : "No valid contacts found in this vCard file.",
          );
          return;
        }
        startImportDirect(
          contacts.map((c) => ({
            name: c.name,
            phone: sanitizeGCCPhone(c.phone),
            email: c.email,
            notes: "Imported from WhatsApp Contacts vCard",
            totalOrders: 0,
            totalSpend: 0,
            tags: ["imported_from_whatsapp"],
          })),
        );
        return;
      }

      const rows = parseCSV(text);
      if (rows.length < 2) {
        toast.error(isAr ? "ملف الـ CSV فارغ أو غير صالح." : "CSV file is empty or invalid.");
        return;
      }

      const fileHeaders = rows[0].map((h) => h.trim());
      setParsedRows(rows.slice(1));
      setHeaders(fileHeaders);

      // Smart Header Matcher
      const newMappings = { name: -1, phone: -1, email: -1, orders: -1, spend: -1 };
      Object.entries(CUSTOMER_HEADER_MAPS).forEach(([field, aliases]) => {
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

      const mandatoryMapped = newMappings.name !== -1 && newMappings.phone !== -1;
      if (mandatoryMapped && preset !== "custom") {
        startImportCSV(rows.slice(1), newMappings, fileHeaders);
      } else {
        setStep("mapper");
      }
    };
    reader.readAsText(file);
  };

  const startImportDirect = async (customersList: any[]) => {
    setStep("importing");
    setTotalCount(customersList.length);
    setProgress(isAr ? "بدء عملية الاستيراد الشاملة..." : "Starting contact ingestion process...");

    try {
      const batchSize = 25;
      let totalSuccess = 0;

      for (let i = 0; i < customersList.length; i += batchSize) {
        const chunk = customersList.slice(i, i + batchSize);
        setProgress(
          isAr
            ? `جاري استيراد وتطهير جهات الاتصال: ${i} من أصل ${customersList.length} عميل...`
            : `Ingested & sanitized ${i} / ${customersList.length} customer contacts...`,
        );

        const result = await importCustomerDatabase({
          data: {
            brandId,
            customers: chunk,
          },
        });
        totalSuccess += result.successCount;
        setSuccessCount(totalSuccess);
      }

      setStep("success");
      onComplete();
    } catch (err) {
      console.error(err);
      toast.error(
        isAr ? "فشل استيراد قاعدة البيانات" : "Customer database migration pipeline failed",
      );
      setStep("preset");
    }
  };

  const startImportCSV = (
    dataRows: string[][],
    finalMappings: Record<string, number>,
    headersList: string[] = headers,
  ) => {
    const findHeaderIdx = (names: string[]) => {
      return headersList.findIndex((h) =>
        names.some((name) => h.trim().toLowerCase() === name.toLowerCase()),
      );
    };

    const parsedCustomers = dataRows.map((row) => {
      let nameVal = "";
      let phoneVal: string | null = null;
      let emailVal: string | null = null;
      let ordersVal = 0;
      let spendVal = 0;

      if (preset === "shopify") {
        const firstNameIdx = findHeaderIdx(["first name"]);
        const lastNameIdx = findHeaderIdx(["last name"]);
        const emailIdx = findHeaderIdx(["email"]);
        const defaultPhoneIdx = findHeaderIdx(["default address phone"]);
        const phoneIdx = findHeaderIdx(["phone"]);
        const totalSpentIdx = findHeaderIdx(["total spent", "total spend"]);
        const totalOrdersIdx = findHeaderIdx(["total orders"]);

        const first = firstNameIdx !== -1 ? row[firstNameIdx] : "";
        const last = lastNameIdx !== -1 ? row[lastNameIdx] : "";
        nameVal = `${first} ${last}`.trim();

        if (!nameVal) {
          const custIdx = findHeaderIdx(["customer", "customer name", "name"]);
          if (custIdx !== -1) {
            nameVal = row[custIdx]?.replace(/^\d+\s+/, "").trim() || "";
          }
        }

        const rawPhone =
          (defaultPhoneIdx !== -1 ? row[defaultPhoneIdx] : null) ||
          (phoneIdx !== -1 ? row[phoneIdx] : null);
        phoneVal = sanitizeGCCPhone(rawPhone);

        emailVal = emailIdx !== -1 ? row[emailIdx] : null;
        ordersVal =
          totalOrdersIdx !== -1
            ? parseInt(row[totalOrdersIdx]?.replace(/[^\d]/g, "") || "0") || 0
            : 0;
        spendVal =
          totalSpentIdx !== -1
            ? parseFloat(row[totalSpentIdx]?.replace(/[^\d.]/g, "") || "0") || 0
            : 0;
      } else if (preset === "woocommerce") {
        const firstNameIdx = findHeaderIdx([
          "first name",
          "billing_first_name",
          "shipping_first_name",
        ]);
        const lastNameIdx = findHeaderIdx(["last name", "billing_last_name", "shipping_last_name"]);
        const emailIdx = findHeaderIdx(["email", "billing_email", "user_email"]);
        const phoneIdx = findHeaderIdx(["phone", "billing_phone"]);
        const totalSpentIdx = findHeaderIdx(["total spend", "total_spent", "spent"]);
        const totalOrdersIdx = findHeaderIdx(["total orders", "orders_count", "orders"]);

        const first = firstNameIdx !== -1 ? row[firstNameIdx] : "";
        const last = lastNameIdx !== -1 ? row[lastNameIdx] : "";
        nameVal = `${first} ${last}`.trim();

        phoneVal = sanitizeGCCPhone(phoneIdx !== -1 ? row[phoneIdx] : null);
        emailVal = emailIdx !== -1 ? row[emailIdx] : null;
        ordersVal =
          totalOrdersIdx !== -1
            ? parseInt(row[totalOrdersIdx]?.replace(/[^\d]/g, "") || "0") || 0
            : 0;
        spendVal =
          totalSpentIdx !== -1
            ? parseFloat(row[totalSpentIdx]?.replace(/[^\d.]/g, "") || "0") || 0
            : 0;
      } else if (preset === "salla" || preset === "zid") {
        const nameIdx = findHeaderIdx([
          "اسم العميل",
          "الاسم الكامل",
          "الاسم",
          "client name",
          "customer name",
          "name",
        ]);
        const phoneIdx = findHeaderIdx([
          "رقم الجوال",
          "رقم الهاتف",
          "الجوال",
          "الهاتف",
          "mobile",
          "phone",
        ]);
        const emailIdx = findHeaderIdx(["البريد الإلكتروني", "البريد", "email", "email address"]);
        const ordersIdx = findHeaderIdx([
          "عدد الطلبات",
          "عدد الطلبات الناجحة",
          "الطلبات",
          "orders",
          "total orders",
        ]);
        const spendIdx = findHeaderIdx([
          "إجمالي المشتريات",
          "إجمالي المبيعات",
          "المشتريات",
          "spend",
          "total spend",
          "total spent",
        ]);

        nameVal = nameIdx !== -1 ? row[nameIdx] : "";
        phoneVal = sanitizeGCCPhone(phoneIdx !== -1 ? row[phoneIdx] : null);
        emailVal = emailIdx !== -1 ? row[emailIdx] : null;
        ordersVal =
          ordersIdx !== -1 ? parseInt(row[ordersIdx]?.replace(/[^\d]/g, "") || "0") || 0 : 0;
        spendVal =
          spendIdx !== -1 ? parseFloat(row[spendIdx]?.replace(/[^\d.]/g, "") || "0") || 0 : 0;
      } else {
        nameVal = row[finalMappings.name] || "";
        phoneVal = sanitizeGCCPhone(row[finalMappings.phone] || null);
        emailVal = finalMappings.email !== -1 ? row[finalMappings.email] : null;
        ordersVal =
          finalMappings.orders !== -1
            ? parseInt(row[finalMappings.orders]?.replace(/[^\d]/g, "") || "0") || 0
            : 0;
        spendVal =
          finalMappings.spend !== -1
            ? parseFloat(row[finalMappings.spend]?.replace(/[^\d.]/g, "") || "0") || 0
            : 0;
      }

      if (!nameVal) {
        nameVal = isAr ? "عميل مستورد" : "Imported Customer";
      }

      const tags = [`migrated_${preset}`];

      return {
        name: nameVal,
        phone: phoneVal,
        email: emailVal,
        notes: isAr ? `مستورد من ${preset}` : `Imported from ${preset}`,
        totalOrders: ordersVal,
        totalSpend: spendVal,
        tags,
      };
    });

    startImportDirect(parsedCustomers);
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
          <Plus className="h-4 w-4 me-2" />
          {isAr ? "استيراد العملاء وجهات الاتصال" : "Import Customers"}
        </Button>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-xl border-border bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-xl">
              <Users className="h-5 w-5 text-primary" />
              {isAr ? "مساعد هجرة العملاء الفاخر" : "Universal Customer Migration Suite"}
            </DialogTitle>
          </DialogHeader>

          {step === "preset" && (
            <div className="space-y-4 pt-2 select-none">
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "اختر المنصة التي تريد الهجرة منها. سنقوم تلقائياً بتطهير وتنسيق أرقام الهواتف وتفادي التكرار ووسم العملاء المميزين VIP."
                  : "Select your export source. We will automatically sanitize GCC phone numbers, prevent duplicates, and apply automatic VIP tagging."}
              </p>

              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    id: "shopify",
                    name: "Shopify Customers",
                    desc: "customers_export.csv",
                    color: "hover:border-primary/30",
                  },
                  {
                    id: "salla",
                    name: "Salla (سلة)",
                    desc: "عملاء سلة إكسل",
                    color: "hover:border-primary/30",
                  },
                  {
                    id: "zid",
                    name: "Zid (زد)",
                    desc: "عملاء زد إكسل",
                    color: "hover:border-primary/30",
                  },
                  {
                    id: "woocommerce",
                    name: "WooCommerce",
                    desc: "WooCommerce CSV",
                    color: "hover:border-primary/30",
                  },
                  {
                    id: "whatsapp",
                    name: "WhatsApp / Contacts",
                    desc: ".vcf vCard format",
                    color: "hover:border-primary/30",
                  },
                  {
                    id: "custom",
                    name: isAr ? "CSV مخصص" : "Custom CSV / Sheets",
                    desc: "Any custom sheet",
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
                    {isAr ? "رفع الملف وبدء الهجرة" : "Upload File & Import"}
                  </span>
                  <input
                    type="file"
                    accept=".csv,.vcf"
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          )}

          {step === "mapper" && (
            <div className="space-y-4 pt-2">
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "يرجى تعيين ومطابقة أعمدة ملف الـ CSV الخاص بك مع الحقول المطلوبة لقاعدة بيانات العملاء:"
                  : "Please map your CSV columns to the appropriate fields in our customer database:"}
              </p>

              <div className="space-y-4">
                {[
                  {
                    key: "name",
                    label: isAr ? "الاسم الكامل للعميل" : "Customer Full Name",
                    required: true,
                  },
                  {
                    key: "phone",
                    label: isAr ? "رقم الجوال / الواتساب" : "Phone/WhatsApp Number",
                    required: true,
                  },
                  {
                    key: "email",
                    label: isAr ? "البريد الإلكتروني" : "Email Address",
                    required: false,
                  },
                  {
                    key: "orders",
                    label: isAr ? "إجمالي الطلبات" : "Total Orders",
                    required: false,
                  },
                  {
                    key: "spend",
                    label: isAr ? "إجمالي المشتريات (د.ب)" : "Total Spend (BHD)",
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
                          -- {isAr ? "تخطي العمود" : "Skip Field"} --
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

              <div className="pt-4 border-t border-border flex justify-end">
                <Button
                  onClick={() => {
                    if (mappings.name === -1 || mappings.phone === -1) {
                      toast.error(
                        isAr
                          ? "يجب مطابقة الاسم الكامل ورقم الجوال."
                          : "Full Name and Phone Number are mandatory.",
                      );
                      return;
                    }
                    startImportCSV(parsedRows, mappings);
                  }}
                  className="bg-primary text-xs text-primary-foreground font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-primary/10 hover:shadow-xl transition-all"
                >
                  {isAr ? "تأكيد واستيراد الآن" : "Confirm & Import Database"}
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
                    ? "جاري ترحيل وتطهير قاعدة بيانات العملاء..."
                    : "Migrating & Sanitizing Customer Profiles..."}
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
                  {isAr
                    ? "تم استيراد قاعدة بيانات العملاء بنجاح!"
                    : "Customer Database Migrated Successfully!"}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                  {isAr
                    ? `تم استيراد وتطهير ${successCount} جهة اتصال بنجاح، وتوسيم العملاء المميزين VIP وتفادي جهات الاتصال المكررة بالكامل!`
                    : `Successfully imported & sanitized ${successCount} customer profiles! Deduplicated existing phone numbers, and auto-applied VIP customer tags!`}
                </p>
              </div>
              <Button
                onClick={() => setIsOpen(false)}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-500/10 hover:shadow-xl transition-all"
              >
                {isAr ? "عرض قائمة العملاء" : "View Customer Database"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
