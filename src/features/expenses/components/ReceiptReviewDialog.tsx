import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  Store as StoreIcon,
  Calendar,
  Clock,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import { useI18n, useT } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
import { createExpense } from "@/lib/data/expenses";

import { type ScannedExpense, type ScannedLineItem } from "@/lib/scan-receipt.functions";
import { getCurrentUser } from "@/lib/auth/session";

// ============================================================================
// AI Receipt Review Dialog — professional commercial-receipt layout
// ============================================================================
export function ReceiptReviewDialog({
  open,
  onOpenChange,
  scanned,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scanned: ScannedExpense | null;
  onSaved: () => void;
}) {
  const t = useT();
  const { lang } = useI18n();
  const locale = lang === "ar" ? "ar-BH-u-nu-latn" : "en-US";
  const brand = useBrand();

  const [form, setForm] = useState<ScannedExpense | null>(scanned);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(scanned);
  }, [scanned]);

  if (!form) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }

  const setF = (patch: Partial<ScannedExpense>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  const setItem = (idx: number, patch: Partial<ScannedLineItem>) => {
    setForm((prev) => {
      if (!prev) return prev;
      const items = prev.items.map((it, i) => {
        if (i !== idx) return it;
        const merged = { ...it, ...patch };
        // Recompute line_total if quantity or unit_price changed
        if (patch.quantity !== undefined || patch.unit_price !== undefined) {
          merged.line_total = Number((merged.quantity * merged.unit_price).toFixed(3));
        }
        return merged;
      });
      return { ...prev, items };
    });
  };

  const addItem = () =>
    setF({ items: [...form.items, { name: "", quantity: 1, unit_price: 0, line_total: 0 }] });
  const removeItem = (idx: number) => setF({ items: form.items.filter((_, i) => i !== idx) });

  const computedSubtotal = form.items.reduce((s, i) => s + Number(i.line_total || 0), 0);
  const subtotal = form.subtotal || computedSubtotal;
  const grand = Number(form.amount) || subtotal + Number(form.tax_amount || 0);

  const save = async () => {
    if (!form.category.trim())
      return toast.error(lang === "ar" ? "الفئة مطلوبة" : "Category required");
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) return;
      const payload = {
        user_id: user.id,
        brand_id: brand.id,
        category: form.category.trim(),
        description: form.description.trim() || null,
        amount: Number(grand) || 0,
        currency: form.currency,
        expense_date: form.expense_date,
        notes: form.notes.trim() || null,
        store_name: form.store_name.trim() || null,
        receipt_time: form.receipt_time || null,
        tax_amount: Number(form.tax_amount) || 0,
        tax_rate: Number(form.tax_rate) || 0,
        line_items: form.items,
      };
      await createExpense(payload);
      toast.success(t("common.save"));
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            {lang === "ar" ? "مراجعة الفاتورة الممسوحة" : "Review scanned receipt"}
            <Badge variant="secondary" className="gap-1 ms-2">
              <Sparkles className="h-3 w-3" />
              {lang === "ar" ? "مستخرج بالذكاء الاصطناعي" : "AI extracted"}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Header block: store, date, time */}
        <div className="rounded-lg border bg-secondary/30 p-4 space-y-4">
          <div>
            <Label className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <StoreIcon className="h-3.5 w-3.5" />
              {lang === "ar" ? "اسم المتجر" : "Store name"}
            </Label>
            <Input
              value={form.store_name}
              onChange={(e) => setF({ store_name: e.target.value })}
              className="text-base font-semibold"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Calendar className="h-3.5 w-3.5" />
                {lang === "ar" ? "التاريخ" : "Date"}
              </Label>
              <Input
                type="date"
                value={form.expense_date}
                onChange={(e) => setF({ expense_date: e.target.value })}
              />
            </div>
            <div>
              <Label className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Clock className="h-3.5 w-3.5" />
                {lang === "ar" ? "الوقت" : "Time"}
              </Label>
              <Input
                type="time"
                value={form.receipt_time}
                onChange={(e) => setF({ receipt_time: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">
              {lang === "ar" ? `المنتجات (${form.items.length})` : `Items (${form.items.length})`}
            </h3>
            <Button variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-3.5 w-3.5 me-1" />
              {lang === "ar" ? "إضافة منتج / خدمة" : "Add Product / Service"}
            </Button>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_70px_100px_100px_36px] gap-2 px-3 py-2 bg-secondary/50 text-xs text-muted-foreground">
              <div>{lang === "ar" ? "المنتج" : "Item"}</div>
              <div className="text-center">{lang === "ar" ? "الكمية" : "Qty"}</div>
              <div className="text-end">{lang === "ar" ? "سعر الوحدة" : "Unit price"}</div>
              <div className="text-end">{lang === "ar" ? "الإجمالي" : "Total"}</div>
              <div />
            </div>
            {form.items.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {lang === "ar"
                  ? "لا توجد بنود مستخرجة. أضف يدوياً."
                  : "No items extracted. Add manually."}
              </div>
            ) : (
              form.items.map((it, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[minmax(0,1fr)_70px_100px_100px_36px] gap-2 px-3 py-2 border-t items-center"
                >
                  <Input
                    value={it.name}
                    onChange={(e) => setItem(idx, { name: e.target.value })}
                    className="h-9"
                  />
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={it.quantity}
                    onChange={(e) => setItem(idx, { quantity: Number(e.target.value) || 0 })}
                    className="h-9 text-center"
                  />
                  <Input
                    type="number"
                    min={0}
                    step={0.001}
                    value={it.unit_price}
                    onChange={(e) => setItem(idx, { unit_price: Number(e.target.value) || 0 })}
                    className="h-9 text-end"
                  />
                  <div className="text-end text-sm font-medium tabular-nums">
                    {formatMoney(it.line_total, form.currency, locale)}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => removeItem(idx)}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Totals block — commercial receipt style */}
        <div className="mt-4 rounded-lg border p-4 bg-secondary/20">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">{lang === "ar" ? "العملة" : "Currency"}</Label>
              <Input
                value={form.currency}
                onChange={(e) => setF({ currency: e.target.value.toUpperCase().slice(0, 3) })}
              />
            </div>
            <div>
              <Label className="text-xs">{lang === "ar" ? "الفئة" : "Category"}</Label>
              <Input value={form.category} onChange={(e) => setF({ category: e.target.value })} />
            </div>
          </div>

          <Separator className="my-4" />

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {lang === "ar" ? "المجموع الفرعي" : "Subtotal"}
              </span>
              <span className="tabular-nums">{formatMoney(subtotal, form.currency, locale)}</span>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_90px_minmax(0,1fr)] gap-2 items-center">
              <span className="text-muted-foreground">
                {lang === "ar" ? "الضريبة / VAT" : "Tax / VAT"}
              </span>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={form.tax_rate}
                  onChange={(e) => setF({ tax_rate: Number(e.target.value) || 0 })}
                  className="h-8 text-end"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              <Input
                type="number"
                min={0}
                step={0.001}
                value={form.tax_amount}
                onChange={(e) => setF({ tax_amount: Number(e.target.value) || 0 })}
                className="h-8 text-end"
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between text-base font-bold pt-1">
              <span>{lang === "ar" ? "الإجمالي النهائي" : "Grand Total"}</span>
              <Input
                type="number"
                min={0}
                step={0.001}
                value={form.amount}
                onChange={(e) => setF({ amount: Number(e.target.value) || 0 })}
                className="h-10 w-40 text-end text-base font-bold"
              />
            </div>
          </div>
        </div>

        {/* Description + notes */}
        <div className="mt-4 grid gap-4">
          <div>
            <Label>{lang === "ar" ? "الوصف" : "Description"}</Label>
            <Input
              value={form.description}
              onChange={(e) => setF({ description: e.target.value })}
            />
          </div>
          <div>
            <Label>{lang === "ar" ? "ملاحظات" : "Notes"}</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setF({ notes: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {lang === "ar" ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
            {lang === "ar" ? "حفظ المصروف" : "Save expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
