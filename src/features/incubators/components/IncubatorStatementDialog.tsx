import { useMemo, useState } from "react";
import { MessageCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  PHONE_SHEET,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildWhatsAppLink } from "@/lib/os-formatting";
import type { IncubatorsPageState } from "@/features/incubators/hooks/use-incubators-page";
import {
  buildStatement,
  periodText,
  statementHtml,
  statementMessage,
  statementPeriod,
  type StatementPreset,
} from "@/features/incubators/lib/statement";
import { arNoun, arNounOblique } from "@/lib/arabic-count";

const PRESETS: Array<{ id: StatementPreset | "custom"; en: string; ar: string }> = [
  { id: "this_month", en: "This month", ar: "هذا الشهر" },
  { id: "last_month", en: "Last month", ar: "الشهر الماضي" },
  { id: "all", en: "Everything", ar: "كل الفترة" },
  { id: "custom", en: "Custom dates", ar: "تواريخ محددة" },
];

/**
 * The partner's statement of account for a period: what it sold, the store's share, what it
 * paid and what it owes today. Printed, or sent on WhatsApp by a person (nothing is sent by
 * itself).
 */
export function IncubatorStatementDialog({ page }: { page: IncubatorsPageState }) {
  const { closeDialog, current, dialog, isAr, lang, money, payments, sales, storeName } = page;
  const balanceDue = page.summary.due;
  const [preset, setPreset] = useState<StatementPreset | "custom">("this_month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const open = dialog === "statement" && Boolean(current);

  const period = useMemo(
    () => (preset === "custom" ? { from: from || null, to: to || null } : statementPeriod(preset)),
    [preset, from, to],
  );
  const statement = useMemo(
    () =>
      current
        ? buildStatement({ incubator: current, sales, payments, period, lang, balanceDue })
        : null,
    [current, sales, payments, period, lang, balanceDue],
  );
  if (!current || !statement) return null;

  const brand = storeName || (isAr ? "المتجر" : "Store");
  const whatsApp = buildWhatsAppLink(
    current.phone,
    statementMessage(statement, { lang, brand, money }),
  );

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
        brand,
        money,
        today: new Date().toLocaleDateString(isAr ? "ar-BH-u-nu-latn" : "en-BH"),
      }),
    );
    sheet.document.close();
  };

  const rows: Array<[string, string, boolean?]> = [
    [isAr ? "القطع المباعة" : "Pieces sold", String(statement.soldUnits)],
    [isAr ? "المبيعات" : "Sales", money(statement.gross)],
    [isAr ? "عمولة المحل الشريك" : "Partner's commission", money(statement.commission)],
    [isAr ? "المستحق لنا عن الفترة" : "Due to us for the period", money(statement.net)],
    [isAr ? "المدفوع في الفترة" : "Paid in the period", money(statement.paid)],
    [isAr ? "المبلغ المستحق اليوم" : "Balance due today", money(statement.balanceDue), true],
  ];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeDialog()}>
      <DialogContent className={`max-w-lg ${PHONE_SHEET}`} dir={isAr ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle>{isAr ? "كشف حساب المحل الشريك" : "Partner statement"}</DialogTitle>
          <DialogDescription className="break-words" dir="auto">
            {current.name} · {periodText(period, lang)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={isAr ? "الفترة" : "Period"}
          >
            {PRESETS.map((option) => (
              <Button
                key={option.id}
                type="button"
                size="sm"
                variant={preset === option.id ? "secondary" : "outline"}
                aria-pressed={preset === option.id}
                onClick={() => setPreset(option.id)}
              >
                {isAr ? option.ar : option.en}
              </Button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <Label htmlFor="statement-from">{isAr ? "من" : "From"}</Label>
                <Input
                  id="statement-from"
                  type="date"
                  className="mt-2"
                  value={from}
                  max={to || undefined}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </div>
              <div className="min-w-0">
                <Label htmlFor="statement-to">{isAr ? "إلى" : "To"}</Label>
                <Input
                  id="statement-to"
                  type="date"
                  className="mt-2"
                  value={to}
                  min={from || undefined}
                  onChange={(event) => setTo(event.target.value)}
                />
              </div>
            </div>
          )}

          <dl className="divide-y divide-border rounded-xl border border-border">
            {rows.map(([label, value, strong]) => (
              <div
                key={label}
                className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${strong ? "bg-primary/5 font-bold text-primary" : ""}`}
              >
                <dt className="min-w-0 break-words">{label}</dt>
                <dd className="shrink-0 font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? `يتضمن الكشف المطبوع ${arNounOblique(statement.sales.length, "sale")} و${arNoun(statement.payments.length, "payment")} بالتفصيل. المبيعات الملغاة لا تُحتسب.`
              : `The printed statement lists ${statement.sales.length} sales and ${statement.payments.length} payments in detail. Reversed sales are not counted.`}
          </p>
        </div>

        <DialogFooter className="gap-2">
          {whatsApp ? (
            <Button type="button" variant="outline" asChild>
              <a href={whatsApp} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="me-2 h-4 w-4" />
                {isAr ? "إرسال الملخص واتساب" : "Send the summary on WhatsApp"}
              </a>
            </Button>
          ) : (
            <p className="me-auto self-center text-xs text-muted-foreground">
              {isAr
                ? "أضف هاتف المحل الشريك لإرسال الملخص واتساب."
                : "Add the partner's phone to send the summary on WhatsApp."}
            </p>
          )}
          <Button type="button" onClick={print}>
            <Printer className="me-2 h-4 w-4" />
            {isAr ? "طباعة الكشف" : "Print the statement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
