import type { StoreStats } from "@/lib/data/super-admin/home";

/**
 * The super admin's stores: each one's state as a person reads it, the table's search, filters and
 * order, and the platform's figures. Pure, so the home's rules are tested without a screen.
 */

export type HomeStore = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string | null;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  plan_type: string | null;
  subscription_status: string | null;
  subscription_expires_at: string | null;
  trial_ends_at: string | null;
  renewal_intent: string | null;
  payment_receipt_url: string | null;
  support_access_enabled: boolean;
};

export type StoreState =
  "permanent" | "active" | "trial" | "pending" | "expired" | "unpaid" | "deleted";

export const STATE_WORDS: Record<
  StoreState,
  { ar: string; en: string; tone: "success" | "info" | "warning" | "destructive" | "neutral" }
> = {
  permanent: { ar: "دائم", en: "Permanent", tone: "info" },
  active: { ar: "نشط", en: "Active", tone: "success" },
  trial: { ar: "تجربة", en: "Trial", tone: "warning" },
  pending: { ar: "إيصال للمراجعة", en: "Receipt to check", tone: "warning" },
  expired: { ar: "منتهي", en: "Expired", tone: "destructive" },
  unpaid: { ar: "غير مدفوع", en: "Unpaid", tone: "neutral" },
  deleted: { ar: "محذوف", en: "Deleted", tone: "neutral" },
};

/** What a store said it will do when its subscription ends (`brands.renewal_intent`). */
export const RENEWAL_WORDS: Record<string, { ar: string; en: string }> = {
  renew: { ar: "يرغب بالتجديد", en: "Wants to renew" },
  cancel: { ar: "لن يجدد", en: "Will not renew" },
  upgrade: { ar: "طلب ترقية الباقة", en: "Asked to upgrade" },
  downgrade: { ar: "طلب خفض الباقة", en: "Asked to downgrade" },
};

/** A subscription or trial ending within this many days is listed as ending soon. */
export const ENDING_SOON_DAYS = 14;
/** A store this old with no order in the last 30 days is quiet. */
export const QUIET_AFTER_DAYS = 30;

const DAY = 86_400_000;

export const isDeletedStore = (store: Pick<HomeStore, "slug">) => store.slug.includes("-deleted-");

/** The day a store's access ends: its trial's end while on trial, else its subscription's. */
export function accessEndsAt(store: HomeStore): string | null {
  if (store.plan_type === "lifetime") return null;
  if (store.plan_type === "trial" || store.subscription_status === "trialing") {
    return store.trial_ends_at;
  }
  return store.subscription_expires_at;
}

/** Whole days left until `endsAt`, 0 once it has passed; null with no end. */
export function daysLeft(endsAt: string | null, now: number): number | null {
  if (!endsAt) return null;
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / DAY));
}

export function storeState(store: HomeStore, now: number): StoreState {
  if (isDeletedStore(store)) return "deleted";
  if (store.plan_type === "lifetime") return "permanent";
  if (store.subscription_status === "pending_verification" && store.payment_receipt_url) {
    return "pending";
  }
  const ends = accessEndsAt(store);
  if (ends && new Date(ends).getTime() <= now) return "expired";
  if (store.plan_type === "trial" || store.subscription_status === "trialing") return "trial";
  if (store.subscription_status === "active") return "active";
  return "unpaid";
}

export type StoreRow = {
  store: HomeStore;
  stats: StoreStats | null;
  state: StoreState;
  /** Days of access left (trial or subscription); null for a permanent store or none set. */
  daysLeft: number | null;
  endingSoon: boolean;
  quiet: boolean;
};

export function storeRows(
  stores: readonly HomeStore[],
  stats: readonly StoreStats[],
  now: number,
): StoreRow[] {
  const byId = new Map(stats.map((s) => [s.brandId, s]));
  return stores
    .filter((store) => !isDeletedStore(store))
    .map((store) => {
      const state = storeState(store, now);
      const left = daysLeft(accessEndsAt(store), now);
      const own = byId.get(store.id) ?? null;
      const old = now - new Date(store.created_at).getTime() >= QUIET_AFTER_DAYS * DAY;
      return {
        store,
        stats: own,
        state,
        daysLeft: left,
        endingSoon:
          (state === "active" || state === "trial") && left !== null && left <= ENDING_SOON_DAYS,
        quiet: old && state !== "expired" && (own?.orders30d ?? 0) === 0,
      };
    });
}

export const storeName = (store: Pick<HomeStore, "name_en" | "name_ar">, lang: "ar" | "en") =>
  (lang === "ar" ? store.name_ar || store.name_en : store.name_en || store.name_ar) ?? "";

export type StoreView =
  "all" | "active" | "trial" | "pending" | "ending" | "expired" | "permanent" | "quiet";
export const STORE_VIEWS: StoreView[] = [
  "all",
  "active",
  "trial",
  "ending",
  "expired",
  "pending",
  "permanent",
  "quiet",
];
export const VIEW_WORDS: Record<StoreView, { ar: string; en: string }> = {
  all: { ar: "الكل", en: "All" },
  active: { ar: "نشط", en: "Active" },
  trial: { ar: "تجربة", en: "Trial" },
  pending: { ar: "إيصال للمراجعة", en: "Receipt to check" },
  ending: { ar: "ينتهي قريباً", en: "Ending soon" },
  expired: { ar: "منتهي", en: "Expired" },
  permanent: { ar: "دائم", en: "Permanent" },
  quiet: { ar: "بلا طلبات 30 يوماً", en: "No orders in 30 days" },
};

