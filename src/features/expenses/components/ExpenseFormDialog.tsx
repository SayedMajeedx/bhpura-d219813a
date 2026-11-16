import { useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Loader2, Repeat, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
import { cn } from "@/lib/utils";
import { deletePublicMediaUrl, uploadPublicMedia } from "@/lib/r2-upload";
import { syncExpensePackaging } from "@/components/accounting/sync-expense-packaging";
import { createExpense, updateExpense, type ExpenseRow } from "@/lib/data/expenses";
import { accountingQueries } from "@/lib/data/accounting";
import { getCurrentUser } from "@/lib/auth/session";
import { currencyLabel } from "@/lib/currency-label";
import { moneyFractionDigits } from "@/lib/format";
import { useStoreCurrency } from "@/hooks/use-store-currency";
import { CreatableCategorySelect } from "@/features/expenses/components/CreatableCategorySelect";
import { localDateKey } from "@/features/expenses/lib/date-range";
import { datesDueBy, monthsText } from "@/features/expenses/lib/recurring";
import {
  PROBLEM_WORDS,
  categoryChoices,
  categoryLabel,
  expensePayload,
  formFromExpense,
  formProblems,
  type ExpenseForm,
  type ExpenseKind,
} from "@/features/expenses/lib/expense-form";

const UNITS = [
  { en: "Bags", ar: "أكياس" },
  { en: "Boxes", ar: "علب" },
  { en: "Cards", ar: "بطاقات" },
  { en: "Pieces", ar: "قطع" },
  { en: "Metres", ar: "أمتار" },
  { en: "Kg", ar: "كيلو" },
];

/**
 * The one way to add or change an expense: what kind it is (a running cost, or stock bought to
 * use up), its category in the reader's words, amount, date, supplier, whether it repeats, its
 * receipt and notes. Rules in `lib/expense-form.ts`. The page had two forms saving different
 * fields; a receipt could not be kept with a supplier, nor a repeat with a receipt.
 */
export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
  usedCategories,
  offerStock,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: ExpenseRow | null;
  usedCategories: string[];
  /** The store keeps stock or packaging (or this expense is a stock purchase already). */
  offerStock: boolean;
  /** Told the saved expense's day, so the page can show its period. */
  onSaved: (expenseDate: string) => void;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const w = (words: { en: string; ar: string }) => words[isAr ? "ar" : "en"];
  const brand = useBrand();
  const storeCurrency = useStoreCurrency(brand.id);
  const today = localDateKey(new Date());
  const ids = useId();
  const [form, setForm] = useState<ExpenseForm>(() =>
    formFromExpense(expense, storeCurrency, today),
  );
  const set = (patch: Partial<ExpenseForm>) => setForm((prev) => ({ ...prev, ...patch }));
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const vendorsQ = useQuery(accountingQueries.vendorOptions(brand.id));
  const vendors = (vendorsQ.data ?? []) as Array<{ id: string; name: string }>;
  const isCopy = Boolean(expense?.recurring_source_id);
  const showKinds = offerStock || form.kind === "cogs";
  const problems = formProblems(form);
  const digits = moneyFractionDigits(form.currency);
  const filling = !expense && form.repeats ? datesDueBy(form.date, form.period, today) : [];
  const label = (category: string) => categoryLabel(category, isAr ? "ar" : "en");

  const chooseReceipt = (file: File | null) => {
    if (!file) return;
    if (!(file.type.startsWith("image/") || file.type === "application/pdf")) {
      toast.error(isAr ? "اختر صورة أو ملف PDF" : "Choose an image or PDF file");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast.error(isAr ? "حجم الملف يجب ألا يتجاوز 12 ميغابايت" : "File must be 12MB or smaller");
      return;
    }
    setReceiptFile(file);
  };

  const save = async () => {
    setTried(true);
    if (problems.length) {
      toast.error(w(PROBLEM_WORDS[problems[0]]));
      return;
    }
    setSaving(true);
    let uploaded: string | null = null;
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("NOT_AUTHENTICATED");
      if (receiptFile) uploaded = await uploadPublicMedia(brand.id, receiptFile, "expense-receipt");
      const payload = {
        ...expensePayload(form, usedCategories),
        receipt_url: uploaded ?? expense?.receipt_url ?? null,
      };
      if (expense) await updateExpense(brand.id, expense.id, payload);
      else await createExpense({ ...payload, user_id: user.id, brand_id: brand.id });
      if (uploaded && expense?.receipt_url && uploaded !== expense.receipt_url) {
        void deletePublicMediaUrl(brand.id, expense.receipt_url).catch(() => undefined);
      }
      // A stock purchase of packaging joins the packaging materials (`syncExpensePackaging`).
      await syncExpensePackaging(supabase, brand.id, payload, isAr);
      toast.success(
        expense
          ? isAr
            ? "تم حفظ المصروف"
            : "Expense saved"
          : isAr
            ? "تمت إضافة المصروف"
            : "Expense added",
        {
          description: filling.length
            ? isAr
              ? `وسُجّل تلقائياً أيضاً لـ ${monthsText(filling, "ar")}`
              : `Also recorded for ${monthsText(filling, "en")}`
            : undefined,
        },
      );
      onSaved(form.date);
    } catch (error) {
      if (uploaded) void deletePublicMediaUrl(brand.id, uploaded).catch(() => undefined);
      toast.error(
        (error as { message?: string })?.message === "NOT_AUTHENTICATED"
          ? isAr
            ? "سجّل الدخول من جديد"
            : "Sign in again"
          : isAr
            ? "تعذر حفظ المصروف"
            : "The expense could not be saved",
      );
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (problem: (typeof problems)[number]) =>
    tried && problems.includes(problem) ? (
      <p className="mt-1 text-xs text-destructive">{w(PROBLEM_WORDS[problem])}</p>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {expense
              ? isAr
                ? "تعديل المصروف"
                : "Edit expense"
              : isAr
                ? "مصروف جديد"
                : "New expense"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {showKinds && (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">
                {isAr ? "نوع المصروف" : "Kind of expense"}
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {(["opex", "cogs"] as ExpenseKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={form.kind === kind}
                    onClick={() =>
                      set({
                        kind,
                        category: kind === "cogs" && !form.category ? "Packaging" : form.category,
                        repeats: kind === "cogs" ? false : form.repeats,
                      })
                    }
                    className={cn(
                      "rounded-lg border p-2.5 text-start text-sm transition-colors duration-(--motion-quick)",
                      form.kind === kind
                        ? "border-primary bg-primary/5 font-semibold text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/40",
                    )}
                  >
                    <span className="block">
                      {kind === "opex"
                        ? isAr
                          ? "مصروف تشغيلي"
                          : "Running cost"
                        : isAr
                          ? "مشتريات مخزون"
                          : "Stock purchase"}
                    </span>
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      {kind === "opex"
                        ? isAr
                          ? "إيجار، رواتب، إعلانات: يُخصم من ربح الفترة"
                          : "Rent, wages, ads: taken off the period's profit"
                        : isAr
                          ? "تغليف ومواد: تُحسب تكلفتها مع كل طلب"
                          : "Packaging and materials: costed with each order"}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <div>
            <Label htmlFor={`${ids}-category`}>{isAr ? "التصنيف" : "Category"}</Label>
            <CreatableCategorySelect
              id={`${ids}-category`}
              value={form.category}
              categories={categoryChoices(usedCategories, form.kind)}
              lang={isAr ? "ar" : "en"}
              labelOf={label}
              onChange={(category) => set({ category })}
            />
            {fieldError("category")}
          </div>

          <div>
            <Label htmlFor={`${ids}-description`}>{isAr ? "الوصف" : "Description"}</Label>
            <Input
              id={`${ids}-description`}
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder={
                form.kind === "cogs"
                  ? isAr
                    ? "مثال: أكياس كبيرة"
                    : "e.g. Large bags"
                  : isAr
                    ? "مثال: إيجار المحل الشريك"
                    : "e.g. Partner shop rent"
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor={`${ids}-amount`}>
                {isAr ? "المبلغ" : "Amount"} ({currencyLabel(form.currency, isAr ? "ar" : "en")})
              </Label>
              <Input
                id={`${ids}-amount`}
                type="number"
                inputMode="decimal"
                min={0}
                step={digits > 0 ? 1 / 10 ** digits : 1}
                value={form.amount}
                onChange={(e) => set({ amount: e.target.value })}
                className="font-mono"
              />
              {fieldError("amount")}
            </div>
            <div>
              <Label htmlFor={`${ids}-date`}>{isAr ? "التاريخ" : "Date"}</Label>
              <Input
                id={`${ids}-date`}
                type="date"
                value={form.date}
                onChange={(e) => set({ date: e.target.value })}
              />
              {fieldError("date")}
            </div>
          </div>

          {form.kind === "cogs" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor={`${ids}-quantity`}>{isAr ? "عدد القطع" : "Pieces bought"}</Label>
                <Input
                  id={`${ids}-quantity`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={form.quantity}
                  onChange={(e) => set({ quantity: e.target.value })}
                  className="font-mono"
                />
                {fieldError("quantity")}
              </div>
              <div>
                <Label htmlFor={`${ids}-unit`}>{isAr ? "الوحدة" : "Unit"}</Label>
                <select
                  id={`${ids}-unit`}
                  value={form.unit}
                  onChange={(e) => set({ unit: e.target.value })}
                  className="h-9 w-full max-w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">{isAr ? "قطع" : "Pieces"}</option>
                  {UNITS.map((unit) => (
                    <option key={unit.en} value={unit.ar}>
                      {w(unit)}
                    </option>
                  ))}
                </select>
              </div>
              {Number(form.quantity) > 0 && Number(form.amount) > 0 && (
                <p className="col-span-2 text-xs text-muted-foreground">
                  {isAr ? "تكلفة القطعة: " : "Cost per piece: "}
                  <span className="font-mono">
                    {(Number(form.amount) / Number(form.quantity)).toFixed(digits + 1)}
                  </span>
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor={`${ids}-vendor`}>{isAr ? "المورد" : "Supplier"}</Label>
              <select
                id={`${ids}-vendor`}
                value={form.vendorId}
                onChange={(e) => set({ vendorId: e.target.value })}
                className="h-9 w-full max-w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">{isAr ? "بدون مورد" : "No supplier"}</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor={`${ids}-store`}>{isAr ? "أو اسم المحل" : "Or the shop's name"}</Label>
              <Input
                id={`${ids}-store`}
                value={form.storeName}
                onChange={(e) => set({ storeName: e.target.value })}
              />
            </div>
          </div>

          {form.kind === "opex" && !isCopy && (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor={`${ids}-repeats`} className="flex items-center gap-1.5">
                  <Repeat className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {isAr ? "يتكرر تلقائياً" : "Repeats by itself"}
                </Label>
                <div className="flex items-center gap-2">
                  {form.repeats && (
                    <select
                      aria-label={isAr ? "كل" : "Every"}
                      value={form.period}
                      onChange={(e) => set({ period: e.target.value as ExpenseForm["period"] })}
                      className="h-8 max-w-full rounded-md border border-input bg-background px-1.5 text-sm"
                    >
                      <option value="monthly">{isAr ? "كل شهر" : "Every month"}</option>
                      <option value="yearly">{isAr ? "كل سنة" : "Every year"}</option>
                    </select>
                  )}
                  <Switch
                    id={`${ids}-repeats`}
                    checked={form.repeats}
                    onCheckedChange={(repeats) => set({ repeats })}
                  />
                </div>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {filling.length
                  ? isAr
                    ? `يُسجَّل بنفس اليوم حتى توقفه، ويُسجَّل الآن أيضاً لـ ${monthsText(filling, "ar")}.`
                    : `Recorded on the same day until you stop it, and now also for ${monthsText(filling, "en")}.`
                  : isAr
                    ? "يُسجَّل في نفس اليوم كل شهر (أو كل سنة) حتى توقفه، مثل الإيجار والرواتب."
                    : "Recorded on the same day every month (or year) until you stop it, like rent and wages."}
              </p>
            </div>
          )}
          {isCopy && (
            <p className="flex items-center gap-1.5 rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground">
              <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
              {isAr
                ? "سُجّل تلقائياً من مصروف متكرر. تعديله يغيّر هذا الشهر فقط."
                : "Recorded by itself from a repeating expense. Changing it changes this one only."}
            </p>
          )}

          <div>
            <Label htmlFor={`${ids}-receipt`}>
              {isAr ? "الإيصال (اختياري)" : "Receipt (optional)"}
            </Label>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,application/pdf"
              onChange={(event) => chooseReceipt(event.target.files?.[0] ?? null)}
            />
            <button
              id={`${ids}-receipt`}
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                chooseReceipt(event.dataTransfer.files?.[0] ?? null);
              }}
              className={cn(
                "mt-1 flex min-h-20 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-3 text-center transition-colors duration-(--motion-quick)",
                dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
              )}
            >
              <UploadCloud className="mb-1 h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm">
                {isAr ? "اسحب الملف هنا أو اضغط للاختيار" : "Drop a file here or tap to choose"}
              </span>
            </button>
            {(receiptFile || expense?.receipt_url) && (
              <div className="mt-2 flex min-w-0 items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {receiptFile?.name ?? (isAr ? "الإيصال الحالي" : "Current receipt")}
                  </span>
                </span>
                {receiptFile ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setReceiptFile(null)}
                    aria-label={isAr ? "إزالة الملف" : "Remove the file"}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                ) : (
                  <a
                    href={expense?.receipt_url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {isAr ? "عرض" : "View"}
                  </a>
                )}
              </div>
            )}
          </div>

          <div>
            <Label htmlFor={`${ids}-notes`}>{isAr ? "ملاحظات" : "Notes"}</Label>
            <Textarea
              id={`${ids}-notes`}
              rows={2}
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {isAr ? "حفظ" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
