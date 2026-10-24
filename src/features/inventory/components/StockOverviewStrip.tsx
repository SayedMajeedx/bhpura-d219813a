import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatMoney } from "@/lib/format";
import { MAX_LOW_STOCK_UNITS } from "@/lib/inventory-health";
import type { StockTotals } from "@/features/inventory/lib/stock-totals";
import { arNoun } from "@/lib/arabic-count";

/**
 * What the stock adds up to, above the list: pieces in the store and at partners, their worth at
 * the selling price and (for those who may see costs) at cost, and the store's own low-stock
 * level, which a member who may change settings sets here.
 */
export function StockOverviewStrip({
  totals,
  currency,
  lang,
  showCost,
  showPartners,
  lowStockUnits,
  canEditLevel,
  onSaveLevel,
}: {
  totals: StockTotals;
  currency: string;
  lang: "ar" | "en";
  showCost: boolean;
  showPartners: boolean;
  lowStockUnits: number;
  canEditLevel: boolean;
  /** Saves the level; resolves false when it was refused. */
  onSaveLevel: (level: number) => Promise<boolean>;
}) {
  const isAr = lang === "ar";
  const number = (value: number) => value.toLocaleString(isAr ? "ar-u-nu-latn" : "en");

  return (
    // On a phone the figures are one row that scrolls sideways: wrapped, they took 253px above the
    // first product (it started at 755px of an 812px screen).
    <section
      aria-label={isAr ? "ملخص المخزون" : "Stock summary"}
      className="scrollbar-none -mx-1 flex snap-x gap-2 overflow-x-auto px-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
    >
      <Tile
        label={isAr ? "قطع في المحل" : "Pieces in store"}
        value={number(totals.storePieces)}
        hint={
          isAr
            ? `في ${arNoun(totals.productsInStock, "product")}`
            : `across ${number(totals.productsInStock)} products`
        }
      />
      {showPartners && (
        <Tile
          label={isAr ? "قطع عند محلات الشركاء" : "Pieces at partners"}
          value={number(totals.partnerPieces)}
        />
      )}
      <Tile
        label={isAr ? "قيمة المخزون بسعر البيع" : "Stock value at selling price"}
        value={formatMoney(totals.retailValue, currency, lang)}
      />
      {showCost && (
        <Tile
          label={isAr ? "قيمة المخزون بالتكلفة" : "Stock value at cost"}
          value={formatMoney(totals.costValue, currency, lang)}
          hint={
            totals.piecesWithoutCost > 0
              ? isAr
                ? `${arNoun(totals.piecesWithoutCost, "piece")} بلا تكلفة مسجلة`
                : `${number(totals.piecesWithoutCost)} pieces have no cost entered`
              : undefined
          }
        />
      )}
      <LowStockLevelTile
        isAr={isAr}
        level={lowStockUnits}
        canEdit={canEditLevel}
        onSave={onSaveLevel}
      />
    </section>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="w-40 min-w-0 shrink-0 snap-start rounded-xl border border-border-subtle bg-card p-3 shadow-2xs sm:w-auto sm:flex-1 sm:shrink sm:basis-36">
      <p className="break-words text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-mono text-sm font-extrabold text-foreground">{value}</p>
      {hint && <p className="mt-0.5 break-words text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function LowStockLevelTile({
  isAr,
  level,
  canEdit,
  onSave,
}: {
  isAr: boolean;
  level: number;
  canEdit: boolean;
  onSave: (level: number) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(level));
  const [saving, setSaving] = useState(false);

  const typed = Number(draft);
  const valid =
    draft.trim() !== "" && Number.isInteger(typed) && typed >= 0 && typed <= MAX_LOW_STOCK_UNITS;

  const save = async () => {
    if (!valid || saving) return;
    if (typed === level) return setOpen(false);
    setSaving(true);
    const saved = await onSave(typed);
    setSaving(false);
    if (saved) setOpen(false);
  };

  const says =
    level === 0
      ? isAr
        ? "متوقف"
        : "Off"
      : isAr
        ? `${arNoun(level, "piece")} أو أقل`
        : `${level} or fewer`;

  return (
    <div className="w-40 min-w-0 shrink-0 snap-start rounded-xl border border-border-subtle bg-card p-3 shadow-2xs sm:w-auto sm:flex-1 sm:shrink sm:basis-36">
      <p className="break-words text-xs font-medium text-muted-foreground">
        {isAr ? "تنبيه المخزون المنخفض عند" : "Low stock warning at"}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <p className="break-words font-mono text-sm font-extrabold text-foreground">{says}</p>
        {canEdit && (
          <Popover
            open={open}
            onOpenChange={(next) => {
              if (next) setDraft(String(level));
              if (!saving) setOpen(next);
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground"
                aria-label={isAr ? "تغيير حد المخزون المنخفض" : "Change the low stock level"}
              >
                <Pencil className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="low-stock-level" className="text-xs">
                  {isAr
                    ? "المنتج «منخفض» عند هذا العدد من القطع أو أقل"
                    : "A product is low at this many pieces or fewer"}
                </Label>
                <Input
                  id="low-stock-level"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_LOW_STOCK_UNITS}
                  step={1}
                  dir="ltr"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void save();
                  }}
                  className="h-9 font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? "يُحسب على مجموع قطع المنتج. يسري على هذه القائمة ولوحة التحكم والتقارير وتنبيه الجوال. صفر يوقف التنبيه."
                    : "Counted on a product's pieces in total. It applies to this list, the dashboard, reports and the phone alert. 0 turns the warning off."}
                </p>
                {!valid && (
                  <p className="text-xs text-destructive">
                    {isAr
                      ? `اكتب عدداً صحيحاً من 0 إلى ${MAX_LOW_STOCK_UNITS}.`
                      : `Enter a whole number from 0 to ${MAX_LOW_STOCK_UNITS}.`}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => setOpen(false)}
                >
                  {isAr ? "إلغاء" : "Cancel"}
                </Button>
                <Button size="sm" disabled={!valid || saving} onClick={() => void save()}>
                  {saving && <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />}
                  {isAr ? "حفظ" : "Save"}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
