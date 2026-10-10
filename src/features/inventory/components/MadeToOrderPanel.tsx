import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { invalidateCatalog, madeToOrderQueries, setMadeToOrderPaused } from "@/lib/data/catalog";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { MadeToOrderLimitField } from "@/features/inventory/components/MadeToOrderLimitField";
import { parseMadeToOrderLimit } from "@/features/inventory/lib/made-to-order-limit";
import { madeToOrderMovementLine } from "@/features/inventory/lib/sale-mode";
import type { Product } from "@/features/inventory/types";

type PanelProduct = Pick<Product, "id" | "made_to_order_available" | "made_to_order_paused_at">;

/**
 * Everything about making a product to order, in one place: how many can still be made, a
 * pause, and the record of every change. A saved product saves each of them on its own, at
 * once, through the database's own setters; a new product only chooses its first limit here
 * (it is set when the product is saved).
 */
export function MadeToOrderPanel({
  brandId,
  product,
  isAr,
  draftLimit,
  onDraftLimit,
}: {
  brandId: string;
  /** The product being edited (null while a new one is created). */
  product: PanelProduct | null;
  isAr: boolean;
  /** A new product's first limit, as typed (empty: no limit). */
  draftLimit: string;
  onDraftLimit: (text: string) => void;
}) {
  if (!product) {
    const parsed = parseMadeToOrderLimit(draftLimit);
    return (
      <div className="space-y-2 rounded-lg border border-border bg-background p-3">
        <Label htmlFor="made-to-order-first-limit" className="text-xs font-semibold">
          {isAr ? "كم قطعة يمكن صنعها حسب الطلب؟" : "How many can be made to order?"}
        </Label>
        <Input
          id="made-to-order-first-limit"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          dir="ltr"
          className="h-9 w-28 text-xs font-mono"
          placeholder={isAr ? "بلا حد" : "No limit"}
          value={draftLimit}
          onChange={(event) => onDraftLimit(event.target.value)}
        />
        {parsed.ok ? (
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "اتركها فارغة لعدم التحديد. ينقص العدد مع كل طلب ويعود عند إلغاء الطلب."
              : "Leave it empty for no limit. The number goes down with each order and comes back when an order is cancelled."}
          </p>
        ) : (
          <p className="text-xs font-semibold text-destructive" role="alert">
            {parsed.error[isAr ? "ar" : "en"]}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <MadeToOrderLimitField
        brandId={brandId}
        productId={product.id}
        available={product.made_to_order_available}
        isAr={isAr}
      />
      <PauseSwitch brandId={brandId} product={product} isAr={isAr} />
      <History brandId={brandId} productId={product.id} isAr={isAr} />
    </div>
  );
}

function PauseSwitch({
  brandId,
  product,
  isAr,
}: {
  brandId: string;
  product: PanelProduct;
  isAr: boolean;
}) {
  const qc = useQueryClient();
  const [paused, setPaused] = useState(Boolean(product.made_to_order_paused_at));
  useEffect(
    () => setPaused(Boolean(product.made_to_order_paused_at)),
    [product.made_to_order_paused_at],
  );
  const toggle = useMutation({
    mutationFn: (next: boolean) => setMadeToOrderPaused(product.id, next),
    onSuccess: (_result, next) => {
      setPaused(next);
      toast.success(
        next
          ? isAr
            ? "تم إيقاف الطلب حسب الطلب مؤقتاً"
            : "Made to order paused"
          : isAr
            ? "تم استئناف الطلب حسب الطلب"
            : "Made to order resumed",
      );
      void invalidateCatalog(qc, brandId);
    },
    onError: (error) => toast.error(getFriendlyErrorMessage(error)),
  });
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-background p-3">
      <div>
        <Label htmlFor="made-to-order-paused" className="text-xs font-semibold">
          {isAr ? "إيقاف مؤقت" : "Pause"}
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {isAr
            ? "العملاء لا يستطيعون طلبها حسب الطلب أثناء الإيقاف. العدد يبقى كما هو، والطلبات السابقة وطلباتك من لوحة الإدارة لا تتأثر."
            : "Shoppers cannot order it made to order while paused. The number stays as it is; earlier orders and orders you make in the admin are not affected."}
        </p>
      </div>
      <Switch
        id="made-to-order-paused"
        checked={paused}
        disabled={toggle.isPending}
        onCheckedChange={(next) => toggle.mutate(next)}
      />
    </div>
  );
}

function History({
  brandId,
  productId,
  isAr,
}: {
  brandId: string;
  productId: string;
  isAr: boolean;
}) {
  const rows = useQuery(madeToOrderQueries.history(brandId, productId)).data ?? [];
  if (rows.length === 0) return null;
  const lang = isAr ? "ar" : "en";
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-xs font-semibold text-foreground">{isAr ? "السجل" : "Record"}</p>
      <ul className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <li key={row.id} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 text-muted-foreground">
              {madeToOrderMovementLine(
                {
                  reason: row.reason,
                  available_before: row.available_before,
                  available_after: row.available_after,
                  invoiceNumber: row.orders?.invoice_number ?? null,
                },
                lang,
              )}
            </span>
            <time
              className="shrink-0 font-mono text-muted-foreground"
              dateTime={row.created_at}
              dir="ltr"
            >
              {new Date(row.created_at).toLocaleDateString(isAr ? "ar" : "en-GB", {
                day: "numeric",
                month: "short",
              })}
            </time>
          </li>
        ))}
      </ul>
    </div>
  );
}
