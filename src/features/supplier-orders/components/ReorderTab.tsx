import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBrand } from "@/lib/brand-context";
import { countOf } from "@/lib/arabic-count";
import { MAX_PIECES } from "../lib/order-form";
import { COVER_DAYS, REORDER_HORIZON_DAYS, reorderParam, type ReorderLine } from "../lib/reorder";
import type { SupplierCatalog } from "../hooks/use-supplier-catalog";

/**
 * The sizes that run out within three weeks at the rate they sell, after what is already on its
 * way, the soonest first, each with the pieces that would cover the next six weeks. Tick sizes
 * and a new supplier order opens with them; the pieces can be changed first.
 */
export function ReorderTab({
  lines,
  catalog,
  isLoading,
  lang,
}: {
  lines: ReorderLine[];
  catalog: SupplierCatalog;
  isLoading: boolean;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const brand = useBrand();
  const navigate = useNavigate();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pieces, setPieces] = useState<Record<string, string>>({});

  const chosen = useMemo(
    () =>
      lines
        .filter((line) => picked.has(line.variantId))
        .map((line) => ({
          variantId: line.variantId,
          quantity: Math.min(
            MAX_PIECES,
            Math.max(0, Math.floor(Number(pieces[line.variantId] ?? line.suggested) || 0)),
          ),
        }))
        .filter((line) => line.quantity > 0),
    [lines, picked, pieces],
  );

  if (isLoading) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        {isAr ? "جارٍ التحميل…" : "Loading…"}
      </Card>
    );
  }
  if (lines.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        {isAr
          ? `لا مقاس يوشك أن ينفد خلال ${REORDER_HORIZON_DAYS} يومًا بحسب مبيعاته.`
          : `No size is set to run out within ${REORDER_HORIZON_DAYS} days at the rate it sells.`}
      </Card>
    );
  }

  const toggle = (id: string, on: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const allPicked = picked.size === lines.length;
  const draft = () =>
    navigate({
      to: "/admin/b/$slug/supplier-orders/$id",
      params: { slug: brand.slug, id: "new" },
      search: { reorder: reorderParam(chosen) },
    });
  const week = (perDay: number) => Math.round(perDay * 7 * 10) / 10;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {isAr
          ? `بحسب مبيعات آخر 45 يومًا وما في الطريق من الموردين. الكمية المقترحة تكفي ${COVER_DAYS} يومًا.`
          : `From the last 45 days' sales and what is on its way from suppliers. The suggested pieces last ${COVER_DAYS} days.`}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={allPicked}
            onChange={(e) =>
              setPicked(e.target.checked ? new Set(lines.map((l) => l.variantId)) : new Set())
            }
          />
          {isAr ? "تحديد الكل" : "Select all"}
        </label>
        <Button type="button" className="gap-2" disabled={chosen.length === 0} onClick={draft}>
          <PackagePlus className="size-4" aria-hidden />
          {isAr
            ? `طلبية جديدة بهذه المقاسات (${chosen.length})`
            : `New order with these sizes (${chosen.length})`}
        </Button>
      </div>
      <ul className="space-y-2">
        {lines.map((line) => {
          const name = `${catalog.productName(line.productId)} · ${catalog.sizeName(line.variantId)}`;
          const inputId = `reorder-${line.variantId}`;
          return (
            <li
              key={line.variantId}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-card p-3"
            >
              <input
                type="checkbox"
                className="size-4"
                aria-label={name}
                checked={picked.has(line.variantId)}
                onChange={(e) => toggle(line.variantId, e.target.checked)}
              />
              <div className="min-w-0 space-y-0.5">
                <p className="line-clamp-2 break-words text-sm font-semibold" dir="auto">
                  {name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {line.daysLeft <= 0
                    ? isAr
                      ? "نفد الآن"
                      : "Out now"
                    : isAr
                      ? `ينفد خلال ${countOf(line.daysLeft, "day", "ar")}`
                      : `Runs out in ${countOf(line.daysLeft, "day", "en")}`}
                  {" · "}
                  {isAr
                    ? `يُباع نحو ${week(line.perDay)} في الأسبوع`
                    : `sells ~${week(line.perDay)} a week`}
                  {" · "}
                  {isAr ? `لديك ${line.onHand}` : `${line.onHand} on hand`}
                  {line.onOrder > 0 &&
                    (isAr ? `، ${line.onOrder} في الطريق` : `, ${line.onOrder} coming`)}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <label htmlFor={inputId} className="sr-only">
                  {isAr ? `القطع المطلوبة من ${name}` : `Pieces to order of ${name}`}
                </label>
                <Input
                  id={inputId}
                  inputMode="numeric"
                  className="h-9 w-20 text-center font-mono"
                  value={pieces[line.variantId] ?? String(line.suggested)}
                  onChange={(e) =>
                    setPieces((current) => ({ ...current, [line.variantId]: e.target.value }))
                  }
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
