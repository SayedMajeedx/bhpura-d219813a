import {
  Building2,
  CircleDollarSign,
  FileText,
  Package,
  Pencil,
  Percent,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { IncubatorsPageState } from "@/features/incubators/hooks/use-incubators-page";

/** The partner picker: every partner with the pieces it holds and what it owes. */
export function IncubatorPicker({ page }: { page: IncubatorsPageState }) {
  const { chips, currentId, isAr, loading, money, select } = page;
  return (
    <Card className="border-border p-3">
      <p className="mb-2 px-1 text-xs font-bold text-muted-foreground">
        {isAr ? "الحاضنات" : "INCUBATORS"}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {chips.map((chip) => (
          <Button
            key={chip.id}
            variant={currentId === chip.id ? "secondary" : "ghost"}
            className="h-auto min-w-56 flex-1 justify-between gap-3 px-3 py-3 sm:max-w-80"
            aria-pressed={currentId === chip.id}
            onClick={() => select(chip.id)}
          >
            <span className="min-w-0 text-start">
              <span className="block truncate font-bold" dir="auto">
                {chip.name}
              </span>
              <span className="block text-xs text-muted-foreground">
                {chip.units} {isAr ? "قطعة" : "units"}
                {!chip.isActive && (
                  <span className="ms-2 rounded-full bg-muted px-1.5 py-0.5 font-semibold">
                    {isAr ? "موقوفة" : "Inactive"}
                  </span>
                )}
              </span>
            </span>
            <span className="shrink-0 text-xs font-bold text-primary">
              {money(chip.due, chip.currency)}
            </span>
          </Button>
        ))}
        {!loading && chips.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">
            {isAr ? "أضف أول حاضنة للبدء" : "Add your first incubator"}
          </p>
        )}
      </div>
    </Card>
  );
}

/** The open partner: who it is, what can be done with it, and its figures. */
export function IncubatorOverview({ page }: { page: IncubatorsPageState }) {
  const { current, isAr, money, openDialog, summary } = page;
  if (!current) return null;
  const packaging =
    current.packaging_policy === "our_bom"
      ? isAr
        ? "التغليف من مخزوننا"
        : "Our BOM packaging"
      : current.packaging_policy === "fixed"
        ? isAr
          ? `تغليف ثابت: ${money(current.fixed_packaging_cost)}`
          : `Fixed packaging: ${money(current.fixed_packaging_cost)}`
        : isAr
          ? "التغليف على الحاضنة"
          : "Incubator-provided packaging";

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-bold" dir="auto">
            {current.name}
          </h2>
          <p className="break-words text-xs text-muted-foreground">
            {[current.contact_name, current.phone].filter(Boolean).join(" · ") ||
              (isAr ? "لا توجد بيانات تواصل" : "No contact details")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="outline">{packaging}</Badge>
            {!current.is_active && (
              <Badge variant="secondary">
                {isAr ? "موقوفة: لا تُحوَّل لها بضاعة" : "Inactive: no stock can be sent"}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openDialog("edit_incubator")}>
            <Pencil className="me-2 h-4 w-4" />
            {isAr ? "تعديل الحاضنة" : "Edit incubator"}
          </Button>
          <Button variant="outline" onClick={() => openDialog("statement")}>
            <FileText className="me-2 h-4 w-4" />
            {isAr ? "كشف حساب" : "Statement"}
          </Button>
          <Button
            variant="outline"
            onClick={() => openDialog("payment")}
            disabled={summary.due <= 0}
          >
            <Wallet className="me-2 h-4 w-4" />
            {isAr ? "تسجيل دفعة" : "Record payment"}
          </Button>
          <Button onClick={() => openDialog("transfer")} disabled={!current.is_active}>
            <Package className="me-2 h-4 w-4" />
            {isAr ? "تحويل بضاعة" : "Transfer stock"}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Metric
          icon={Package}
          label={isAr ? "القطع المتبقية" : "Remaining units"}
          value={String(summary.units)}
        />
        <Metric
          icon={Building2}
          label={isAr ? "قيمة البضاعة المتبقية" : "Remaining stock value"}
          value={money(summary.stockValue)}
        />
        <Metric
          icon={ShoppingBag}
          label={isAr ? "إجمالي المبيعات" : "Gross sales"}
          value={money(summary.gross)}
          hint={isAr ? `${summary.soldUnits} قطعة` : `${summary.soldUnits} units`}
        />
        <Metric
          icon={Percent}
          label={isAr ? "عمولة الحاضنة" : "Partner's commission"}
          value={money(summary.commission)}
        />
        <Metric
          icon={CircleDollarSign}
          label={isAr ? "المستلم منها" : "Received so far"}
          value={money(summary.paid)}
        />
        <Metric
          icon={Wallet}
          label={isAr ? "المبلغ المستحق" : "Amount due"}
          value={money(summary.due)}
          highlight
        />
      </div>
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  highlight = false,
}: {
  icon: typeof Package;
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <Card className="min-w-0 border-border p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="min-w-0 break-words text-xs text-muted-foreground">{label}</span>
        <Icon
          className={`h-4 w-4 shrink-0 ${highlight ? "text-primary" : "text-muted-foreground"}`}
        />
      </div>
      <p
        className={`break-words text-lg font-black sm:text-xl ${highlight ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
