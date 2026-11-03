import { useEffect, useId, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff, Home, Scissors, Store } from "lucide-react";
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
import { formatDate, formatMoney } from "@/lib/format";
import { useProfileOptional } from "@/lib/profile-context";
import { useBrandOptional } from "@/lib/brand-context";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { useMoneyLabel } from "@/hooks/use-store-currency";
import { useOrderNumberFormat } from "@/hooks/use-order-number";
import {
  invalidateSupplierOrders,
  sendOrderToSupplier,
  supplierOrderQueries,
} from "@/lib/data/supplier-orders";
import { workshopQueries } from "@/lib/data/supplier-orders/workshop";
import {
  sheetLanguageFor,
  type JobSheetProduct,
  type SheetLang,
  type SheetWhere,
} from "@/features/orders/lib/job-sheet";
import {
  linesToSend,
  openOrdersOf,
  sendProblems,
  sendBatches,
  sendRequest,
  suggestedCost,
  type SendForm,
  type SendGroup,
} from "../lib/customer-pieces";
import { piecesLabel, piecesOf } from "../lib/order-state";
import { sentPiecesMessage } from "../lib/after-send";
import { supplierOrderError } from "../lib/errors";
import { useSupplierCatalog } from "../hooks/use-supplier-catalog";
import { SupplierField } from "./SupplierField";
import { SendPiecesList } from "./SendPiecesList";
import { AfterSendPanel } from "./AfterSendPanel";

/** What was just sent: where the pieces are, and what the panel after the send needs. */
type Sent = {
  where: SheetWhere;
  poId: string | null;
  /** The customers' orders the pieces came from (the list may be emptied behind the panel). */
  orderIds: string[];
  orderItemIds: string[];
  phone: string | null;
  language: SheetLang;
  message: string;
};

