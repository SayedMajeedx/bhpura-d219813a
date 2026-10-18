import { Pencil, RotateCcw, Search, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListPagination } from "@/components/list-pagination";
import { InlineCodeEditor, useSaveIncubatorCode } from "@/components/incubators/InlineCodeEditor";
import type { IncubatorsPageState } from "@/features/incubators/hooks/use-incubators-page";
import { pieceName } from "@/features/incubators/lib/partner-stock";
import { commissionTerms } from "@/features/incubators/lib/summary";
import type { StockItem } from "@/features/incubators/types";

/**
 * What the partner holds: a table on a wide screen, a card per piece on a phone (a six-column
 * table does not fit one). Each piece shows its code at the partner, the agreed price and
 * commission, and the three things done with it: change the terms, bring it back, record a sale.
 */
export function IncubatorStockTab({ page }: { page: IncubatorsPageState }) {
  const {
    brand,
    filteredStock,
    includeZeroStock,
    isAr,
    lang,
    money,
    openDialog,
    pagedStock,
    search,
    setIncludeZeroStock,
    setSearch,
    setStockPaging,
    stockPaging,
    summary,
  } = page;
  const saveExternalCode = useSaveIncubatorCode(brand.id);

  const actions = (item: StockItem) => {
    const empty = Number(item.quantity) <= 0;
    return (
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => openDialog("edit_item", item)}>
          <Pencil className="me-1 h-3.5 w-3.5" />
          {isAr ? "الشروط" : "Terms"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={empty}
          onClick={() => openDialog("return", item)}
        >
          <RotateCcw className="me-1 h-3.5 w-3.5" />
          {isAr ? "إرجاع" : "Return"}
        </Button>
        <Button size="sm" disabled={empty} onClick={() => openDialog("sale", item)}>
          <ShoppingBag className="me-1 h-3.5 w-3.5" />
          {isAr ? "مباعة" : "Sold"}
        </Button>
      </div>
    );
  };
  const quantity = (item: StockItem) =>
    Number(item.quantity) <= 0 ? (
      <span className="inline-flex items-center rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-bold text-destructive">
        {isAr ? "نافد" : "0"}
      </span>
    ) : (
      item.quantity
    );
  const terms = (item: StockItem) =>
    `${money(Number(item.consignment_price))} · ${commissionTerms(item, money, lang)}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="ps-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={
              isAr
                ? "ابحث بكودنا أو كود الحاضنة أو اسم المنتج"
                : "Search by SKU, external code, or product"
            }
            placeholder={
              isAr
                ? "ابحث بكودنا أو كود الحاضنة أو اسم المنتج"
                : "Search by SKU, external code, or product"
            }
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex cursor-pointer select-none items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <input
              type="checkbox"
              checked={includeZeroStock}
              onChange={(event) => setIncludeZeroStock(event.target.checked)}
              className="h-4 w-4 rounded border-input text-primary accent-primary focus:ring-primary"
            />
            <span>{isAr ? "إظهار الأصناف المنتهية (0 كمية)" : "Show out of stock (0 qty)"}</span>
          </label>
          <span className="rounded-md bg-muted px-2.5 py-1 font-mono text-xs font-semibold text-foreground">
            {filteredStock.length} {isAr ? "صنف" : "variants"} ({summary.units}{" "}
            {isAr ? "قطعة متوفرة" : "available units"})
          </span>
        </div>
      </div>

      {filteredStock.length === 0 && (
        <p className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {isAr ? "لا توجد بضاعة عند هذه الحاضنة" : "No stock at this incubator"}
        </p>
      )}

      {/* Phones: one card per piece. */}
      <ul className="space-y-3 sm:hidden" hidden={filteredStock.length === 0}>
        {pagedStock.map((item) => (
          <li
            key={item.id}
            className={`rounded-xl border border-border bg-card p-3 ${Number(item.quantity) <= 0 ? "opacity-70" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-bold" dir="auto">
                  {pieceName(item.product_variants, lang)}
                </p>
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {item.product_variants?.sku || item.product_variants?.barcode || "—"}
                </p>
              </div>
              <p className="shrink-0 text-end text-lg font-black">{quantity(item)}</p>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">{isAr ? "كود الحاضنة" : "External code"}</dt>
                <dd className="mt-0.5">
                  <InlineCodeEditor
                    value={item.external_code || ""}
                    isAr={isAr}
                    onSave={(value) => saveExternalCode(item, value)}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {isAr ? "السعر والعمولة" : "Price & terms"}
                </dt>
                <dd className="mt-0.5 break-words font-semibold">{terms(item)}</dd>
              </div>
            </dl>
            <div className="mt-3">{actions(item)}</div>
          </li>
        ))}
      </ul>

      {/* Wider screens: the table. */}
      <div
        className={
          filteredStock.length === 0
            ? "hidden"
            : "hidden overflow-x-auto rounded-md border border-border bg-card sm:block"
        }
      >
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="p-3 text-start">{isAr ? "المنتج" : "Product"}</th>
              <th className="p-3 text-start">{isAr ? "كودنا" : "SKU"}</th>
              <th className="p-3 text-start">{isAr ? "كود الحاضنة" : "External code"}</th>
              <th className="p-3 text-center">{isAr ? "الكمية" : "Qty"}</th>
              <th className="p-3 text-end">{isAr ? "السعر والعمولة" : "Price & terms"}</th>
              <th className="p-3 text-end">{isAr ? "القيمة" : "Value"}</th>
              <th className="p-3 text-end">{isAr ? "إجراء" : "Action"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pagedStock.map((item) => (
              <tr
                key={item.id}
                className={Number(item.quantity) <= 0 ? "bg-muted/20 opacity-60" : ""}
              >
                <td className="p-3 font-medium" dir="auto">
                  {pieceName(item.product_variants, lang)}
                </td>
                <td className="p-3 font-mono text-xs">
                  {item.product_variants?.sku || item.product_variants?.barcode || "—"}
                </td>
                <td className="p-2">
                  <InlineCodeEditor
                    value={item.external_code || ""}
                    isAr={isAr}
                    onSave={(value) => saveExternalCode(item, value)}
                  />
                </td>
                <td className="p-3 text-center font-bold">{quantity(item)}</td>
                <td className="p-3 text-end text-xs">{terms(item)}</td>
                <td className="p-3 text-end">
                  {money(Number(item.quantity) * Number(item.consignment_price))}
                </td>
                <td className="p-3">{actions(item)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ListPagination
        lang={lang}
        entityAr="صنف / متغير"
        entityEn="Variants"
        totalItems={filteredStock.length}
        page={stockPaging.page}
        pageSize={stockPaging.size}
        onPageChange={(next) => setStockPaging({ ...stockPaging, page: next })}
        onPageSizeChange={(size) => setStockPaging({ page: 1, size })}
      />
    </div>
  );
}
