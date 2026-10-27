import { useStorefront, formatPrice } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { OsEmptyState } from "@/components/os/os-empty-state";
import { Loader2, RotateCcw } from "lucide-react";
import { RETURN_STATUS_CONFIG, type ReturnStatus } from "@/lib/returns.types";
import { orderNumberLabel } from "@/lib/order-number";

export function CustomerReturnsSection({
  currency,
  isAr,
  lang,
  returns,
  isLoading,
}: {
  currency: string;
  isAr: boolean;
  lang: "ar" | "en";
  returns?: any[];
  isLoading: boolean;
}) {
  const { t, settings } = useStorefront();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!returns || returns.length === 0) {
    return (
      <OsEmptyState
        icon={RotateCcw}
        title={t("لا توجد طلبات إرجاع سابقة", "No return requests")}
        description={t(
          "لم تقم بتقديم أي طلبات إرجاع أو استبدال حتى الآن. يمكنك تقديم طلب إرجاع من تبويب طلباتي لأي طلب مؤهل.",
          "You haven't requested any returns or exchanges yet.",
        )}
      />
    );
  }

  return (
    <div className="space-y-4">
      {returns.map((r) => {
        const statusCfg =
          RETURN_STATUS_CONFIG[r.status as ReturnStatus] || RETURN_STATUS_CONFIG.new;
        const date = new Date(r.created_at).toLocaleDateString(isAr ? "ar-BH-u-nu-latn" : "en-BH", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });

        return (
          <Card key={r.id} className="p-5 border border-border-strong rounded-xl bg-card space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sm text-foreground">
                    {r.return_number}
                  </span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${statusCfg.badgeClass}`}
                  >
                    {isAr ? statusCfg.labelAr : statusCfg.labelEn}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-muted text-foreground border border-border">
                    {r.type === "exchange"
                      ? isAr
                        ? "استبدال"
                        : "Exchange"
                      : isAr
                        ? "إرجاع واسترداد"
                        : "Return"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isAr ? "مرتبط بالفاتورة:" : "Linked to Invoice:"}{" "}
                  {orderNumberLabel(r.order?.invoice_number, settings)} • {date}
                </p>
              </div>

              <div className="text-end">
                <span className="text-xs uppercase font-bold tracking-widest text-muted-foreground block">
                  {isAr ? "صافي الاسترداد" : "Net Refund"}
                </span>
                <span className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {formatPrice(Number(r.net_refund_amount || 0), currency, lang)}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/30 border border-border-subtle text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{isAr ? "السبب:" : "Reason:"} </span>
              {r.reason}
            </div>

            {r.items && r.items.length > 0 && (
              <div className="pt-2 border-t border-border-subtle space-y-1 text-xs">
                <span className="text-xs font-semibold text-muted-foreground">
                  {isAr ? "المنتجات المطلوب إرجاعها:" : "Returned items:"}
                </span>
                <ul className="divide-y divide-border/30">
                  {r.items.map((it: any) => (
                    <li key={it.id} className="py-1.5 flex justify-between items-center">
                      <span className="font-medium text-foreground">
                        {it.product?.name_ar || it.product?.name_en || "Item"}{" "}
                        <span className="font-mono text-muted-foreground">× {it.quantity}</span>
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {formatPrice(Number(it.unit_price) * it.quantity, currency, lang)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
