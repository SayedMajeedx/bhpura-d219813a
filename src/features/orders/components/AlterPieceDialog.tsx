import { useEffect, useId, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Home, Scissors, Store, Wrench } from "lucide-react";
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
import { useMoneyLabel } from "@/hooks/use-store-currency";
import { useProfileOptional } from "@/lib/profile-context";
import { logActivity } from "@/lib/activity-log";
import { ordersKeys } from "@/lib/data/orders";
import { createOrderAlteration } from "@/lib/data/orders/alterations";
import { supplierOrderKeys } from "@/lib/data/supplier-orders";
import { workshopQueries } from "@/lib/data/supplier-orders/workshop";
import { AfterSendPanel } from "@/features/supplier-orders/components/AfterSendPanel";
import { SupplierField } from "@/features/supplier-orders/components/SupplierField";
import type { SheetLang, SheetWhere } from "@/features/orders/lib/job-sheet";
import {
  alterationError,
  alterationProblems,
  alterationRequest,
  alterationSupplierMessage,
  alterationTarget,
  measurementChanges,
  measurementFields,
  whereCharged,
  type AlterablePiece,
  type AlterationChange,
  type AlterationKind,
  type AlterForm,
} from "../lib/alterations";

export type AlterLine = {
  id: string;
  description: string;
  quantity: number;
  location?: string | null;
  custom_field_values?: unknown;
};

export type SentAlteration = {
  id: string;
  sourceItemId: string;
  kind: AlterationKind;
  changes: AlterationChange[];
  note: string | null;
  where: SheetWhere;
  sheetLang: SheetLang;
};

const emptyForm = (kind: AlterationKind): AlterForm => ({
  kind,
  after: {},
  note: "",
  madeBy: "supplier",
  vendorId: "",
  target: "new",
  dueAt: "",
  supplierCost: "",
  customerCharge: "",
});

/**
 * Sends a piece of the order for an alteration (the customer pays) or a fix (free), to a supplier
 * or the store's own workshop (step 3 of `docs/workshop-flow-plan.md`): what changes, from the
 * piece's own measurements; who does it and by when; the supplier's charge (finance staff only)
 * and the customer's price, with where it is charged. Then, in the same window, the sheet, the
 * supplier's message and the customer's. Mount it only while it is open, so each opening starts
 * a new form and a new request.
 */
