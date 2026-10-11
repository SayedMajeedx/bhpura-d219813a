import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { IncubatorsPageState } from "@/features/incubators/hooks/use-incubators-page";
import { localDateTimeValue } from "@/features/incubators/lib/forms";
import { pieceName } from "@/features/incubators/lib/partner-stock";
import type { Incubator, IncubatorDialog } from "@/features/incubators/types";

const SELECT_CLASS =
  "mt-2 h-10 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm";

/** The forms: the ones the batch transfer and the statement do not own. */
const FORM_DIALOGS: IncubatorDialog[] = [
  "incubator",
  "edit_incubator",
  "edit_item",
  "sale",
  "return",
  "payment",
];

const TITLES: Record<string, { en: string; ar: string }> = {
  incubator: { en: "Add incubator", ar: "إضافة حاضنة" },
  edit_incubator: { en: "Edit incubator details", ar: "تعديل بيانات الحاضنة" },
  edit_item: { en: "Edit item code and terms", ar: "تعديل كود وشروط القطعة" },
  sale: { en: "Record sale", ar: "تسجيل قطعة مباعة" },
  return: { en: "Return to main stock", ar: "إرجاع للمخزون الرئيسي" },
  payment: { en: "Record payment", ar: "تسجيل دفعة" },
};

