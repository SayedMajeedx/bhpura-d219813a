import { useId, useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatMoney, moneyFractionDigits } from "@/lib/format";
import { downloadWorkbook, workbookFileName } from "@/features/finance-reports/lib/workbook";
import type { SupplierOrder } from "../lib/order-state";
import {
  PAYMENT_METHODS,
  isPayment,
  methodLabel,
  type AccountPayment,
} from "../lib/supplier-account";
import {
  STATEMENT_PRESETS,
  presetLabel,
  rangeText,
  statementRange,
  type StatementPreset,
  type StatementRange,
} from "../lib/supplier-statement";
import {
  registerRows,
  registerSheet,
  registerTotals,
  type MethodFilter,
} from "../lib/payments-register";

/**
 * Every payment to the store's suppliers: chosen by period, supplier and method, with the
 * period's totals by method and by supplier, and the list as an Excel sheet for the accountant.
 */
export function PaymentsRegisterTab({
  orders,
  payments,
  store,
  slug,
  currency,
  lang,
}: {
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
  const [vendorId, setVendorId] = useState<string>("all");
  const [method, setMethod] = useState<MethodFilter>("all");
  const [showTakenBack, setShowTakenBack] = useState(false);
  const range = useMemo(
    () => (preset === "custom" ? custom : statementRange(preset)),
    [preset, custom],
  );
  const money = (n: number) => formatMoney(n, currency, lang);

  // The suppliers' names, from their orders.
  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const order of orders) map.set(order.vendor_id, order.vendor_name);
    return map;
  }, [orders]);
  const suppliers = useMemo(
    () =>
      [...new Set(payments.filter(isPayment).map((p) => p.vendor_id))]
        .map((id) => ({ id, name: names.get(id) ?? id }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [payments, names],
  );
  const someUnrecorded = payments.some((p) => isPayment(p) && p.method === null);
  const unknown = isAr ? "مورد" : "Supplier";
  const rows = useMemo(
    () => registerRows(payments, names, { range, vendorId, method, showTakenBack }, unknown),
    [payments, names, range, vendorId, method, showTakenBack, unknown],
  );
  const totals = registerTotals(rows);

  const excel = async () => {
    try {
      await downloadWorkbook(
        [registerSheet(rows, { lang, store, range, digits: moneyFractionDigits(currency) })],
        workbookFileName(slug, "supplier-payments", rangeText(range, "en")),
      );
    } catch {
      toast.error(isAr ? "تعذر إنشاء الملف." : "The file could not be made.");
    }
  };

  const chip = (active: boolean, label: string, onClick: () => void) => (
    <Button
      key={label}
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      role="radio"
      aria-checked={active}
      className="rounded-full"
      onClick={onClick}
    >
      {label}
    </Button>
  );

  return (
    <div className="space-y-3">
      <Card className="space-y-3 p-3 sm:p-4">
        <div
          role="radiogroup"
          aria-label={isAr ? "الفترة" : "Period"}
          className="flex flex-wrap gap-2"
        >
          {STATEMENT_PRESETS.map((p) =>
            chip(preset === p, presetLabel(p, lang), () => setPreset(p)),
          )}
          {chip(preset === "custom", isAr ? "من تاريخ إلى تاريخ" : "Choose dates", () => {
            if (preset !== "custom") setCustom(range);
            setPreset("custom");
          })}
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
        <div className="flex min-w-0 flex-wrap items-end gap-3">
          <div className="min-w-0 space-y-1">
            <Label htmlFor={`${uid}-supplier`}>{isAr ? "المورد" : "Supplier"}</Label>
            <select
              id={`${uid}-supplier`}
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="h-9 max-w-full rounded-md border border-input bg-background px-2 text-sm pointer-coarse:h-11"
            >
              <option value="all">{isAr ? "كل الموردين" : "All suppliers"}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id={`${uid}-voided`}
              checked={showTakenBack}
              onCheckedChange={setShowTakenBack}
              aria-label={isAr ? "إظهار الدفعات الملغية" : "Show payments taken back"}
            />
            <Label htmlFor={`${uid}-voided`} className="text-sm">
              {isAr ? "إظهار الملغية" : "Show taken back"}
            </Label>
          </div>
        </div>
        <div
          role="radiogroup"
          aria-label={isAr ? "طريقة الدفع" : "Method"}
          className="flex flex-wrap gap-2"
        >
          {chip(method === "all", isAr ? "كل الطرق" : "All methods", () => setMethod("all"))}
          {PAYMENT_METHODS.map((m) => chip(method === m, methodLabel(m, lang), () => setMethod(m)))}
          {someUnrecorded &&
            chip(method === "none", methodLabel(null, lang), () => setMethod("none"))}
        </div>
      </Card>

      <Card className="space-y-3 p-3 sm:p-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">
              {isAr ? "المدفوع للموردين" : "Paid to suppliers"} · {rangeText(range, lang)}
            </p>
            <p className="text-xl font-bold tabular-nums">{money(totals.total)}</p>
            <p className="text-xs text-muted-foreground">
              {isAr ? `عدد الدفعات: ${totals.count}` : `Payments: ${totals.count}`}
            </p>
          </div>
          <Button type="button" variant="outline" className="gap-1.5" onClick={excel}>
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            Excel
          </Button>
        </div>
        {totals.count > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-1 text-xs font-semibold text-muted-foreground">
                {isAr ? "حسب طريقة الدفع" : "By method"}
              </p>
              <ul className="space-y-1 text-sm">
                {totals.byMethod.map((m) => (
                  <li key={m.method ?? "none"} className="flex justify-between gap-2">
                    <span>{methodLabel(m.method, lang)}</span>
                    <span className="tabular-nums">{money(m.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-xs font-semibold text-muted-foreground">
                {isAr ? "حسب المورد" : "By supplier"}
              </p>
              <ul className="space-y-1 text-sm">
                {totals.bySupplier.map((s) => (
                  <li key={s.vendorId} className="flex min-w-0 justify-between gap-2">
                    <span dir="auto" className="text-page-start min-w-0 break-words">
                      {s.supplier}
                    </span>
                    <span className="shrink-0 tabular-nums">{money(s.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>

      {rows.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {isAr ? "لا دفعات في هذه الفترة." : "No payments in this period."}
        </Card>
      ) : (
        <ul className="divide-y divide-border-subtle rounded-lg border border-border bg-card text-sm">
          {rows.map((row) => (
            <li key={row.payment.id} className="flex min-w-0 items-start gap-3 p-3">
              <span className="w-20 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {row.payment.paid_on}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  dir="auto"
                  className={
                    row.takenBack
                      ? "text-page-start break-words text-muted-foreground line-through"
                      : "text-page-start break-words font-semibold"
                  }
                >
                  {row.supplier}
                </p>
                <p className="break-words text-xs text-muted-foreground">
                  {[
                    methodLabel(row.payment.method, lang),
                    row.ordersPaid.length
                      ? (isAr ? "دفعت " : "Paid ") + row.ordersPaid.join(isAr ? "، " : ", ")
                      : null,
                    row.credit > 0
                      ? isAr
                        ? `رصيد ${money(row.credit)}`
                        : `Credit ${money(row.credit)}`
                      : null,
                    row.payment.reference,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {(row.payment.note || row.takenBack) && (
                  <p
                    dir="auto"
                    className="text-page-start break-words text-xs text-muted-foreground"
                  >
                    {row.takenBack
                      ? `${isAr ? "أُلغيت: " : "Taken back: "}${row.payment.void_reason ?? ""}`
                      : row.payment.note}
                  </p>
                )}
              </div>
              <span
                className={
                  row.takenBack
                    ? "shrink-0 tabular-nums text-muted-foreground line-through"
                    : "shrink-0 font-semibold tabular-nums"
                }
              >
                {money(row.payment.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
