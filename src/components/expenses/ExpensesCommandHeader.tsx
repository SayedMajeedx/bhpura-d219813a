import { Plus, Sparkles, Wallet } from "lucide-react";
import {
  AdminPageAction,
  AdminPageCount,
  AdminPageHeader,
} from "@/components/admin/AdminPageHeader";
import { countOf } from "@/lib/arabic-count";

interface ExpensesCommandHeaderProps {
  lang: "ar" | "en";
  expenseCount: number;
  scanning: boolean;
  onScanReceipt: () => void;
  onCreateNew: () => void;
}

export function ExpensesCommandHeader({
  lang,
  expenseCount,
  scanning,
  onScanReceipt,
  onCreateNew,
}: ExpensesCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <AdminPageHeader
      icon={Wallet}
      title={isAr ? "سجل المصروفات والنفقات" : "Expenses & Operational Costs"}
      badges={
        <AdminPageCount>{countOf(expenseCount, "expense", isAr ? "ar" : "en")}</AdminPageCount>
      }
      description={
        isAr
          ? "تتبع المصروفات التشغيلية، ومسح الفواتير بالذكاء الاصطناعي، وتحليل هامش الربح الصافي."
          : "Track operational expenses, scan receipts with AI, and evaluate net profit margins."
      }
      actions={
        <>
          <AdminPageAction
            icon={Sparkles}
            variant="outline"
            label={
              scanning
                ? isAr
                  ? "جاري المسح الضوئي..."
                  : "Scanning Receipt…"
                : isAr
                  ? "مسح فاتورة بالذكاء الاصطناعي"
                  : "AI Receipt Scanner"
            }
            iconOnPhone
            busy={scanning}
            disabled={scanning}
            onClick={onScanReceipt}
            className="border-primary/20 text-primary hover:bg-primary/5"
          />
          <AdminPageAction
            icon={Plus}
            label={isAr ? "إضافة مصروف" : "Add Expense"}
            short={isAr ? "إضافة" : "Add"}
            onClick={onCreateNew}
          />
        </>
      }
    />
  );
}