/** The page's forms, one dialog at a time: a partner, a piece's terms, a sale, a return, a payment. */
export function IncubatorFormDialog({ page }: { page: IncubatorsPageState }) {
  const { activeItem, busy, closeDialog, current, dialog, isAr, lang, money, submit, summary } =
    page;
  const open = FORM_DIALOGS.includes(dialog);
  const editing = dialog === "edit_incubator" ? current : null;
  const piece = pieceName(activeItem?.product_variants, lang);
  const held = Number(activeItem?.quantity ?? 0);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeDialog()}>
      <DialogContent className="max-w-lg" dir={isAr ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle>{dialog ? TITLES[dialog]?.[lang] : ""}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(event.currentTarget);
          }}
        >
          {(dialog === "incubator" || dialog === "edit_incubator") && (
            <IncubatorFields isAr={isAr} editing={editing} />
          )}

          {dialog === "edit_item" && activeItem && (
            <>
              <p className="break-words rounded-md bg-muted p-3 text-sm font-bold" dir="auto">
                {piece} · {activeItem.product_variants?.sku || activeItem.product_variants?.barcode}
              </p>
              <Field
                label={isAr ? "كود الحاضنة" : "Incubator code"}
                name="external_code"
                defaultValue={activeItem.external_code || ""}
                autoComplete="off"
              />
              <Field
                label={isAr ? "سعر البيع المتفق" : "Consignment price"}
                name="price"
                type="number"
                min="0"
                step="0.001"
                defaultValue={String(activeItem.consignment_price)}
                required
              />
              <CommissionFields
                isAr={isAr}
                type={activeItem.commission_type}
                value={activeItem.commission_value}
              />
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "سيظهر الكود الجديد فورًا في البحث وقائمة البضاعة، ويُستخدم السعر والعمولة في المبيعات الجديدة فقط."
                  : "The new code appears immediately in search and stock lists. Price and commission apply to new sales only."}
              </p>
            </>
          )}

          {dialog === "sale" && activeItem && (
            <>
              <p className="break-words rounded-md bg-muted p-3 text-sm font-bold" dir="auto">
                {piece} · {isAr ? "المتوفر" : "available"}: {held}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={isAr ? "الكمية المباعة" : "Sold quantity"}
                  name="quantity"
                  type="number"
                  min="1"
                  max={String(Math.max(1, held))}
                  defaultValue="1"
                  required
                />
                <Field
                  label={isAr ? "سعر القطعة الفعلي" : "Actual unit price"}
                  name="price"
                  type="number"
                  min="0"
                  step="0.001"
                  defaultValue={String(activeItem.consignment_price ?? 0)}
                  required
                />
              </div>
              <Field
                label={isAr ? "تاريخ ووقت البيع" : "Sale date"}
                name="sold_at"
                type="datetime-local"
                defaultValue={localDateTimeValue()}
                max={localDateTimeValue()}
                required
              />
            </>
          )}

          {dialog === "return" && activeItem && (
            <>
              <p className="break-words rounded-md bg-muted p-3 text-sm font-bold" dir="auto">
                {piece} · {isAr ? "المتوفر" : "available"}: {held}
              </p>
              <Field
                label={isAr ? "الكمية المرجعة" : "Return quantity"}
                name="quantity"
                type="number"
                min="1"
                max={String(Math.max(1, held))}
                defaultValue="1"
                required
              />
              <Field label={isAr ? "سبب أو ملاحظة" : "Reason or note"} name="notes" textarea />
            </>
          )}

          {dialog === "payment" && (
            <>
              <p className="rounded-md bg-muted p-3 text-sm">
                {isAr ? "المستحق حاليًا" : "Currently due"}:{" "}
                <b className="text-primary">{money(summary.due)}</b>
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={isAr ? "المبلغ المستلم" : "Amount"}
                  name="amount"
                  type="number"
                  min="0.001"
                  max={String(summary.due)}
                  step="0.001"
                  required
                />
                <Field
                  label={isAr ? "تاريخ الاستلام" : "Payment date"}
                  name="payment_date"
                  type="date"
                  defaultValue={localDateTimeValue().slice(0, 10)}
                  max={localDateTimeValue().slice(0, 10)}
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={isAr ? "طريقة الدفع" : "Method"} name="payment_method" />
                <Field label={isAr ? "رقم المرجع" : "Reference"} name="reference" />
              </div>
              <Field label={isAr ? "ملاحظات" : "Notes"} name="notes" textarea />
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "تُوزَّع الدفعة تلقائياً على أقدم المبيعات غير المسددة."
                  : "The payment is applied to the oldest unpaid sales first."}
              </p>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy
                ? isAr
                  ? "جاري الحفظ..."
                  : "Saving..."
                : isAr
                  ? "حفظ وتحديث المخزون"
                  : "Save and update"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IncubatorFields({ isAr, editing }: { isAr: boolean; editing: Incubator | null }) {
  return (
    <>
      <Field
        label={isAr ? "اسم الحاضنة" : "Name"}
        name="name"
        defaultValue={editing?.name || ""}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={isAr ? "اسم المسؤول" : "Contact"}
          name="contact_name"
          defaultValue={editing?.contact_name || ""}
        />
        <Field
          label={isAr ? "الهاتف" : "Phone"}
          name="phone"
          type="tel"
          defaultValue={editing?.phone || ""}
        />
      </div>
      <Field
        label={isAr ? "البريد الإلكتروني" : "Email"}
        name="email"
        type="email"
        defaultValue={editing?.email || ""}
      />
      <CommissionFields
        isAr={isAr}
        type={editing?.commission_type ?? "percentage"}
        value={editing?.commission_value ?? 0}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="packaging_policy">{isAr ? "سياسة التغليف" : "Packaging policy"}</Label>
          <select
            id="packaging_policy"
            name="packaging_policy"
            defaultValue={editing?.packaging_policy || "incubator"}
            className={SELECT_CLASS}
          >
            <option value="incubator">
              {isAr ? "تغليف الحاضنة — بلا تكلفة علينا" : "Incubator packaging — no cost"}
            </option>
            <option value="our_bom">
              {isAr ? "تغليفنا — احتساب وخصم BOM" : "Our packaging — use BOM"}
            </option>
            <option value="fixed">
              {isAr ? "تكلفة تغليف ثابتة لكل قطعة" : "Fixed packaging cost per unit"}
            </option>
          </select>
        </div>
        <Field
          label={isAr ? "تكلفة التغليف الثابتة" : "Fixed packaging cost"}
          name="fixed_packaging_cost"
          type="number"
          min="0"
          step="0.001"
          defaultValue={String(editing?.fixed_packaging_cost || 0)}
        />
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {isAr
          ? "يُحفظ اختيار التغليف وتكلفته داخل كل عملية بيع؛ تغيير الإعداد لاحقًا لا يغيّر أرباح المبيعات السابقة."
          : "Packaging choice and cost are snapshotted per sale; future setting changes never rewrite historical profit."}
      </p>
      <Field
        label={isAr ? "يوم التسوية الشهري" : "Settlement day"}
        name="settlement_day"
        type="number"
        min="1"
        max="31"
        defaultValue={editing?.settlement_day ? String(editing.settlement_day) : ""}
      />
      {editing && (
        <div>
          <Label htmlFor="is_active">{isAr ? "الحالة" : "Status"}</Label>
          <select
            id="is_active"
            name="is_active"
            defaultValue={String(editing.is_active ?? true)}
            className={SELECT_CLASS}
          >
            <option value="true">{isAr ? "نشطة" : "Active"}</option>
            <option value="false">{isAr ? "موقوفة" : "Inactive"}</option>
          </select>
        </div>
      )}
      <Field
        label={isAr ? "ملاحظات" : "Notes"}
        name="notes"
        defaultValue={editing?.notes || ""}
        textarea
      />
    </>
  );
}

function CommissionFields({ isAr, type, value }: { isAr: boolean; type: string; value: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="commission_type">{isAr ? "نوع العمولة" : "Commission type"}</Label>
        <select
          id="commission_type"
          name="commission_type"
          defaultValue={type || "percentage"}
          className={SELECT_CLASS}
        >
          <option value="percentage">{isAr ? "نسبة مئوية" : "Percentage"}</option>
          <option value="fixed">{isAr ? "مبلغ ثابت لكل قطعة" : "Fixed per unit"}</option>
        </select>
      </div>
      <Field
        label={isAr ? "قيمة العمولة" : "Commission value"}
        name="commission_value"
        type="number"
        min="0"
        step="0.001"
        defaultValue={String(value ?? 0)}
        required
      />
    </div>
  );
}

function Field({
  label,
  name,
  textarea,
  defaultValue,
  ...props
}: {
  label: string;
  name: string;
  textarea?: boolean;
  defaultValue?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="min-w-0">
      <Label htmlFor={name}>{label}</Label>
      {textarea ? (
        <Textarea id={name} name={name} defaultValue={defaultValue} className="mt-2" />
      ) : (
        <Input id={name} name={name} defaultValue={defaultValue} className="mt-2" {...props} />
      )}
    </div>
  );
}

/** Undoing a sale: a proper confirmation that says what it does, in the page's language. */
export function ReverseSaleDialog({ page }: { page: IncubatorsPageState }) {
  const { busy, isAr, lang, money, reverseSale, saleToReverse, setSaleToReverse } = page;
  return (
    <AlertDialog
      open={Boolean(saleToReverse)}
      onOpenChange={(open) => !open && setSaleToReverse(null)}
    >
      <AlertDialogContent dir={isAr ? "rtl" : "ltr"}>
        <AlertDialogHeader>
          <AlertDialogTitle>{isAr ? "إلغاء عملية البيع؟" : "Reverse this sale?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {saleToReverse && (
              <span className="mb-2 block break-words font-semibold text-foreground" dir="auto">
                {saleToReverse.quantity} × {pieceName(saleToReverse.product_variants, lang)} ·{" "}
                {money(Number(saleToReverse.net_due))}
              </span>
            )}
            {isAr
              ? "ستعود القطع إلى مخزون الحاضنة ولن يُحتسب مبلغها ضمن المستحق. لا يمكن إلغاء بيعة سُجّلت عليها دفعة."
              : "The pieces go back to the partner's stock and their amount is no longer owed. A sale with a payment against it cannot be reversed."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{isAr ? "تراجع" : "Keep the sale"}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault();
              void reverseSale();
            }}
          >
            {isAr ? "إلغاء البيع" : "Reverse the sale"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