/**
 * Sends a customer's made-to-order pieces to the workshop, in one step (step 2 of
 * `docs/workshop-flow-plan.md`): to a supplier, on one of their open orders (or a new one with its
 * day), or to the store's own workshop; then, in the same window, the job sheet in the supplier's
 * language, the message to the supplier and telling the customer. Staff who see the store's
 * costs price each piece; anyone else's goes at no price, for finance staff to add. No customer's
 * name goes to the supplier.
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
  onPrintSheet,
  onTellCustomer,
  onOpenSupplierOrder,
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
  /** After the send, with the supplier order's id: the follow-up (log, refresh). */
  onSent: (poId: string | null) => Promise<void> | void;
  /** Moves the order to the workshop with no supplier order: the store's own workshop. */
  onPlainSend?: () => Promise<void> | void;
  /** Prints the job sheet of what was sent, in the language chosen, with who has it. */
  onPrintSheet?: (
    sheetLang: SheetLang,
    where: SheetWhere,
    sent: { poId: string | null; orderItemIds: string[] },
  ) => void;
  onTellCustomer?: () => void;
  onOpenSupplierOrder?: (poId: string) => void;
}) {
  const isAr = lang === "ar";
  const numberFormat = useOrderNumberFormat();
  const uid = useId();
  const qc = useQueryClient();
  const profile = useProfileOptional();
  const brand = useBrandOptional();
  const { profile: storeProfile } = useAdminStoreProfile(brandId);
  // Only staff who may see the store's costs price a piece (the database holds it).
  const prices = Boolean(profile?.canViewFinancials);
  const moneyLabel = useMoneyLabel(lang);
  const catalog = useSupplierCatalog(brandId, lang);
  const lines = useMemo(() => groups.flatMap((g) => g.lines), [groups]);
  const suppliersQ = useQuery({ ...workshopQueries.suppliers(brandId), enabled: open });
  const firstOrder = groups[0]?.orderId ?? "";
  const sentQ = useQuery({
    ...workshopQueries.orderPieces(brandId, firstOrder),
    enabled: open && groups.length === 1,
  });
  const ordersQ = useQuery({ ...supplierOrderQueries.list(brandId), enabled: open && prices });
  const sent = useMemo(() => new Set((sentQ.data ?? []).map((p) => p.orderItemId)), [sentQ.data]);
  const toSend = useMemo(() => linesToSend(lines, sent), [lines, sent]);
  const [maker, setMaker] = useState<"supplier" | "in_house">("supplier");
  const [form, setForm] = useState<SendForm>({
    vendorId: "",
    target: "new",
    expectedAt: "",
    pieces: {},
  });
  const [typed, setTyped] = useState<Set<string>>(new Set());
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<Sent | null>(null);
  const productIds = useMemo(
    () => [...new Set(toSend.map((l) => l.product_id).filter(Boolean) as string[])],
    [toSend],
  );
  const pricesQ = useQuery({
    ...supplierOrderQueries.lastPrices(brandId, form.vendorId, productIds),
    enabled: open && prices && Boolean(form.vendorId),
  });
  const suppliers = useMemo(() => suppliersQ.data ?? [], [suppliersQ.data]);
  const supplier = suppliers.find((s) => s.id === form.vendorId) ?? null;
  // A supplier's open orders: with their pieces for staff who read them, else number and day.
  const targets = useMemo(() => {
    const due = (day: string | null) =>
      day ? ` · ${isAr ? "موعدها" : "due"} ${formatDate(day, isAr ? "ar-BH" : "en-BH")}` : "";
    if (prices) {
      return openOrdersOf(ordersQ.data ?? [], form.vendorId).map((o) => ({
        id: o.id,
        label: `${o.po_number} · ${piecesLabel(piecesOf(o).ordered, lang)}${due(o.expected_at)}`,
      }));
    }
    return (supplier?.openOrders ?? []).map((o) => ({
      id: o.id,
      label: `${o.poNumber}${due(o.expectedAt)}`,
    }));
  }, [prices, ordersQ.data, form.vendorId, supplier, isAr, lang]);

  // Each piece starts chosen, at its suggested cost; a cost typed by hand is kept when the
  // tailor or their last prices change.
  useEffect(() => {
    if (!open) return;
    const lastPrices = pricesQ.data ?? new Map<string, number>();
    const productCost = (id: string) => Number(catalog.productById.get(id)?.cost_price ?? 0) || 0;
    setForm((f) => ({
      ...f,
      pieces: Object.fromEntries(
        toSend.map((line) => {
          const current = f.pieces[line.id];
          const cost =
            current && typed.has(line.id)
              ? current.cost
              : prices
                ? suggestedCost(line, lastPrices, productCost)
                : "";
          return [line.id, { send: current?.send ?? true, cost }];
        }),
      ),
    }));
  }, [open, toSend, pricesQ.data, catalog.productById, typed, prices]);

  const problems = tried && maker === "supplier" ? sendProblems(form, { prices }) : [];
  const costProblem = (id: string) => problems.some((p) => typeof p === "object" && p.cost === id);
  const chosen = Object.entries(form.pieces).filter(([, p]) => p.send);
  const total = chosen.reduce((sum, [, p]) => sum + (Number(p.cost) || 0), 0);
  const chosenIds = chosen.map(([id]) => id);
  const storeName = (isAr ? brand?.name_ar : null) || brand?.name_en || "";

  /** What the panel after the send needs: where the pieces are and the supplier's message. */
  const finish = async (poId: string | null) => {
    const fresh = await qc.fetchQuery(workshopQueries.suppliers(brandId));
    const vendor = fresh.find((s) => s.id === form.vendorId) ?? null;
    let poNumber: string | null = null;
    let expectedAt: string | null = form.target === "new" ? form.expectedAt || null : null;
    if (poId) {
      const pieces = await qc.fetchQuery(workshopQueries.orderPieces(brandId, firstOrder));
      const piece = pieces.find((p) => p.poId === poId);
      poNumber = piece?.poNumber ?? null;
      expectedAt = piece?.expectedAt ?? expectedAt;
    }
    const where: SheetWhere = { supplier: vendor?.name ?? null, poNumber, expectedAt };
    const language = sheetLanguageFor({ vendorLang: vendor?.language, screenLang: lang });
    const sentLines = lines.filter((line) => line.id && chosenIds.includes(line.id));
    setDone({
      where,
      poId,
      orderIds: groups.map((g) => g.orderId),
      orderItemIds: chosenIds,
      phone: vendor?.phone ?? null,
      language,
      message: sentPiecesMessage({
        lines: sentLines,
        products: catalog.products as unknown as JobSheetProduct[],
        vendorName: vendor?.name ?? "",
        storeName,
        where,
        lang: language,
        brandAddons: storeProfile.addons,
        storeVertical: storeProfile.vertical,
      }),
    });
  };

  const send = async () => {
    setTried(true);
    if (sendProblems(form, { prices }).length > 0) return;
    setSaving(true);
    // One order at a time: the first makes (or names) the supplier order, the rest join it.
    const request = sendRequest(form, { prices });
    let poId = request.poId;
    let sentOrders = 0;
    try {
      for (const batch of sendBatches(form, groups, { prices })) {
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
      await finish(poId);
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

  // The store's own workshop: the order moves to the workshop, with no supplier order.
  const inHouse = async () => {
    if (!onPlainSend) return;
    setSaving(true);
    try {
      await onPlainSend();
      setDone({
        where: { supplier: null, poNumber: null, expectedAt: null },
        poId: null,
        orderIds: groups.map((g) => g.orderId),
        orderItemIds: toSend.map((l) => l.id),
        phone: null,
        language: lang,
        message: "",
      });
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
        {done ? (
          <AfterSendPanel
            lang={lang}
            where={done.where}
            orderIds={done.orderIds}
            sheetLang={done.language}
            onPrint={
              onPrintSheet
                ? (sheetLang) =>
                    onPrintSheet(sheetLang, done.where, {
                      poId: done.poId,
                      orderItemIds: done.orderItemIds,
                    })
                : undefined
            }
            supplierPhone={done.phone}
            supplierMessage={done.message}
            onTellCustomer={onTellCustomer}
            onOpenOrder={
              done.poId && prices && onOpenSupplierOrder
                ? () => onOpenSupplierOrder(done.poId as string)
                : undefined
            }
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                {isAr
                  ? "تنضاف القطع لطلبية المورد، ثم تطبع ورقة الشغل وتراسل المورد والعميل من هنا."
                  : "The pieces go on the supplier's order; then print the job sheet and message the supplier and the customer from here."}
              </DialogDescription>
            </DialogHeader>

            <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1">
              {onPlainSend && (
                <div
                  role="radiogroup"
                  aria-label={isAr ? "من يصنع القطعة" : "Who makes it"}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2"
                >
                  {(
                    [
                      ["supplier", Store, isAr ? "مورد أو خيّاط" : "A supplier"],
                      ["in_house", Home, isAr ? "ورشتنا" : "Our own workshop"],
                    ] as const
                  ).map(([value, Icon, label]) => (
                    <Button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={maker === value}
                      variant={maker === value ? "default" : "outline"}
                      onClick={() => setMaker(value)}
                      className="h-auto min-h-11 justify-start gap-2 whitespace-normal py-2 text-start"
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {label}
                    </Button>
                  ))}
                </div>
              )}

              {maker === "supplier" && (
                <>
                  <SupplierField
                    brandId={brandId}
                    value={form.vendorId}
                    onChange={(vendorId) => setForm((f) => ({ ...f, vendorId, target: "new" }))}
                    invalid={problems.includes("vendor")}
                    lang={lang}
                    options={prices ? undefined : suppliers}
                  />

                  {form.vendorId && (
                    <div className="space-y-1">
                      <Label htmlFor={`${uid}-target`}>
                        {isAr ? "على أي طلبية" : "On which order"}
                      </Label>
                      <select
                        id={`${uid}-target`}
                        value={form.target}
                        onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
                        className="h-10 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm pointer-coarse:h-11"
                      >
                        <option value="new">{isAr ? "طلبية جديدة" : "A new order"}</option>
                        {targets.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
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
                </>
              )}

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                  {maker === "supplier" && prices
                    ? isAr
                      ? `القطع وتكلفة كل قطعة (${moneyLabel})`
                      : `Pieces and each one's cost (${moneyLabel})`
                    : isAr
                      ? "القطع"
                      : "Pieces"}
                </legend>
                {toSend.length === 0 ? (
                  <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
                    {isAr
                      ? "كل هذه القطع عند مورد بالفعل."
                      : "Every one of these pieces is already with a supplier."}
                  </p>
                ) : (
                  <SendPiecesList
                    lines={toSend}
                    groups={groups}
                    form={form}
                    setForm={setForm}
                    prices={maker === "supplier" && prices}
                    costProblem={costProblem}
                    onTyped={(id) => setTyped((t) => new Set(t).add(id))}
                    numberFormat={numberFormat}
                    lang={lang}
                  />
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
                {maker === "supplier" && !prices && (
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? "سعر القطع يضيفه من يدير الحسابات."
                      : "The price is added by someone who manages the money."}
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

            <DialogFooter className="flex-wrap gap-2 border-t border-border-subtle pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              {maker === "in_house" ? (
                <Button type="button" onClick={inHouse} disabled={saving} className="gap-1.5">
                  <Home className="h-4 w-4" aria-hidden="true" />
                  {isAr ? "حوّل لورشتنا" : "Move to our workshop"}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={send}
                  disabled={saving || toSend.length === 0}
                  className="gap-1.5"
                >
                  <Scissors className="h-4 w-4" aria-hidden="true" />
                  {prices && chosen.length > 0 && total > 0
                    ? isAr
                      ? `أرسل (${formatMoney(total, currency, lang)})`
                      : `Send (${formatMoney(total, currency, lang)})`
                    : isAr
                      ? "أرسل"
                      : "Send"}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
