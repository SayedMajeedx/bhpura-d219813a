import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Pencil, Trash2, Wallet, Sparkles, Loader2, Store as StoreIcon, Calendar, Clock, Receipt } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import { useI18n, useT } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
import { scanReceipt, type ScannedExpense, type ScannedLineItem } from "@/lib/scan-receipt.functions";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/expenses")({
  beforeLoad: async ({ params }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status, email")
      .eq("id", user.id)
      .maybeSingle();

    const email = (user.email || "").toLowerCase();
    const isFixedSuperAdmin = email === "majeed@hotmail.it";
    const role = profile?.role;
    const status = profile?.status ?? "active";
    const allowed =
      isFixedSuperAdmin ||
      ((role === "admin" || role === "super_admin" || role === "brand_admin") && status === "active");

    if (!allowed) {
      throw redirect({ to: "/admin/b/$slug/dashboard", params: { slug: params.slug } });
    }
  },
  component: ExpensesPage,
});

type Expense = {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  currency: string;
  expense_date: string;
  notes: string | null;
  store_name?: string | null;
  receipt_time?: string | null;
  tax_amount?: number | null;
  tax_rate?: number | null;
  line_items?: ScannedLineItem[] | null;
};

function ExpensesPage() {
  const t = useT();
  const { lang } = useI18n();
  const locale = lang === "ar" ? "ar-BH" : "en-US";
  const qc = useQueryClient();
  const brand = useBrand();
  const brandId = brand.id;

  const q = useQuery({
    queryKey: ["expenses", brandId],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase.from("expenses") as any)
          .select("*")
          .eq("brand_id", brandId)
          .order("expense_date", { ascending: false });
        if (error) { console.error("[expenses]", error); return [] as Expense[]; }
        return (data ?? []) as Expense[];
      } catch (err) {
        console.error("[expenses]", err);
        return [] as Expense[];
      }
    },
    retry: false,
  });

  const [editing, setEditing] = useState<Expense | null>(null);
  const [open, setOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [scanned, setScanned] = useState<ScannedExpense | null>(null);
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const scanFn = useServerFn(scanReceipt);

  const list = q.data ?? [];
  const currency = list[0]?.currency ?? "BHD";
  const total = useMemo(() => list.reduce((s, e) => s + Number(e.amount || 0), 0), [list]);

  const del = async (id: string) => {
    if (!confirm(t("expenses.deleteConfirm"))) return;
    const { error } = await (supabase.from("expenses") as any).delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(t("common.delete"));
      qc.invalidateQueries({ queryKey: ["expenses"] });
    }
  };

  const onFilePicked = async (file: File | null) => {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      toast.error(lang === "ar" ? "الملف كبير جداً (الحد 12 ميغابايت)" : "File too large (max 12MB)");
      return;
    }
    setScanning(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("read failed"));
        r.readAsDataURL(file);
      });
      const result = await scanFn({ data: { dataUrl, mimeType: file.type || "image/jpeg", targetLang: lang === "ar" ? "ar" : "en" } });
      setScanned(result);
      setEditing(null);
      setReviewOpen(true);
      toast.success(lang === "ar" ? "تم استخراج بيانات الفاتورة" : "Receipt data extracted");
    } catch (e: any) {
      const msg = e?.message === "RATE_LIMITED"
        ? (lang === "ar" ? "تجاوزت الحد. حاول لاحقاً" : "Rate limited, try again")
        : e?.message === "CREDITS_EXHAUSTED"
          ? (lang === "ar" ? "نفدت رصيد الذكاء الاصطناعي" : "AI credits exhausted")
          : (e?.message ?? (lang === "ar" ? "فشل مسح الفاتورة" : "Failed to scan receipt"));
      toast.error(msg);
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display">{t("expenses.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("expenses.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            className="hidden"
            onChange={(e) => onFilePicked(e.target.files?.[0] ?? null)}
          />
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={scanning}
            className="border-primary/40 text-primary hover:bg-primary/5"
          >
            {scanning ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Sparkles className="h-4 w-4 me-2" />}
            {lang === "ar" ? "مسح فاتورة بالذكاء الاصطناعي" : "Scan receipt with AI"}
          </Button>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditing(null)}>
                <Plus className="h-4 w-4 me-2" /> {t("expenses.add")}
              </Button>
            </DialogTrigger>
            <ExpenseDialog
              expense={editing}
              onSaved={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["expenses"] }); }}
            />
          </Dialog>
        </div>
      </div>

      <ReceiptReviewDialog
        open={reviewOpen}
        onOpenChange={(v) => { setReviewOpen(v); if (!v) setScanned(null); }}
        scanned={scanned}
        onSaved={() => { setReviewOpen(false); setScanned(null); qc.invalidateQueries({ queryKey: ["expenses"] }); }}
      />

      <Card className="p-5 sm:p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wallet className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">{t("expenses.total")}</span>
          </div>
          <span className="text-2xl font-display">{formatMoney(total, currency, locale)}</span>
        </div>
      </Card>

      {list.length === 0 ? (
        <Card className="p-12 text-center">
          <Wallet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">{t("expenses.none")}</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3 text-start">{t("expenses.date")}</th>
                  <th className="p-3 text-start">{t("expenses.category")}</th>
                  <th className="p-3 text-start">{t("expenses.description")}</th>
                  <th className="p-3 text-end">{t("expenses.amount")}</th>
                  <th className="p-3 text-end w-24"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="p-3 whitespace-nowrap">{new Date(e.expense_date).toLocaleDateString(locale)}</td>
                    <td className="p-3 font-medium">{e.category}</td>
                    <td className="p-3 text-muted-foreground">
                      {e.store_name ? <span className="font-medium text-foreground">{e.store_name}</span> : null}
                      {e.store_name && e.description ? " — " : null}
                      {e.description || (!e.store_name ? "—" : "")}
                    </td>
                    <td className="p-3 text-end whitespace-nowrap font-medium">{formatMoney(Number(e.amount), e.currency, locale)}</td>
                    <td className="p-3 text-end whitespace-nowrap">
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(e); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => del(e.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Basic (manual) add/edit dialog
// ============================================================================
function ExpenseDialog({ expense, onSaved }: { expense: Expense | null; onSaved: () => void }) {
  const t = useT();
  const [form, setForm] = useState({
    category: expense?.category ?? "",
    description: expense?.description ?? "",
    amount: expense ? String(expense.amount) : "0",
    currency: expense?.currency ?? "BHD",
    expense_date: expense?.expense_date ?? new Date().toISOString().slice(0, 10),
    notes: expense?.notes ?? "",
  });

  const save = async () => {
    if (!form.category.trim()) return toast.error(t("expenses.category"));
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const payload = {
      user_id: user.id,
      category: form.category.trim(),
      description: form.description.trim() || null,
      amount: Number(form.amount) || 0,
      currency: form.currency,
      expense_date: form.expense_date,
      notes: form.notes.trim() || null,
    };
    const { error } = expense
      ? await (supabase.from("expenses") as any).update(payload).eq("id", expense.id)
      : await (supabase.from("expenses") as any).insert(payload);
    if (error) toast.error(error.message);
    else { toast.success(t("common.save")); onSaved(); }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{expense ? t("expenses.edit") : t("expenses.add")}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>{t("expenses.category")}</Label>
          <Input placeholder={t("expenses.categoryPh")} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        </div>
        <div>
          <Label>{t("expenses.description")}</Label>
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("expenses.amount")}</Label>
            <Input type="number" step="0.01" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <Label>{t("expenses.date")}</Label>
            <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>{t("expenses.notes")}</Label>
          <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save}>{t("common.save")}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ============================================================================
// AI Receipt Review Dialog — professional commercial-receipt layout
// ============================================================================
function ReceiptReviewDialog({
  open, onOpenChange, scanned, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scanned: ScannedExpense | null;
  onSaved: () => void;
}) {
  const t = useT();
  const { lang } = useI18n();
  const locale = lang === "ar" ? "ar-BH" : "en-US";
  const brand = useBrand();

  const [form, setForm] = useState<ScannedExpense | null>(scanned);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(scanned); }, [scanned]);

  if (!form) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }

  const setF = (patch: Partial<ScannedExpense>) => setForm((prev) => prev ? { ...prev, ...patch } : prev);
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

  const addItem = () => setF({ items: [...form.items, { name: "", quantity: 1, unit_price: 0, line_total: 0 }] });
  const removeItem = (idx: number) => setF({ items: form.items.filter((_, i) => i !== idx) });

  const computedSubtotal = form.items.reduce((s, i) => s + Number(i.line_total || 0), 0);
  const subtotal = form.subtotal || computedSubtotal;
  const grand = Number(form.amount) || subtotal + Number(form.tax_amount || 0);

  const save = async () => {
    if (!form.category.trim()) return toast.error(lang === "ar" ? "الفئة مطلوبة" : "Category required");
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
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
      const { error } = await (supabase.from("expenses") as any).insert(payload);
      if (error) throw error;
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
        <div className="rounded-lg border bg-secondary/30 p-4 space-y-3">
          <div>
            <Label className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
              <StoreIcon className="h-3.5 w-3.5" />
              {lang === "ar" ? "اسم المتجر" : "Store name"}
            </Label>
            <Input value={form.store_name} onChange={(e) => setF({ store_name: e.target.value })} className="text-base font-semibold" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
                <Calendar className="h-3.5 w-3.5" />
                {lang === "ar" ? "التاريخ" : "Date"}
              </Label>
              <Input type="date" value={form.expense_date} onChange={(e) => setF({ expense_date: e.target.value })} />
            </div>
            <div>
              <Label className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
                <Clock className="h-3.5 w-3.5" />
                {lang === "ar" ? "الوقت" : "Time"}
              </Label>
              <Input type="time" value={form.receipt_time} onChange={(e) => setF({ receipt_time: e.target.value })} />
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
              {lang === "ar" ? "إضافة بند" : "Add item"}
            </Button>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-[1fr_70px_100px_100px_36px] gap-2 px-3 py-2 bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
              <div>{lang === "ar" ? "المنتج" : "Item"}</div>
              <div className="text-center">{lang === "ar" ? "الكمية" : "Qty"}</div>
              <div className="text-end">{lang === "ar" ? "سعر الوحدة" : "Unit price"}</div>
              <div className="text-end">{lang === "ar" ? "الإجمالي" : "Total"}</div>
              <div />
            </div>
            {form.items.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {lang === "ar" ? "لا توجد بنود مستخرجة. أضف يدوياً." : "No items extracted. Add manually."}
              </div>
            ) : form.items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_70px_100px_100px_36px] gap-2 px-3 py-2 border-t items-center">
                <Input value={it.name} onChange={(e) => setItem(idx, { name: e.target.value })} className="h-9" />
                <Input type="number" min={1} step={1} value={it.quantity}
                  onChange={(e) => setItem(idx, { quantity: Number(e.target.value) || 0 })}
                  className="h-9 text-center" />
                <Input type="number" min={0} step={0.001} value={it.unit_price}
                  onChange={(e) => setItem(idx, { unit_price: Number(e.target.value) || 0 })}
                  className="h-9 text-end" />
                <div className="text-end text-sm font-medium tabular-nums">
                  {formatMoney(it.line_total, form.currency, locale)}
                </div>
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeItem(idx)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Totals block — commercial receipt style */}
        <div className="mt-4 rounded-lg border p-4 bg-secondary/20">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{lang === "ar" ? "العملة" : "Currency"}</Label>
              <Input value={form.currency} onChange={(e) => setF({ currency: e.target.value.toUpperCase().slice(0, 3) })} />
            </div>
            <div>
              <Label className="text-xs">{lang === "ar" ? "الفئة" : "Category"}</Label>
              <Input value={form.category} onChange={(e) => setF({ category: e.target.value })} />
            </div>
          </div>

          <Separator className="my-4" />

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{lang === "ar" ? "المجموع الفرعي" : "Subtotal"}</span>
              <span className="tabular-nums">{formatMoney(subtotal, form.currency, locale)}</span>
            </div>

            <div className="grid grid-cols-[1fr_90px_1fr] gap-2 items-center">
              <span className="text-muted-foreground">{lang === "ar" ? "الضريبة / VAT" : "Tax / VAT"}</span>
              <div className="flex items-center gap-1">
                <Input type="number" min={0} step={0.1} value={form.tax_rate}
                  onChange={(e) => setF({ tax_rate: Number(e.target.value) || 0 })}
                  className="h-8 text-end" />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              <Input type="number" min={0} step={0.001} value={form.tax_amount}
                onChange={(e) => setF({ tax_amount: Number(e.target.value) || 0 })}
                className="h-8 text-end" />
            </div>

            <Separator />

            <div className="flex items-center justify-between text-base font-bold pt-1">
              <span>{lang === "ar" ? "الإجمالي النهائي" : "Grand Total"}</span>
              <Input type="number" min={0} step={0.001} value={form.amount}
                onChange={(e) => setF({ amount: Number(e.target.value) || 0 })}
                className="h-10 w-40 text-end text-base font-bold" />
            </div>
          </div>
        </div>

        {/* Description + notes */}
        <div className="mt-4 grid gap-3">
          <div>
            <Label>{lang === "ar" ? "الوصف" : "Description"}</Label>
            <Input value={form.description} onChange={(e) => setF({ description: e.target.value })} />
          </div>
          <div>
            <Label>{lang === "ar" ? "ملاحظات" : "Notes"}</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setF({ notes: e.target.value })} />
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
