import { useId } from "react";
import { Hash } from "lucide-react";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { orderNumberLabel } from "@/lib/order-number";

/** How a typed prefix is kept: letters, digits and dashes, six at most (the column's own check). */
export function cleanPrefix(text: string): string | null {
  const kept = text.replace(/[^A-Za-z0-9-]/g, "").slice(0, 6);
  return kept || null;
}

/**
 * How the store writes its order numbers (`orderNumberLabel`): a prefix and a least number of
 * digits, with the next order's number written as it will read. The number itself keeps counting.
 */
export function OrderNumberField({ isAr }: { isAr: boolean }) {
  const { form, setBs } = useBrandSettingsFormContext();
  const bs = form.bs;
  const ids = useId();
  const sample = orderNumberLabel(1042, bs);

  return (
    <div className="rounded-xl border border-border p-3.5 bg-background space-y-3">
      <div className="flex items-center gap-2">
        <Hash className="size-4 text-primary" />
        <span className="text-xs font-semibold">{isAr ? "رقم الطلب" : "Order number"}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-prefix`} className="text-xs font-medium">
            {isAr ? "البادئة" : "Prefix"}
          </Label>
          <Input
            id={`${ids}-prefix`}
            dir="ltr"
            className="text-xs h-9 font-mono"
            value={bs.order_number_prefix ?? ""}
            placeholder="PL-"
            maxLength={6}
            onChange={(e) => setBs({ order_number_prefix: cleanPrefix(e.target.value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-digits`} className="text-xs font-medium">
            {isAr ? "أقل عدد من الأرقام" : "Minimum digits"}
          </Label>
          <Input
            id={`${ids}-digits`}
            type="number"
            min={1}
            max={8}
            dir="ltr"
            className="text-xs h-9 font-mono"
            value={bs.order_number_digits ?? ""}
            placeholder="—"
            onChange={(e) => {
              const n = Math.round(Number(e.target.value));
              setBs({
                order_number_digits:
                  e.target.value === "" || !n ? null : Math.min(8, Math.max(1, n)),
              });
            }}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {isAr ? "يُكتب الطلب رقم 1042 هكذا: " : "Order 1042 is written as: "}
        <bdi className="font-mono text-foreground">{sample}</bdi>
        {isAr
          ? ". يتغيّر شكل الرقم فقط في الشاشات والفواتير والرسائل، ويستمر العدّ كما هو."
          : ". Only how the number is written changes, on screens, invoices and messages; counting goes on as before."}
      </p>
    </div>
  );
}
