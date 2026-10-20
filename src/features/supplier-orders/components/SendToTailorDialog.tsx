import { Fragment, useEffect, useId, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff, Scissors } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { formatDate, formatMoney } from "@/lib/format";
import { useMoneyLabel } from "@/hooks/use-store-currency";
import {
  invalidateSupplierOrders,
  sendOrderToSupplier,
  supplierOrderQueries,
} from "@/lib/data/supplier-orders";
import {
  linesToSend,
  openOrdersOf,
  sendProblems,
  sendBatches,
  sendRequest,
  suggestedCost,
  type SendForm,
  type SendGroup,
  customerOrderName,
} from "../lib/customer-pieces";
import { piecesLabel, piecesOf } from "../lib/order-state";
import { supplierOrderError } from "../lib/errors";
import { useSupplierCatalog } from "../hooks/use-supplier-catalog";
import { SupplierField } from "./SupplierField";

/**
 * Sends a customer's made-to-order pieces to the tailor: which tailor, on which of their open
 * orders (or a new one, with its day), and each piece at the price the tailor asked this time.
 * The customer's order is the job sheet: nothing is typed twice, and no customer's name goes to
 * the tailor. Sending moves the order to "sent to the workshop".
 */
export function SendToTailorDialog({
  open,
  onOpenChange,
  brandId,
  groups,
  currency,
  lang,
  onSent,
  onPlainSend,
  title,
}: {
  /** The send's own words in this store ("Send to Tailor", "Send to Workshop"). */
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  /** The customers' orders whose pieces may go: one from an order's page, several from the list. */
  groups: readonly SendGroup[];
  currency: string;
  lang: "ar" | "en";
  /** After the send, with the supplier order's id: the follow-up (tell, log, refresh, open). */
  onSent: (poId: string | null) => Promise<void> | void;
  /** Marks the order sent with no supplier order, as before (an order's page only). */
  onPlainSend?: () => Promise<void> | void;
}) {
  const isAr = lang === "ar";
  const uid = useId();
  const qc = useQueryClient();
  const moneyLabel = useMoneyLabel(lang);
  const catalog = useSupplierCatalog(brandId, lang);
  const lines = useMemo(() => groups.flatMap((g) => g.lines), [groups]);
  const lineIds = useMemo(() => lines.map((l) => l.id).filter(Boolean) as string[], [lines]);
  const sentQ = useQuery({ ...supplierOrderQueries.orderPieces(brandId, lineIds), enabled: open });
  const ordersQ = useQuery({ ...supplierOrderQueries.list(brandId), enabled: open });
  const sent = useMemo(() => new Set((sentQ.data ?? []).map((p) => p.order_item_id)), [sentQ.data]);
  const toSend = useMemo(() => linesToSend(lines, sent), [lines, sent]);
  const [form, setForm] = useState<SendForm>({
    vendorId: "",
    target: "new",
    expectedAt: "",
    pieces: {},
  });
  const [typed, setTyped] = useState<Set<string>>(new Set());
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const productIds = useMemo(
    () => [...new Set(toSend.map((l) => l.product_id).filter(Boolean) as string[])],
    [toSend],
  );
  const pricesQ = useQuery({
    ...supplierOrderQueries.lastPrices(brandId, form.vendorId, productIds),
    enabled: open && Boolean(form.vendorId),
  });
  const openOrders = useMemo(
    () => openOrdersOf(ordersQ.data ?? [], form.vendorId),
    [ordersQ.data, form.vendorId],
  );

  // Each piece starts chosen, at its suggested cost; a cost typed by hand is kept when the
  // tailor or their last prices change.
  useEffect(() => {
    if (!open) return;
    const prices = pricesQ.data ?? new Map<string, number>();
    const productCost = (id: string) => Number(catalog.productById.get(id)?.cost_price ?? 0) || 0;
    setForm((f) => ({
      ...f,
      pieces: Object.fromEntries(
        toSend.map((line) => {
          const current = f.pieces[line.id];
          const cost =
            current && typed.has(line.id) ? current.cost : suggestedCost(line, prices, productCost);
          return [line.id, { send: current?.send ?? true, cost }];
        }),
      ),
    }));
  }, [open, toSend, pricesQ.data, catalog.productById, typed]);

  const problems = tried ? sendProblems(form) : [];
  const costProblem = (id: string) => problems.some((p) => typeof p === "object" && p.cost === id);
  const chosen = Object.values(form.pieces).filter((p) => p.send);
  const total = chosen.reduce((sum, p) => sum + (Number(p.cost) || 0), 0);

  const send = async () => {
    setTried(true);
    if (sendProblems(form).length > 0) return;
    setSaving(true);
    // One order at a time: the first makes (or names) the supplier order, the rest join it.
    const request = sendRequest(form);
    let poId = request.poId;
    let sentOrders = 0;
    try {
      for (const batch of sendBatches(form, groups)) {
        poId = await sendOrderToSupplier(batch.orderId, {
          vendorId: request.vendorId,
          poId,
          expectedAt: poId ? null : request.expectedAt,
          lines: batch.lines,
        });
        sentOrders += 1;
      }
      await invalidateSupplierOrders(qc, brandId);
      await onSent(poId);
      onOpenChange(false);
    } catch (error) {
      await invalidateSupplierOrders(qc, brandId);
      toast.error(supplierOrderError(error, isAr), {
        description:
          sentOrders > 0
            ? isAr
              ? `أُرسلت قطع ${sentOrders} من الطلبات قبل التوقف، وهي في طلبية المورد.`
              : `The pieces of ${sentOrders} ${sentOrders === 1 ? "order were" : "orders were"} sent before it stopped; they are on the supplier order.`
            : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const plain = async () => {
    if (!onPlainSend) return;
    setSaving(true);
    try {
      await onPlainSend();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="flex max-h-[92dvh] max-w-lg flex-col gap-3 overflow-hidden"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isAr
              ? "تنضاف القطع لحساب المورد بسعرها هذه المرة، وورقة الشغل هي طلب الزبون نفسه."
              : "The pieces join the supplier's account at this time's price; the job sheet is the customer's order itself."}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1">
          <SupplierField
            brandId={brandId}
            value={form.vendorId}
            onChange={(vendorId) => setForm((f) => ({ ...f, vendorId, target: "new" }))}
            invalid={problems.includes("vendor")}
            lang={lang}
          />

          {form.vendorId && (
            <div className="space-y-1">
              <Label htmlFor={`${uid}-target`}>{isAr ? "على أي طلبية" : "On which order"}</Label>
              <select
                id={`${uid}-target`}
                value={form.target}
                onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
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
              <Label htmlFor={`${uid}-due`}>
                {isAr ? "موعد التسليم المتفق عليه" : "Promised delivery date"}
              </Label>
              <Input
                id={`${uid}-due`}
                type="date"
                value={form.expectedAt}
                onChange={(e) => setForm((f) => ({ ...f, expectedAt: e.target.value }))}
              />
            </div>
          )}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              {isAr
                ? `القطع وتكلفة كل قطعة (${moneyLabel})`
                : `Pieces and each one's cost (${moneyLabel})`}
            </legend>
            {toSend.length === 0 ? (
              <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
                {isAr
                  ? "كل هذه القطع عند مورد بالفعل."
                  : "Every one of these pieces is already with a supplier."}
              </p>
            ) : (
              toSend.map((line, index) => {
                const piece = form.pieces[line.id] ?? { send: true, cost: "" };
                // Several orders at once: each order's pieces under its number.
                const group = groups.find((g) => g.lines.some((l) => l.id === line.id));
                const firstOfGroup =
                  groups.length > 1 &&
                  group &&
                  !toSend.slice(0, index).some((l) => group.lines.some((g) => g.id === l.id));
                return (
                  <Fragment key={line.id}>
                    {firstOfGroup && (
                      <p className="pt-1 text-xs font-bold text-muted-foreground">
                        {customerOrderName(group.invoice ?? null, isAr)}
                      </p>
                    )}
                    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border-subtle p-2.5">
                      <Checkbox
                        checked={piece.send}
                        onCheckedChange={(checked) =>
                          setForm((f) => ({
                            ...f,
                            pieces: {
                              ...f.pieces,
                              [line.id]: { ...piece, send: checked === true },
                            },
                          }))
                        }
                        aria-label={isAr ? `أرسل ${line.description}` : `Send ${line.description}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          dir="auto"
                          className="text-page-start line-clamp-2 break-words text-sm font-semibold"
                        >
                          {line.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {piecesLabel(line.quantity, lang)}
                        </p>
                      </div>
                      <Input
                        aria-label={
                          isAr ? `تكلفة ${line.description}` : `Cost of ${line.description}`
                        }
                        inputMode="decimal"
                        value={piece.cost}
                        placeholder="0.000"
                        disabled={!piece.send}
                        onChange={(e) => {
                          setTyped((t) => new Set(t).add(line.id));
                          setForm((f) => ({
                            ...f,
                            pieces: { ...f.pieces, [line.id]: { ...piece, cost: e.target.value } },
                          }));
                        }}
                        aria-invalid={costProblem(line.id) || undefined}
                        className="w-24 shrink-0 font-mono tabular-nums"
                      />
                    </div>
                  </Fragment>
                );
              })
            )}
            {problems.includes("nothing") && (
              <p className="text-xs text-destructive">
                {isAr ? "اختر قطعة واحدة على الأقل." : "Choose at least one piece."}
              </p>
            )}
            {problems.some((p) => typeof p === "object") && (
              <p className="text-xs text-destructive">
                {isAr
                  ? "اكتب تكلفة كل قطعة، صفراً أو أكثر."
                  : "Type each piece's cost, zero or more."}
              </p>
            )}
          </fieldset>

          <p className="flex items-start gap-2 rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
            <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {isAr
              ? "لا يصل للمورد اسم الزبون ولا رقمه. القطعة لا تدخل المخزون عند استلامها: هي مباعة للزبون."
              : "The supplier gets no customer name or number. The piece never joins the stock when it arrives: it is sold to the customer."}
          </p>
        </div>

        <DialogFooter className="flex-wrap gap-2 border-t border-border-subtle pt-3 sm:justify-between">
          {onPlainSend ? (
            <button
              type="button"
              onClick={plain}
              disabled={saving}
              className="min-h-10 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {isAr ? "حوّل الطلب للورشة بدون مورد" : "Mark as sent, with no supplier"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="button"
              onClick={send}
              disabled={saving || toSend.length === 0}
              className="gap-1.5"
            >
              <Scissors className="h-4 w-4" aria-hidden="true" />
              {chosen.length > 0 && total > 0
                ? isAr
                  ? `أرسل (${formatMoney(total, currency, lang)})`
                  : `Send (${formatMoney(total, currency, lang)})`
                : isAr
                  ? "أرسل"
                  : "Send"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
