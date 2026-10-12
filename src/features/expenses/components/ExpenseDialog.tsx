import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Loader2, UploadCloud, FileText, X } from "lucide-react";
import { toast } from "sonner";
import { useI18n, useT } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
import { cn } from "@/lib/utils";
import { deletePublicMediaUrl, uploadPublicMedia } from "@/lib/r2-upload";
import { syncExpensePackaging } from "@/components/accounting/sync-expense-packaging";
import { createExpense, updateExpense } from "@/lib/data/expenses";

import { getCurrentUser } from "@/lib/auth/session";
import type { Expense } from "@/features/expenses/types";
import { CreatableCategorySelect } from "@/features/expenses/components/CreatableCategorySelect";

// ============================================================================
// Basic (manual) add/edit dialog
// ============================================================================
export function ExpenseDialog({
  open,
  onOpenChange,
  expense,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: Expense | null;
  categories: string[];
  onSaved: () => void;
}) {
  const t = useT();
  const { lang } = useI18n();
  const brand = useBrand();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    category: expense?.category ?? "",
    description: expense?.description ?? "",
    amount: expense ? String(expense.amount) : "0",
    currency: expense?.currency ?? "BHD",
    expense_date: expense?.expense_date ?? new Date().toISOString().slice(0, 10),
    notes: expense?.notes ?? "",
  });

  const chooseReceipt = (file: File | null) => {
    if (!file) return;
    if (!(file.type.startsWith("image/") || file.type === "application/pdf")) {
      toast.error(lang === "ar" ? "اختر صورة أو ملف PDF" : "Choose an image or PDF file");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast.error(
        lang === "ar" ? "حجم الملف يجب ألا يتجاوز 12 ميغابايت" : "File must be 12MB or smaller",
      );
      return;
    }
    setReceiptFile(file);
  };

  const save = async () => {
    if (!form.category.trim()) return toast.error(t("expenses.category"));
    setSaving(true);
    let uploadedUrl: string | null = null;
    const user = await getCurrentUser();
    if (!user) {
      setSaving(false);
      return;
    }
    try {
      if (receiptFile)
        uploadedUrl = await uploadPublicMedia(brand.id, receiptFile, "expense-receipt");
      const normalized = form.category.trim().replace(/\s+/g, " ");
      const category =
        categories.find((item) => item.toLocaleLowerCase() === normalized.toLocaleLowerCase()) ??
        normalized;
      const payload = {
        user_id: user.id,
        brand_id: brand.id,
        category,
        description: form.description.trim() || null,
        amount: Number(form.amount) || 0,
        currency: form.currency,
        expense_date: form.expense_date,
        notes: form.notes.trim() || null,
        receipt_url: uploadedUrl ?? expense?.receipt_url ?? null,
      };
      if (expense) await updateExpense(brand.id, expense.id, payload);
      else await createExpense(payload);
      if (uploadedUrl && expense?.receipt_url && uploadedUrl !== expense.receipt_url) {
        void deletePublicMediaUrl(brand.id, expense.receipt_url).catch(() => undefined);
      }
      // Auto sync packaging expense to packaging materials inventory
      void syncExpensePackaging(supabase, brand.id, payload, lang === "ar");
      toast.success(t("common.save"));
      onSaved();
    } catch (error: any) {
      if (uploadedUrl) void deletePublicMediaUrl(brand.id, uploadedUrl).catch(() => undefined);
      toast.error(
        error?.message ?? (lang === "ar" ? "تعذر حفظ المصروف" : "Failed to save expense"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{expense ? t("expenses.edit") : t("expenses.add")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{t("expenses.category")}</Label>
            <CreatableCategorySelect
              value={form.category}
              categories={categories}
              lang={lang}
              onChange={(category) => setForm({ ...form, category })}
            />
          </div>
          <div>
            <Label>{t("expenses.description")}</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("expenses.amount")}</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("expenses.date")}</Label>
              <Input
                type="date"
                value={form.expense_date}
                onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>{t("expenses.notes")}</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div>
            <Label>
              {lang === "ar" ? "إرفاق إيصال (اختياري)" : "Upload receipt file (optional)"}
            </Label>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,application/pdf"
              onChange={(event) => chooseReceipt(event.target.files?.[0] ?? null)}
            />
            <button
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
                "mt-1 flex min-h-28 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-4 text-center transition-colors",
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-secondary/30",
              )}
            >
              <UploadCloud className="mb-2 h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium">
                {lang === "ar"
                  ? "اسحب الملف هنا أو اضغط للاختيار"
                  : "Drop a file here or click to browse"}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                {lang === "ar" ? "صور أو PDF، حتى 12 ميغابايت" : "Images or PDF, up to 12MB"}
              </span>
            </button>
            {(receiptFile || expense?.receipt_url) && (
              <div className="mt-2 flex items-center justify-between rounded-md border bg-secondary/30 px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {receiptFile?.name ?? (lang === "ar" ? "الإيصال الحالي" : "Current receipt")}
                  </span>
                </span>
                {receiptFile ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setReceiptFile(null)}
                    aria-label="Close"
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
                    {lang === "ar" ? "عرض" : "View"}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
