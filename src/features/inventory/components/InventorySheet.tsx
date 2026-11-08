import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { countOf } from "@/lib/arabic-count";
import { moneyFractionDigits } from "@/lib/format";
import { claimBottomBar, releaseBottomBar } from "@/lib/bottom-bar-store";
import { useInventoryAxisDefaults } from "@/features/inventory/hooks/use-inventory-axis-defaults";
import { useBulkSheetSave } from "@/features/inventory/hooks/use-bulk-sheet-save";
import {
  NO_EDITS,
  applyBulk,
  cellText,
  editCell,
  editVisible,
  editsAfterSave,
  problemText,
  sheetChanges,
  sheetProblems,
  sheetRows,
  sheetSavePlan,
  type SheetEdits,
  type SheetField,
  type SheetRow,
} from "@/features/inventory/lib/bulk-sheet";
import type { Product, Variant } from "@/features/inventory/types";
import { SheetBulkBar } from "./SheetBulkBar";
import { SheetReviewDialog } from "./SheetReviewDialog";

/** Rows drawn at once: a boutique's whole catalogue fits; a larger one narrows with the filters. */
const MAX_ROWS = 400;

const FIELD_LABELS: Record<SheetField, [string, string]> = {
  price: ["السعر", "Price"],
  wasPrice: ["قبل الخصم", "Was price"],
  stock: ["المخزون", "Stock"],
  cost: ["التكلفة", "Cost"],
};

function SheetCell({
  row,
  field,
  edits,
  problem,
  isAr,
  onChange,
}: {
  row: SheetRow;
  field: SheetField;
  edits: SheetEdits;
  problem?: string;
  isAr: boolean;
  onChange: (text: string) => void;
}) {
  const changed = edits.cells[row.variantId]?.[field] !== undefined;
  const label = `${FIELD_LABELS[field][isAr ? 0 : 1]}: ${row.productName} · ${row.options}`;
  return (
    <td className="px-1 py-1 align-top">
      <Input
        dir="ltr"
        inputMode={field === "stock" ? "numeric" : "decimal"}
        aria-label={label}
        aria-invalid={problem ? true : undefined}
        title={problem}
        value={cellText(row, field, edits)}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field === "wasPrice" ? "—" : undefined}
        className={`h-8 w-24 font-mono text-xs ${
          problem ? "border-destructive" : changed ? "border-primary bg-primary/5" : ""
        }`}
      />
      {problem && <span className="sr-only">{problem}</span>}
    </td>
  );
}

/**
 * The inventory's sheet: each size of the products the list shows (its tab, search and filters),
 * with its price, "was" price, stock and (for staff who may see costs) cost in cells, and each
 * product's switch for the store. Cells change one by one or many at a time from the chosen rows
 * (`SheetBulkBar`); nothing is saved until the review lists every change (`SheetReviewDialog`).
 */
