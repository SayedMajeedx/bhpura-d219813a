import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { ShoppingCart, TrendingUp, Sparkles, MessageSquare } from "lucide-react";
import { AbandonedCartsCommandHeader } from "@/components/abandoned-carts/AbandonedCartsCommandHeader";
import { AbandonedCartsList } from "@/components/abandoned-carts/AbandonedCartsList";
import { AbandonedCartSettingsDialog } from "@/components/abandoned-carts/AbandonedCartSettingsDialog";
import { abandonedCartsQueries } from "@/lib/data/abandoned-carts";
import { useStoreCurrency } from "@/hooks/use-store-currency";
import { formatMoney } from "@/lib/format";
import { recoverySummary, storeRecoveryCode } from "@/lib/abandoned-cart-recovery";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/abandoned-carts")({
  component: AbandonedCartsDashboardPage,
});

/** The figures cover carts left in the last 30 days. */
const PERIOD_DAYS = 30;

function AbandonedCartsDashboardPage() {
  const brand = useBrand();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const currency = useStoreCurrency(brand.id);
  const money = (amount: number) => formatMoney(amount, currency, lang);

  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: settings } = useQuery(abandonedCartsQueries.settings(brand.id));
  const {
    data: carts = [],
    isLoading: loadingCarts,
    refetch: refetchCarts,
  } = useQuery({
    ...abandonedCartsQueries.carts(brand.id),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });

  // The day is fixed while the page is open, so the figures do not move under the reader.
  const [now] = useState(() => new Date());
  const summary = useMemo(() => recoverySummary(carts, now, PERIOD_DAYS), [carts, now]);
  const recoveryCode = storeRecoveryCode(settings);

  const cards = [
    {
      title: isAr ? "سلات متروكة (30 يوماً)" : "Carts left (30 days)",
      value: String(summary.left),
      note: isAr ? `بقيمة ${money(summary.leftValue)}` : `Worth ${money(summary.leftValue)}`,
      icon: ShoppingCart,
      tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    {
      title: isAr ? "عادت وصارت طلبات" : "Came back and ordered",
      value: money(summary.recoveredValue),
      note: isAr ? `${summary.recovered} من السلات` : `${summary.recovered} of those carts`,
      icon: TrendingUp,
      tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      title: isAr ? "نسبة الاستعادة" : "Recovery rate",
      value: `${summary.rate}%`,
      note: isAr
        ? "من السلات المتروكة، لا كل الطلبات"
        : "Of the carts that were left, not of every order",
      icon: Sparkles,
      tone: "bg-primary/10 text-primary",
    },
    {
      title: isAr ? "يمكن مراسلتها" : "Can be messaged",
      value: String(summary.reachable),
      note: isAr
        ? `${summary.unreachable} بلا موافقة أو رقم`
        : `${summary.unreachable} without consent or a number`,
      icon: MessageSquare,
      tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <AbandonedCartsCommandHeader
        isEnabled={settings?.is_enabled ?? true}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {cards.map((card) => (
          <Card key={card.title} className="p-4 border-border bg-card">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground">{card.title}</span>
              <div
                className={`h-8 w-8 shrink-0 rounded-lg flex items-center justify-center ${card.tone}`}
              >
                <card.icon className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-xl sm:text-2xl font-bold tabular-nums text-foreground break-words">
                {card.value}
              </span>
              <span className="text-xs text-muted-foreground block mt-1">{card.note}</span>
            </div>
          </Card>
        ))}
      </div>

      <AbandonedCartsList
        carts={carts}
        brandSlug={brand.slug}
        brandName={brand.name_ar || brand.name_en}
        brandId={brand.id}
        recoveryCode={recoveryCode}
        isLoading={loadingCarts}
        onRefresh={refetchCarts}
      />

      <AbandonedCartSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        brandId={brand.id}
        initialSettings={settings}
      />
    </div>
  );
}
