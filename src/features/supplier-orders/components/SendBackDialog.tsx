import { useEffect, useId, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Scissors } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMoneyLabel } from "@/hooks/use-store-currency";
import {
  invalidateSupplierOrders,
  sendOrderToSupplier,
  supplierOrderQueries,
} from "@/lib/data/supplier-orders";
import { invalidateOrders } from "@/lib/data/orders";
import { backProblems, backRequest, type BackForm } from "../lib/after-sending";
import { openOrdersOf } from "../lib/customer-pieces";
import { piecesLabel, piecesOf } from "../lib/order-state";
import { supplierOrderError } from "../lib/errors";
import { SupplierField } from "./SupplierField";

/**
 * A customer's piece that came back goes to a tailor again: to be fixed, free (a fault: the
 * order waits for it again), or altered at the tailor's charge (added to the piece's cost when
 * it comes back; the order stays where it is). With what to do, which the tailor's message says.
 */
export function SendBackDialog({
  open,
  onOpenChange,
  brandId,
  orderId,
  line,
  defaultVendorId,
  lang,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  orderId: string;
  line: { id: string; description: string; quantity: number };
  /** The tailor who made it, or last had it. */
  defaultVendorId: string;
  lang: "ar" | "en";
  onSent?: () => void;
}) {
  const isAr = lang === "ar";
  const uid = useId();
  const qc = useQueryClient();
  const moneyLabel = useMoneyLabel(lang);
  const ordersQ = useQuery({ ...supplierOrderQueries.list(brandId), enabled: open });
  const [form, setForm] = useState<BackForm>({
    purpose: "fix",
    vendorId: defaultVendorId,
    target: "new",
    expectedAt: "",
    cost: "",
    note: "",
  });
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const openOrders = useMemo(
    () => openOrdersOf(ordersQ.data ?? [], form.vendorId),
    [ordersQ.data, form.vendorId],
  );
  useEffect(() => {
    if (open) setForm((f) => ({ ...f, vendorId: f.vendorId || defaultVendorId }));
  }, [open, defaultVendorId]);

  const problems = tried ? backProblems(form) : [];
  const set = (patch: Partial<BackForm>) => setForm((f) => ({ ...f, ...patch }));

  const send = async () => {
    setTried(true);
    if (backProblems(form).length > 0) return;
    setSaving(true);
    try {
      await sendOrderToSupplier(orderId, backRequest(form, line.id));
      // A fix takes the order back to the workshop: its page and the queue read it again.
      await Promise.all([invalidateSupplierOrders(qc, brandId), invalidateOrders(qc, brandId)]);
      toast.success(
        form.purpose === "fix"
          ? isAr
            ? "رجعت القطعة للمورد للتصليح"
            : "The piece went back to be fixed"
          : isAr
            ? "أُرسلت القطعة للتعديل"
            : "The piece went for an alteration",
      );
      onSent?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(supplierOrderError(error, isAr));
    } finally {
      setSaving(false);
    }
  };

  const choices = [
    {
      value: "fix" as const,
      title: isAr ? "عيب: تصليح مجاني" : "A fault: fixed for free",
      body: isAr
        ? "ترجع للمورد بلا تكلفة، ويرجع الطلب للورشة حتى تصل."
        : "It goes back at no cost; the order waits at the workshop until it is back.",
    },
    {
      value: "alteration" as const,
      title: isAr ? "تعديل يطلبه الزبون" : "An alteration the customer asked for",
      body: isAr
        ? "بأجرة المورد إن وُجدت، تُضاف لتكلفة القطعة. الطلب يبقى في مرحلته."
        : "At the supplier's charge, if any, added to the piece's cost. The order stays where it is.",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="flex max-h-[92dvh] max-w-lg flex-col gap-3 overflow-hidden"
      >
        <DialogHeader>
          <DialogTitle>{isAr ? "إرجاع القطعة للمورد" : "Back to the supplier"}</DialogTitle>
          <DialogDescription dir="auto" className="break-words">
            {line.description}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              {isAr ? "لماذا ترجع" : "Why it goes back"}
            </legend>
            {choices.map((choice) => (
              <label
                key={choice.value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3",
                  form.purpose === choice.value ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <input
                  type="radio"
                  name={`${uid}-purpose`}
                  value={choice.value}
                  checked={form.purpose === choice.value}
                  onChange={() => set({ purpose: choice.value })}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{choice.title}</span>
                  <span className="block text-xs text-muted-foreground">{choice.body}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="space-y-1">
            <Label htmlFor={`${uid}-note`}>
              {form.purpose === "fix"
                ? isAr
                  ? "ما الذي يُصلَح"
                  : "What to fix"
                : isAr
                  ? "ما الذي يُعدَّل"
                  : "What to change"}
            </Label>
            <Textarea
              id={`${uid}-note`}
              dir="auto"
              rows={3}
              maxLength={500}
              value={form.note}
              onChange={(e) => set({ note: e.target.value })}
              aria-invalid={problems.includes("note") || undefined}
              placeholder={isAr ? "مثلاً: قصّر الطول ٢ سم" : "e.g. shorten the length by 2 cm"}
            />
            {problems.includes("note") && (
              <p className="text-xs text-destructive">
                {isAr ? "اكتب ما يحتاجه المورد." : "Write what the supplier needs to do."}
              </p>
            )}
          </div>

          <SupplierField
            brandId={brandId}
            value={form.vendorId}
            onChange={(vendorId) => set({ vendorId, target: "new" })}
            invalid={problems.includes("vendor")}
            lang={lang}
          />

          {form.vendorId && (
            <div className="space-y-1">
              <Label htmlFor={`${uid}-target`}>{isAr ? "على أي طلبية" : "On which order"}</Label>
              <select
                id={`${uid}-target`}
                value={form.target}
                onChange={(e) => set({ target: e.target.value })}
                className="h-10 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm pointer-coarse:h-11"
              >
                <option value="new">{isAr ? "طلبية جديدة" : "A new order"}</option>
                {openOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {`${o.po_number} · ${piecesLabel(piecesOf(o).ordered, lang)}${
                      o.expected_at
                        ? ` · ${isAr ? "موعدها" : "due"} ${formatDate(o.expected_at, isAr ? "ar-BH" : "en-BH")}`
                        : ""
                    }`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {form.vendorId && form.target === "new" && (
            <div className="space-y-1">
              <Label htmlFor={`${uid}-due`}>{isAr ? "موعد رجوعها" : "When it comes back"}</Label>
              <Input
                id={`${uid}-due`}
                type="date"
                value={form.expectedAt}
                onChange={(e) => set({ expectedAt: e.target.value })}
              />
            </div>
          )}

          {form.purpose === "alteration" && (
            <div className="space-y-1">
              <Label htmlFor={`${uid}-cost`}>
                {isAr
                  ? `أجرة المورد للقطعة (${moneyLabel})`
                  : `The supplier's charge a piece (${moneyLabel})`}
              </Label>
              <Input
                id={`${uid}-cost`}
                inputMode="decimal"
                value={form.cost}
                placeholder="0.000"
                onChange={(e) => set({ cost: e.target.value })}
                aria-invalid={problems.includes("cost") || undefined}
                className="font-mono tabular-nums"
              />
              <p className="text-xs text-muted-foreground">
                {problems.includes("cost")
                  ? isAr
                    ? "اكتب الأجرة رقماً، أو اتركها فارغة إن كانت مجانية."
                    : "Type the charge as a number, or leave it empty if it is free."
                  : isAr
                    ? "فارغة: بلا أجرة. ما يدفعه الزبون يُضاف لطلبه على حدة."
                    : "Empty: no charge. What the customer pays is added to their order apart."}
              </p>
            </div>
          )}
          {line.quantity > 1 && (
            <p className="text-xs text-muted-foreground">
              {isAr
                ? `ترجع ${piecesLabel(line.quantity, "ar")}.`
                : `${piecesLabel(line.quantity, "en")} go back.`}
            </p>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2 border-t border-border-subtle pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button type="button" onClick={send} disabled={saving} className="gap-1.5">
            <Scissors className="h-4 w-4" aria-hidden="true" />
            {isAr ? "أرسل" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