export function InventorySheet({
  brandId,
  products,
  variantsByProduct,
  currency,
  isAr,
  canViewCosts,
  onSaved,
  onDirtyChange,
}: {
  brandId: string;
  products: Product[];
  variantsByProduct: Record<string, Variant[]>;
  currency: string;
  isAr: boolean;
  canViewCosts: boolean;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const lang = isAr ? "ar" : "en";
  const digits = moneyFractionDigits(currency);
  const axisDefaults = useInventoryAxisDefaults(brandId);
  const allRows = useMemo(
    () => sheetRows({ products, variantsByProduct, axisDefaults, lang, costsKnown: canViewCosts }),
    [products, variantsByProduct, axisDefaults, lang, canViewCosts],
  );
  const rows = useMemo(() => allRows.slice(0, MAX_ROWS), [allRows]);
  const [edits, setEdits] = useState<SheetEdits>(NO_EDITS);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState(false);
  const { save, saving } = useBulkSheetSave(brandId);

  const problems = useMemo(() => sheetProblems(rows, edits), [rows, edits]);
  const changes = useMemo(() => sheetChanges(rows, edits, digits), [rows, edits, digits]);
  const problemCount = Object.keys(problems).length;
  const dirty = changes.length > 0 || problemCount > 0;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  // On a phone the save bar takes the bottom slot, so the dock steps aside instead of covering it.
  useEffect(() => {
    const token = "inventory-sheet";
    if (dirty) claimBottomBar(token);
    else releaseBottomBar(token);
    return () => releaseBottomBar(token);
  }, [dirty]);

  const allChosen = rows.length > 0 && rows.every((row) => chosen.has(row.variantId));
  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runSave = async () => {
    const result = await save(
      sheetSavePlan(changes),
      isAr ? "تعديل جماعي من الجدول: جرد" : "Bulk sheet: count",
    );
    setEdits((current) => editsAfterSave(current, result.failedVariants));
    setReviewing(false);
    onSaved();
    if (result.failedVariants.size === 0 && result.failedProducts === 0) {
      toast.success(
        isAr
          ? `تم الحفظ: ${countOf(result.saved, "change", "ar")}`
          : `Saved ${countOf(result.saved, "change", "en")}`,
      );
    } else {
      toast.error(
        (isAr
          ? `لم يُحفظ بعضها (${countOf(result.failedVariants.size, "size", "ar")}). بقيت في الجدول لتعيد المحاولة.`
          : `Some did not save (${countOf(result.failedVariants.size, "size", "en")}). They are still in the sheet to try again.`) +
          (result.errors[0] ? ` ${result.errors[0]}` : ""),
      );
    }
  };

  if (allRows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {isAr
          ? "لا مقاسات لتعديلها هنا. الخدمات والباقات تُسعَّر في محرريها."
          : "No sizes to edit here. Services and packages are priced in their own editors."}
      </p>
    );
  }

  const fields: SheetField[] = canViewCosts
    ? ["price", "wasPrice", "stock", "cost"]
    : ["price", "wasPrice", "stock"];

  return (
    <section aria-label={isAr ? "جدول التعديل" : "Edit sheet"} className="space-y-3">
      <SheetBulkBar
        chosenCount={chosen.size}
        isAr={isAr}
        onApply={(action) =>
          setEdits((current) => applyBulk(rows, chosen, action, current, digits))
        }
        onClearChosen={() => setChosen(new Set())}
      />
      {allRows.length > MAX_ROWS && (
        <p className="text-xs text-warning">
          {isAr
            ? `يظهر أول ${MAX_ROWS} مقاس من ${allRows.length}. ضيّق القائمة بالبحث أو الفلاتر لترى البقية.`
            : `Showing the first ${MAX_ROWS} of ${allRows.length} sizes. Narrow the list with search or filters to see the rest.`}
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-2 py-2">
                <Checkbox
                  aria-label={isAr ? "اختيار كل الصفوف" : "Choose every row"}
                  checked={allChosen}
                  onCheckedChange={(on) =>
                    setChosen(on ? new Set(rows.map((row) => row.variantId)) : new Set())
                  }
                />
              </th>
              <th className="px-2 py-2 text-start font-medium">{isAr ? "المنتج" : "Product"}</th>
              <th className="px-2 py-2 text-start font-medium">{isAr ? "الخيارات" : "Options"}</th>
              {fields.map((field) => (
                <th key={field} className="px-2 py-2 text-start font-medium">
                  {FIELD_LABELS[field][isAr ? 0 : 1]}
                </th>
              ))}
              <th className="px-2 py-2 text-start font-medium">
                {isAr ? "في المتجر" : "On store"}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const rowProblems = problems[row.variantId] ?? {};
              const visible = edits.visible[row.productId] ?? row.visible;
              return (
                <tr key={row.variantId} className={chosen.has(row.variantId) ? "bg-primary/5" : ""}>
                  <td className="px-2 py-1 align-top">
                    <Checkbox
                      aria-label={`${isAr ? "اختيار" : "Choose"} ${row.productName} · ${row.options}`}
                      checked={chosen.has(row.variantId)}
                      onCheckedChange={() => toggle(row.variantId)}
                    />
                  </td>
                  <td className="max-w-56 px-2 py-1 align-top">
                    {row.firstOfProduct && (
                      <span
                        dir="auto"
                        className="text-page-start line-clamp-2 break-words font-medium"
                      >
                        {row.productName}
                      </span>
                    )}
                    {row.sku && (
                      <span
                        dir="ltr"
                        className="block truncate font-mono text-xs text-muted-foreground"
                      >
                        {row.sku}
                      </span>
                    )}
                  </td>
                  <td className="min-w-32 px-2 py-1 align-top text-xs">{row.options}</td>
                  {fields.map((field) =>
                    field === "stock" && !row.stockEditable ? (
                      <td key={field} className="px-2 py-1 align-top text-xs text-muted-foreground">
                        {isAr ? "حسب الطلب" : "Made to order"}
                      </td>
                    ) : (
                      <SheetCell
                        key={field}
                        row={row}
                        field={field}
                        edits={edits}
                        isAr={isAr}
                        problem={
                          rowProblems[field] ? problemText(rowProblems[field], isAr) : undefined
                        }
                        onChange={(text) =>
                          setEdits((current) => editCell(current, row.variantId, field, text))
                        }
                      />
                    ),
                  )}
                  <td className="px-2 py-1 align-top">
                    {row.firstOfProduct && (
                      <Switch
                        aria-label={`${isAr ? "إظهار في المتجر" : "Show on the store"}: ${row.productName}`}
                        checked={visible}
                        onCheckedChange={(on) =>
                          setEdits((current) => editVisible(current, row.productId, on))
                        }
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {dirty && (
        <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 shadow-lg">
          <span className="text-sm">
            {problemCount > 0
              ? isAr
                ? `صحّح الخانات المعلَّمة: ${countOf(problemCount, "size", "ar")}`
                : `Fix the marked cells: ${countOf(problemCount, "size", "en")}`
              : isAr
                ? `لم يُحفظ بعد: ${countOf(changes.length, "change", "ar")}`
                : `${countOf(changes.length, "change", "en")} not saved yet`}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEdits(NO_EDITS)} disabled={saving}>
              {isAr ? "تجاهل التغييرات" : "Discard changes"}
            </Button>
            <Button
              size="sm"
              onClick={() => setReviewing(true)}
              disabled={saving || problemCount > 0 || changes.length === 0}
            >
              {isAr ? "مراجعة وحفظ" : "Review and save"}
            </Button>
          </div>
        </div>
      )}
      <SheetReviewDialog
        open={reviewing}
        onOpenChange={setReviewing}
        changes={changes}
        currency={currency}
        isAr={isAr}
        saving={saving}
        onSave={runSave}
      />
    </section>
  );
}