export function AlterPieceDialog({
  open,
  onOpenChange,
  brandId,
  order,
  orderNumber,
  storeName,
  pieces,
  initialPieceId,
  lang,
  onPrint,
  onTellCustomer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  order: { id: string; status?: string | null; fulfillment_status?: string | null };
  /** The order's number as the store writes it. */
  orderNumber: string;
  storeName: string;
  pieces: readonly AlterablePiece<AlterLine>[];
  initialPieceId?: string | null;
  lang: "ar" | "en";
  onPrint?: (sent: SentAlteration, sheetLang: SheetLang) => void;
  onTellCustomer?: (sent: SentAlteration) => void;
}) {
  const isAr = lang === "ar";
  const uid = useId();
  const qc = useQueryClient();
  const profile = useProfileOptional();
  const prices = Boolean(profile?.canViewFinancials);
  const moneyLabel = useMoneyLabel(lang);
  const offered = pieces.filter((p) => p.alteration || p.fix);
  const [pieceId, setPieceId] = useState(initialPieceId ?? offered[0]?.line.id ?? "");
  const piece = offered.find((p) => p.line.id === pieceId) ?? offered[0] ?? null;
  const [form, setForm] = useState<AlterForm>(() =>
    emptyForm(piece?.alteration ? "alteration" : "fix"),
  );
  // One press, one alteration: the dialog is mounted afresh for each piece it is opened for.
  const [requestId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState<
    (SentAlteration & { phone: string | null; message: string }) | null
  >(null);

  useEffect(() => {
    setForm(emptyForm(piece?.alteration ? "alteration" : "fix"));
  }, [piece?.line.id, piece?.alteration]);

  const suppliersQ = useQuery({ ...workshopQueries.suppliers(brandId), enabled: open });
  const suppliers = useMemo(() => suppliersQ.data ?? [], [suppliersQ.data]);
  const supplier = suppliers.find((s) => s.id === form.vendorId) ?? null;
  const fields = useMemo(
    () => measurementFields(piece?.line.custom_field_values),
    [piece?.line.custom_field_values],
  );
  const problems = alterationProblems(form, fields, { prices });
  const target = alterationTarget(order);
  const set = (patch: Partial<AlterForm>) => setForm((f) => ({ ...f, ...patch }));
  const day = (d: string | null | undefined) => (d ? formatDate(d, isAr ? "ar-BH" : "en-GB") : "");

  const save = async () => {
    setTried(true);
    if (!piece || problems.length > 0) return;
    setSaving(true);
    try {
      const request = alterationRequest(form, fields, piece.line.id, requestId, { prices });
      const made = await createOrderAlteration(request);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ordersKeys.all(brandId) }),
        qc.invalidateQueries({ queryKey: supplierOrderKeys.all(brandId) }),
      ]);
      // Where it is now: the supplier's order (its number and due day), or our workshop.
      let where: SheetWhere = { supplier: null, poNumber: null, expectedAt: form.dueAt || null };
      if (form.madeBy === "supplier") {
        const sent = await qc
          .fetchQuery({ ...workshopQueries.orderPieces(brandId, order.id), staleTime: 0 })
          .catch(() => []);
        const line = sent.find((p) => p.poId === made.po_id && p.orderItemId === piece.line.id);
        where = {
          supplier: supplier?.name ?? line?.vendorName ?? null,
          poNumber: line?.poNumber ?? null,
          expectedAt: form.dueAt || line?.expectedAt || null,
        };
      }
      const changes = measurementChanges(fields, form.after);
      const sheetLang: SheetLang = supplier?.language ?? lang;
      const messageLang = sheetLang === "both" ? lang : sheetLang;
      const note = form.note.trim() || null;
      void logActivity({
        action: "order_alteration",
        order_id: order.id,
        en: `Sent ${piece.line.description} for ${form.kind === "fix" ? "a fix" : "an alteration"}${
          where.supplier ? ` to ${where.supplier}` : " to our workshop"
        }${made.linked ? ", charged on a new linked order" : ""}`,
        ar: `أرسل ${piece.line.description} لل${form.kind === "fix" ? "تصليح" : "تعديل"}${
          where.supplier ? ` إلى ${where.supplier}` : " إلى ورشتنا"
        }${made.linked ? "، وسعره على طلب جديد مرتبط" : ""}`,
      });
      setDone({
        id: made.id,
        sourceItemId: piece.line.id,
        kind: form.kind,
        changes,
        note,
        where,
        sheetLang,
        phone: supplier?.phone ?? null,
        message: where.supplier
          ? alterationSupplierMessage({
              vendorName: where.supplier,
              storeName,
              poNumber: where.poNumber,
              dueOn: day(where.expectedAt),
              piece: piece.line.description,
              kind: form.kind,
              changes,
              note,
              lang: messageLang,
            })
          : "",
      });
    } catch (error) {
      toast.error(
        alterationError(String((error as { message?: unknown } | null)?.message ?? ""), lang),
      );
    } finally {
      setSaving(false);
    }
  };

  const shown = tried ? problems : [];
  const kindButton = (kind: AlterationKind, allowed: boolean) => (
    <Button
      key={kind}
      type="button"
      role="radio"
      aria-checked={form.kind === kind}
      disabled={!allowed}
      variant={form.kind === kind ? "default" : "outline"}
      onClick={() => set({ kind })}
      className="h-auto min-h-11 justify-start gap-2 whitespace-normal py-2 text-start"
    >
      {kind === "fix" ? (
        <Wrench className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <Scissors className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span>
        {kind === "fix"
          ? isAr
            ? "تصليح مجاني"
            : "A free fix"
          : isAr
            ? "تعديل بسعر للعميل"
            : "An alteration the customer pays for"}
      </span>
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-lg">
        {done ? (
          <AfterSendPanel
            lang={lang}
            where={done.where}
            orderIds={[order.id]}
            sheetLang={done.sheetLang}
            onPrint={onPrint ? (sheetLang) => onPrint(done, sheetLang) : undefined}
            printLabel={
              done.kind === "fix"
                ? isAr
                  ? "اطبع أمر التصليح"
                  : "Print fix sheet"
                : isAr
                  ? "اطبع أمر التعديل"
                  : "Print alteration sheet"
            }
            supplierPhone={done.phone}
            supplierMessage={done.message || undefined}
            onTellCustomer={onTellCustomer ? () => onTellCustomer(done) : undefined}
            tellLabel={isAr ? "أبلغ العميل باستلام القطعة" : "Tell the customer it was received"}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{isAr ? "تعديل قطعة" : "Alter a piece"}</DialogTitle>
              <DialogDescription>
                {isAr
                  ? "ما يتغيّر، ومن يعمله ومتى، وسعره للعميل. ثم تطبع الورقة وتراسل المورد والعميل من هنا."
                  : "What changes, who does it and by when, and its price for the customer. Then print the sheet and message the supplier and the customer from here."}
              </DialogDescription>
            </DialogHeader>

            <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
              {offered.length > 1 && (
                <div className="space-y-1">
                  <Label htmlFor={`${uid}-piece`}>{isAr ? "القطعة" : "Piece"}</Label>
                  <select
                    id={`${uid}-piece`}
                    value={piece?.line.id ?? ""}
                    onChange={(e) => setPieceId(e.target.value)}
                    className="h-10 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm pointer-coarse:h-11"
                  >
                    {offered.map((p) => (
                      <option key={p.line.id} value={p.line.id}>
                        {p.line.description}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {piece && (
                <div
                  role="radiogroup"
                  aria-label={isAr ? "نوع العمل" : "Kind of work"}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2"
                >
                  {kindButton("alteration", piece.alteration)}
                  {kindButton("fix", piece.fix)}
                </div>
              )}

              {fields.length > 0 && (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">
                    {isAr
                      ? "المقاسات (غيّر ما يتغيّر فقط)"
                      : "Measurements (change only what changes)"}
                  </legend>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                    {fields.map((field) => {
                      const label =
                        (isAr
                          ? field.label_ar || field.label_en
                          : field.label_en || field.label_ar) || field.key;
                      return (
                        <div key={field.key} className="space-y-1">
                          <Label htmlFor={`${uid}-${field.key}`} className="text-xs">
                            {label}
                          </Label>
                          <Input
                            id={`${uid}-${field.key}`}
                            value={form.after[field.key] ?? field.value ?? ""}
                            onChange={(e) =>
                              set({ after: { ...form.after, [field.key]: e.target.value } })
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              <div className="space-y-1">
                <Label htmlFor={`${uid}-note`}>{isAr ? "ما المطلوب" : "What to do"}</Label>
                <Textarea
                  id={`${uid}-note`}
                  rows={2}
                  maxLength={500}
                  value={form.note}
                  onChange={(e) => set({ note: e.target.value })}
                  placeholder={isAr ? "تقصير الأكمام 2 سم" : "Shorten the sleeves by 2 cm"}
                  aria-invalid={shown.includes("change")}
                />
                {shown.includes("change") && (
                  <p className="text-xs text-destructive">
                    {isAr
                      ? "غيّر مقاساً أو اكتب المطلوب."
                      : "Change a measurement or say what to do."}
                  </p>
                )}
              </div>

              <div
                role="radiogroup"
                aria-label={isAr ? "من يعمله" : "Who does it"}
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
                    aria-checked={form.madeBy === value}
                    variant={form.madeBy === value ? "default" : "outline"}
                    onClick={() => set({ madeBy: value })}
                    className="h-auto min-h-11 justify-start gap-2 whitespace-normal py-2 text-start"
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {label}
                  </Button>
                ))}
              </div>

              {form.madeBy === "supplier" && (
                <>
                  <SupplierField
                    brandId={brandId}
                    value={form.vendorId}
                    onChange={(vendorId) => set({ vendorId, target: "new" })}
                    invalid={shown.includes("vendor")}
                    lang={lang}
                    options={prices ? undefined : suppliers}
                  />
                  {form.vendorId && (supplier?.openOrders.length ?? 0) > 0 && (
                    <div className="space-y-1">
                      <Label htmlFor={`${uid}-target`}>
                        {isAr ? "على أي طلبية" : "On which order"}
                      </Label>
                      <select
                        id={`${uid}-target`}
                        value={form.target}
                        onChange={(e) => set({ target: e.target.value })}
                        className="h-10 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm pointer-coarse:h-11"
                      >
                        <option value="new">{isAr ? "طلبية جديدة" : "A new order"}</option>
                        {supplier?.openOrders.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.poNumber}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {prices && (
                    <div className="space-y-1">
                      <Label htmlFor={`${uid}-cost`}>
                        {isAr
                          ? `أجرة المورد (${moneyLabel})`
                          : `The supplier's charge (${moneyLabel})`}
                      </Label>
                      <Input
                        id={`${uid}-cost`}
                        inputMode="decimal"
                        value={form.supplierCost}
                        onChange={(e) => set({ supplierCost: e.target.value })}
                        aria-invalid={shown.includes("supplier_cost")}
                      />
                    </div>
                  )}
                </>
              )}

              <div className="space-y-1">
                <Label htmlFor={`${uid}-due`}>{isAr ? "جاهزة بتاريخ" : "Ready by"}</Label>
                <Input
                  id={`${uid}-due`}
                  type="date"
                  value={form.dueAt}
                  onChange={(e) => set({ dueAt: e.target.value })}
                />
              </div>

              {form.kind === "alteration" && (
                <div className="space-y-1">
                  <Label htmlFor={`${uid}-charge`}>
                    {isAr
                      ? `السعر للعميل (${moneyLabel})`
                      : `Price for the customer (${moneyLabel})`}
                  </Label>
                  <Input
                    id={`${uid}-charge`}
                    inputMode="decimal"
                    value={form.customerCharge}
                    onChange={(e) => set({ customerCharge: e.target.value })}
                    aria-invalid={shown.includes("customer_charge")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {whereCharged(target, orderNumber, lang)}
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button type="button" onClick={save} disabled={saving || !piece}>
                {form.madeBy === "supplier"
                  ? isAr
                    ? "أرسل للمورد"
                    : "Send to the supplier"
                  : isAr
                    ? "إلى ورشتنا"
                    : "To our workshop"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
