import { CreditCard, ShoppingBag, Store, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { formatMoney } from "@/lib/format";
import type { ByCurrency, PlatformFigures } from "../lib/stores";

type Lang = "ar" | "en";

function Money({ amounts, lang }: { amounts: ByCurrency; lang: Lang }) {
  if (amounts.length === 0) return <>{formatMoney(0, "BHD", lang)}</>;
  return (
    <span className="flex flex-col">
      {amounts.map(({ currency, amount }) => (
        <span key={currency}>{formatMoney(amount, currency, lang)}</span>
      ))}
    </span>
  );
}

function Figure({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  note: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words">{label}</span>
      </div>
      <div className="mt-1.5 font-mono text-lg font-bold text-foreground sm:text-xl">{value}</div>
      <p className="mt-1 break-words text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

/** The platform at a glance: its stores, what subscriptions bring, and what the stores sell. */
export function PlatformFiguresStrip({
  figures,
  loading,
  lang,
}: {
  figures: PlatformFigures;
  loading: boolean;
  lang: Lang;
}) {
  const ar = lang === "ar";
  const dash = <span className="text-muted-foreground">—</span>;
  return (
    <section
      aria-label={ar ? "أرقام المنصة" : "Platform figures"}
      className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
    >
      <Figure
        icon={Store}
        label={ar ? "المتاجر" : "Stores"}
        value={figures.stores}
        note={
          ar
            ? `مدفوع ${figures.paying} · تجربة ${figures.trials} · دائم ${figures.permanent}`
            : `${figures.paying} paying · ${figures.trials} trial · ${figures.permanent} permanent`
        }
      />
      <Figure
        icon={CreditCard}
        label={ar ? "الاشتراكات شهرياً" : "Subscriptions a month"}
        value={loading ? dash : <Money amounts={figures.monthlyRevenue} lang={lang} />}
        note={
          ar
            ? "من سعر باقة كل متجر نشط، والسنوي مقسوم على 12"
            : "From each active store's plan price; annual plans divided by 12"
        }
      />
      <Figure
        icon={TrendingUp}
        label={ar ? "مبيعات المتاجر (30 يوماً)" : "Stores' sales (30 days)"}
        value={loading ? dash : <Money amounts={figures.sales30d} lang={lang} />}
        note={
          ar
            ? "الطلبات المحسوبة مبيعاً، بعملة كل متجر"
            : "Orders counted as sold, in each store's currency"
        }
      />
      <Figure
        icon={ShoppingBag}
        label={ar ? "طلبات المتاجر (30 يوماً)" : "Stores' orders (30 days)"}
        value={loading ? dash : figures.orders30d}
        note={
          ar
            ? `متاجر جديدة خلال 30 يوماً: ${figures.newStores}`
            : `New stores in 30 days: ${figures.newStores}`
        }
      />
    </section>
  );
}