export function inView(row: StoreRow, view: StoreView): boolean {
  if (view === "all") return true;
  if (view === "ending") return row.endingSoon;
  if (view === "quiet") return row.quiet;
  return row.state === view;
}

export type StoreSort = "newest" | "name" | "sales" | "orders" | "lastOrder" | "ending";
export const SORT_WORDS: Record<StoreSort, { ar: string; en: string }> = {
  newest: { ar: "الأحدث", en: "Newest" },
  name: { ar: "الاسم", en: "Name" },
  sales: { ar: "المبيعات (30 يوماً)", en: "Sales (30 days)" },
  orders: { ar: "الطلبات (30 يوماً)", en: "Orders (30 days)" },
  lastOrder: { ar: "آخر طلب", en: "Last order" },
  ending: { ar: "أقرب انتهاء", en: "Ending first" },
};

export type StoreFilter = { term: string; view: StoreView; vertical: string; sort: StoreSort };

const time = (value: string | null | undefined) => (value ? new Date(value).getTime() : 0);

export function filterStores(
  rows: readonly StoreRow[],
  filter: StoreFilter,
  lang: "ar" | "en",
): StoreRow[] {
  const term = filter.term.trim().toLowerCase();
  const kept = rows.filter((row) => {
    if (!inView(row, filter.view)) return false;
    if (filter.vertical !== "all" && (row.stats?.vertical ?? "") !== filter.vertical) return false;
    if (!term) return true;
    const { store } = row;
    return [store.name_en, store.name_ar ?? "", store.slug].join(" ").toLowerCase().includes(term);
  });
  const by: Record<StoreSort, (a: StoreRow, b: StoreRow) => number> = {
    newest: (a, b) => time(b.store.created_at) - time(a.store.created_at),
    name: (a, b) => storeName(a.store, lang).localeCompare(storeName(b.store, lang), lang),
    sales: (a, b) => (b.stats?.sales30d ?? 0) - (a.stats?.sales30d ?? 0),
    orders: (a, b) => (b.stats?.orders30d ?? 0) - (a.stats?.orders30d ?? 0),
    lastOrder: (a, b) => time(b.stats?.lastOrderAt) - time(a.stats?.lastOrderAt),
    // A store with no end (permanent) goes last.
    ending: (a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity),
  };
  return [...kept].sort(by[filter.sort]);
}

/** The kinds of store the rows hold, for the filter. */
export const verticalsOf = (rows: readonly StoreRow[]) =>
  [...new Set(rows.map((row) => row.stats?.vertical).filter((v): v is string => !!v))].sort();

/** An amount for each currency, so stores in dinars and riyals are never added together. */
export type ByCurrency = Array<{ currency: string; amount: number }>;

function addTo(totals: Map<string, number>, currency: string, amount: number) {
  if (!amount) return;
  totals.set(currency, (totals.get(currency) ?? 0) + amount);
}
const listOf = (totals: Map<string, number>): ByCurrency =>
  [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => b.amount - a.amount);

/** What a subscription brings in a month: the monthly price, or a twelfth of the annual one. */
export function monthlyValue(subscription: StoreStats["subscription"]): number {
  if (!subscription || subscription.status !== "active") return 0;
  if (subscription.interval === "monthly") return subscription.priceMonthly;
  if (subscription.interval === "annual" || subscription.interval === "yearly") {
    return subscription.priceAnnual / 12;
  }
  return 0;
}

export type PlatformFigures = {
  stores: number;
  paying: number;
  trials: number;
  permanent: number;
  newStores: number;
  /** Subscriptions' value a month, from each plan version's price. */
  monthlyRevenue: ByCurrency;
  /** The stores' own sales of the last 30 days (orders that count as sold). */
  sales30d: ByCurrency;
  orders30d: number;
};

export function platformFigures(rows: readonly StoreRow[], now: number): PlatformFigures {
  const revenue = new Map<string, number>();
  const sales = new Map<string, number>();
  let orders = 0;
  for (const row of rows) {
    if (row.state === "active") {
      const sub = row.stats?.subscription;
      addTo(revenue, sub?.currency ?? "BHD", monthlyValue(sub ?? null));
    }
    addTo(sales, row.stats?.currency ?? "BHD", row.stats?.sales30d ?? 0);
    orders += row.stats?.orders30d ?? 0;
  }
  return {
    stores: rows.length,
    paying: rows.filter((r) => r.state === "active").length,
    trials: rows.filter((r) => r.state === "trial").length,
    permanent: rows.filter((r) => r.state === "permanent").length,
    newStores: rows.filter((r) => now - time(r.store.created_at) < QUIET_AFTER_DAYS * DAY).length,
    monthlyRevenue: listOf(revenue),
    sales30d: listOf(sales),
    orders30d: orders,
  };
}
