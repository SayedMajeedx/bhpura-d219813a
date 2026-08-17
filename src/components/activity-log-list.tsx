import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { History, ChevronDown, ChevronUp } from "lucide-react";
import { useI18n, useT } from "@/lib/i18n";
import type { ActivityLog } from "@/lib/activity-log";
import { sanitizeActivityLogMessage } from "@/lib/status-labels";
import { Badge } from "@/components/ui/badge";

type Props = {
  orderId?: string;
  productId?: string;
  variantIds?: string[];
  scope?: "order" | "product" | "inventory";
  limit?: number;
  brandId?: string;
  defaultOpen?: boolean;
};

export function ActivityLogList({
  orderId,
  productId,
  variantIds,
  scope = "order",
  limit = 50,
  brandId,
  defaultOpen = false,
}: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const t = useT();
  const { lang } = useI18n();
  const locale = lang === "ar" ? "ar-BH-u-nu-latn" : "en-US";

  const q = useQuery({
    queryKey: ["activity_logs", { orderId, productId, variantIds, scope, limit, brandId }],
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      let query: any = (supabase.from("activity_logs") as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (brandId) query = query.eq("brand_id", brandId);
      if (orderId) query = query.eq("order_id", orderId);
      else if (productId) query = query.eq("product_id", productId);
      else if (scope === "inventory") {
        query = query.in("action", [
          "stock_change",
          "stock_manual",
          "variant_create",
          "variant_delete",
          "product_create",
          "product_update",
          "product_delete",
        ]);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ActivityLog[];
    },
  });

  const logs = q.data ?? [];

  return (
    <Card className="p-4 sm:p-5 transition-all">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between min-h-[44px] py-1 text-start rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2.5">
          <History className="h-4 w-4 text-primary shrink-0" />
          <h2 className="text-base sm:text-lg font-display font-medium text-foreground">
            {t("activity.title")}
          </h2>
          {logs.length > 0 && (
            <Badge variant="secondary" className="text-xs px-2 py-0.5 font-sans rounded-full">
              {logs.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
          <span>
            {isOpen ? (lang === "ar" ? "إخفاء" : "Hide") : lang === "ar" ? "عرض" : "Show"}
          </span>
          {isOpen ? (
            <ChevronUp className="h-4 w-4 shrink-0 transition-transform" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 transition-transform" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="mt-4 pt-4 border-t border-border">
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("activity.empty")}</p>
          ) : (
            <ol className="relative border-s border-border ms-2 space-y-4">
              {logs.map((l) => {
                const rawMsg = lang === "ar" ? l.message_ar : l.message_en;
                const displayMsg = sanitizeActivityLogMessage(rawMsg, lang);
                return (
                  <li key={l.id} className="ms-4">
                    <span className="absolute -start-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary" />
                    <p className="text-sm font-medium text-foreground">{displayMsg}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(l.created_at).toLocaleString(locale)}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </Card>
  );
}
