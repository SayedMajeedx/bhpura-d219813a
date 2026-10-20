import { useMemo, useState } from "react";
import { ListPlus, Package } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { formatMoney } from "@/lib/format";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { saveProductCost } from "@/lib/data/catalog";
import { CostPartsEditor } from "@/features/inventory/components/CostPartsEditor";
import { SUGGESTED_PARTS, margin, partKey } from "@/features/inventory/lib/cost-parts";
import {
  costsToSave,
  entryCost,
  missingCostProducts,
  type CostEntry,
  type MissingCostProduct,
} from "@/features/inventory/lib/missing-costs";

/**
 * Every product with no cost, on one sheet: type each one's cost (or its parts) down the list
 * and save them in one press. Made-to-order pieces come first: with no stock to count, nothing
 * else reminds anyone that each sale's profit is counted as its whole price.
 */
export function MissingCostsDialog<P extends MissingCostProduct>({
  open,
  onOpenChange,
  products,
  variantsByProduct,
  lowestPrice,
  brandId,
  currency,
  isAr,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: readonly P[];
  variantsByProduct: Readonly<Record<string, ReadonlyArray<{ cost_price?: number | null }>>>;
  lowestPrice: (productId: string) => number;
  brandId: string;
  currency: string;
  isAr: boolean;
  onSaved: () => void;
}) {
  const lang = isAr ? "ar" : "en";
  const [entries, setEntries] = useState<Record<string, CostEntry>>({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const rows = useMemo(
    () => missingCostProducts(products, variantsByProduct, lang),
    [products, variantsByProduct, lang],
  );
  const { save, invalid } = costsToSave(entries);
  const bad = new Set([...invalid, ...failed]);
  const money = (n: number) => formatMoney(n, currency, lang);
  const nameOf = (p: P) =>
    (isAr ? p.name_ar || p.name || p.name_en : p.name_en || p.name || p.name_ar) || "";

  const setEntry = (id: string, entry: CostEntry) => {
    setEntries((current) => ({ ...current, [id]: entry }));
    setFailed((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  const saveAll = async () => {
    if (save.length === 0 || invalid.length > 0) return;
    setSaving(true);
    const notSaved = new Set<string>();
    let lastError: unknown = null;
    for (const item of save) {
      try {
        await saveProductCost(brandId, item.productId, item.cost);
      } catch (error) {
        notSaved.add(item.productId);
        lastError = error;
      }
    }
    setSaving(false);
    setFailed(notSaved);
    // What was saved leaves the sheet (it is no longer missing a cost); what failed stays typed.
    setEntries((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => notSaved.has(id))),
    );
    onSaved();
    const done = save.length - notSaved.size;
    if (done > 0) {
      toast.success(
        isAr
          ? `حُفظت التكاليف (${done})`
          : `Saved the cost of ${done} ${done === 1 ? "product" : "products"}`,
      );
    }
    if (notSaved.size > 0) {
      toast.error(
        isAr
          ? `تعذر حفظ ${notSaved.size} منها. أعد المحاولة.`
          : `${notSaved.size} could not be saved. Try again.`,
        { description: getFriendlyErrorMessage(lastError) },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="flex max-h-[92dvh] max-w-2xl flex-col gap-3 overflow-hidden"
      >
        <DialogHeader>
          <DialogTitle>{isAr ? "منتجات بلا تكلفة" : "Products with no cost"}</DialogTitle>
          <DialogDescription>
            {isAr
              ? "اكتب تكلفة القطعة لكل منتج، أو قسّمها إلى أجزاء، ثم احفظ مرة واحدة. بدونها يُحسب سعر البيع كله ربحاً."
              : "Type what a piece of each costs you, or break it into parts, then save once. Without it, the whole price counts as profit."}
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <p className="rounded-lg bg-success-subtle p-4 text-center text-sm text-success">
            {isAr ? "كل منتجاتك لها تكلفة." : "Every product has a cost."}
          </p>
        ) : (
          <ul className="-mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1">
            {rows.map((product) => {
              const entry = entries[product.id] ?? { amount: "", parts: null };
              const cost = entryCost(entry);
              const price = lowestPrice(product.id);
              const left = cost !== null ? margin(price, cost) : null;
              const name = nameOf(product);
              return (
                <li
                  key={product.id}
                  className={
                    bad.has(product.id)
                      ? "rounded-lg border border-destructive/60 p-2.5"
                      : "rounded-lg border border-border-subtle p-2.5"
                  }
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt=""
                        loading="lazy"
                        className="h-11 w-11 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-muted">
                        <Package className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        dir="auto"
                        className="text-page-start line-clamp-2 break-words text-sm font-semibold"
                      >
                        {name}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {product.is_made_to_order && (
                          <Badge variant="outline" className="text-xs font-normal">
                            {isAr ? "حسب الطلب" : "Made to order"}
                          </Badge>
                        )}
                        {price > 0 && (
                          <span className="tabular-nums">
                            {isAr ? "السعر " : "Price "}
                            {money(price)}
                          </span>
                        )}
                        {left && (
                          <span
                            className={
                              left.amount < 0
                                ? "font-semibold text-destructive tabular-nums"
                                : "font-semibold text-success tabular-nums"
                            }
                          >
                            {isAr ? "الربح " : "Profit "}
                            {money(left.amount)} ({left.percent}%)
                          </span>
                        )}
                      </p>
                    </div>
                    {!entry.parts && (
                      <div className="flex shrink-0 items-center gap-1">
                        <Input
                          aria-label={isAr ? `تكلفة ${name}` : `Cost of ${name}`}
                          inputMode="decimal"
                          value={entry.amount}
                          placeholder="0.000"
                          onChange={(e) =>
                            setEntry(product.id, { amount: e.target.value, parts: null })
                          }
                          className="w-24 font-mono tabular-nums"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={
                            isAr
                              ? `قسّم تكلفة ${name} إلى أجزاء`
                              : `Break the cost of ${name} into parts`
                          }
                          onClick={() =>
                            setEntry(product.id, {
                              amount: entry.amount,
                              parts: SUGGESTED_PARTS.slice(0, 2).map((part, i) => ({
                                key: partKey(),
                                label: isAr ? part.ar : part.en,
                                amount: i === 0 ? entry.amount : "",
                              })),
                            })
                          }
                        >
                          <ListPlus className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {entry.parts && (
                    <div className="mt-2">
                      <CostPartsEditor
                        parts={entry.parts}
                        currency={currency}
                        isAr={isAr}
                        onChange={(parts) =>
                          setEntry(product.id, {
                            amount: parts ? entry.amount : String(cost ?? ""),
                            parts,
                          })
                        }
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter className="gap-2 border-t border-border-subtle pt-3">
          {invalid.length > 0 && (
            <p className="me-auto self-center text-xs text-destructive">
              {isAr ? "صحّح المبالغ المعلّمة قبل الحفظ." : "Fix the marked amounts before saving."}
            </p>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {isAr ? "إغلاق" : "Close"}
          </Button>
          <Button
            type="button"
            onClick={saveAll}
            disabled={saving || save.length === 0 || invalid.length > 0}
          >
            {isAr
              ? save.length > 0
                ? `حفظ التكاليف (${save.length})`
                : "حفظ"
              : save.length > 0
                ? `Save ${save.length} ${save.length === 1 ? "cost" : "costs"}`
                : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
