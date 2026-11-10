import { useMemo, useState, useId } from "react";
import { FileSpreadsheet, MessageCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  PHONE_FULL_SCREEN,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, moneyFractionDigits } from "@/lib/format";
import { whatsappChatUrl } from "@/lib/whatsapp-phone";
import { cn } from "@/lib/utils";
import { downloadWorkbook, workbookFileName } from "@/features/finance-reports/lib/workbook";
import type { SupplierOrder } from "../lib/order-state";
import type { AccountPayment } from "../lib/supplier-account";
import {
  STATEMENT_PRESETS,
  balanceWords,
  buildSupplierStatement,
  presetLabel,
  rangeText,
  statementMessage,
  statementRange,
  type StatementPreset,
  type StatementRange,
} from "../lib/supplier-statement";
import { statementHtml, statementSheet } from "../lib/supplier-statement-files";

/**
 * A supplier's statement of account for a period: the balance before it, each order and payment
 * with the balance after it, and the balance at its end; downloaded as Excel, printed or saved
 * as a PDF, or summed up in a WhatsApp message a person sends the supplier to agree the account.
 */
export function SupplierStatementDialog({
  open,
  onOpenChange,
  supplier,
  orders,
  payments,
  store,
  slug,
  currency,
  lang,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: { id: string; name: string; phone: string | null };
  orders: readonly SupplierOrder[];
  payments: readonly AccountPayment[];
  store: string;
  slug: string;
  currency: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const uid = useId();
  const [preset, setPreset] = useState<StatementPreset | "custom">("this_month");
  const [custom, setCustom] = useState<StatementRange>(() => statementRange("this_month"));
  const range = useMemo(
    () => (preset === "custom" ? custom : statementRange(preset)),
    [preset, custom],
  );
  const money = (n: number) => formatMoney(n, currency, lang);
  const statement = useMemo(
    () => buildSupplierStatement({ supplier, orders, payments, range, lang }),
    [supplier, orders, payments, range, lang],
  );
  const chat = whatsappChatUrl(supplier.phone);
  const message = statementMessage(statement, { lang, store, money });

  const excel = async () => {
    try {
      await downloadWorkbook(
        [statementSheet(statement, { lang, store, digits: moneyFractionDigits(currency) })],
        workbookFileName(slug, `supplier-statement-${supplier.name}`, rangeText(range, "en")),
      );
    } catch {
      toast.error(isAr ? "تعذر إنشاء الملف." : "The file could not be made.");
    }
  };
  const print = () => {
    const sheet = window.open("", "_blank", "width=900,height=1000");
    if (!sheet) {
      toast.error(
        isAr
          ? "تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى."
          : "The print window was blocked. Allow pop-ups and try again.",
      );
      return;
    }
    sheet.document.open();
    sheet.document.write(
      statementHtml(statement, {
        lang,
        store,
        money,
        today: new Date().toLocaleDateString(isAr ? "ar-BH-u-nu-latn" : "en-BH"),
      }),
    );
    sheet.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className={cn("max-h-[90dvh] max-w-2xl gap-3 overflow-y-auto", PHONE_FULL_SCREEN)}
      >
        <DialogHeader>
          <DialogTitle>{isAr ? "كشف حساب المورد" : "Supplier statement"}</DialogTitle>
          <DialogDescription dir="auto" className="text-page-start break-words">
            {supplier.name} · {rangeText(range, lang)}
          </DialogDescription>
        </DialogHeader>

        <div
          role="radiogroup"
          aria-label={isAr ? "الفترة" : "Period"}
          className="flex flex-wrap gap-2"
        >
          {[...STATEMENT_PRESETS, "custom" as const].map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={preset === p ? "default" : "outline"}
              role="radio"
              aria-checked={preset === p}
              className="rounded-full"
              onClick={() => {
                if (p === "custom" && preset !== "custom") setCustom(range);
                setPreset(p);
              }}
            >
              {p === "custom"
                ? isAr
                  ? "من تاريخ إلى تاريخ"
                  : "Choose dates"
                : presetLabel(p, lang)}
            </Button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0 space-y-1">
              <Label htmlFor={`${uid}-from`}>{isAr ? "من" : "From"}</Label>
              <Input
                id={`${uid}-from`}
                type="date"
                value={custom.from ?? ""}
                onChange={(e) => setCustom((r) => ({ ...r, from: e.target.value || null }))}
              />
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor={`${uid}-to`}>{isAr ? "إلى" : "To"}</Label>
              <Input
                id={`${uid}-to`}
                type="date"
                value={custom.to ?? ""}
                onChange={(e) => setCustom((r) => ({ ...r, to: e.target.value || null }))}
              />
            </div>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3 text-sm sm:grid-cols-4">
          {[
            [
              isAr ? "الرصيد السابق" : "Balance before",
              balanceWords(statement.opening, money, lang),
            ],
            [isAr ? "طلبيات الفترة" : "Orders", money(statement.ordered)],
            [isAr ? "المدفوع في الفترة" : "Paid", money(statement.paid)],
            [
              isAr ? "الرصيد في آخرها" : "Balance at the end",
              balanceWords(statement.closing, money, lang),
            ],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="break-words font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        {statement.lines.length === 0 ? (
          <p className="rounded-lg bg-muted p-3 text-center text-sm text-muted-foreground">
            {isAr ? "لا طلبيات ولا دفعات في هذه الفترة." : "No orders or payments in this period."}
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle rounded-lg border border-border text-sm">
            {statement.lines.map((line, i) => (
              <li key={`${line.date}-${i}`} className="flex min-w-0 items-start gap-3 p-2.5">
                <span className="w-20 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {line.date}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{line.title}</p>
                  {line.detail && (
                    <p
                      dir="auto"
                      className="text-page-start break-words text-xs text-muted-foreground"
                    >
                      {line.detail}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-end tabular-nums">
                  <p className={line.kind === "order" ? "text-warning" : "text-success"}>
                    {line.kind === "order" ? `+${money(line.ordered)}` : `−${money(line.paid)}`}
                  </p>
                  <p className="text-xs text-muted-foreground">{money(line.balance)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="gap-1.5" onClick={excel}>
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            Excel
          </Button>
          <Button type="button" variant="outline" className="gap-1.5" onClick={print}>
            <Printer className="h-4 w-4" aria-hidden="true" />
            {isAr ? "طباعة أو PDF" : "Print or PDF"}
          </Button>
          {chat && (
            <Button asChild variant="outline" className="gap-1.5">
              <a
                href={`${chat}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="h-4 w-4 text-success" aria-hidden="true" />
                {isAr ? "إرسال الملخص على واتساب" : "Send the summary on WhatsApp"}
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
