import { Link } from "@tanstack/react-router";
import {
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Puzzle,
  Search,
  Shield,
  Store,
  Trash2,
} from "lucide-react";
import { OsEmptyState } from "@/components/os/os-empty-state";
import { OsStatusPill } from "@/components/os/os-status-pill";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { countOf } from "@/lib/arabic-count";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getVerticalDefinition } from "@/lib/verticals/registry";
import {
  RENEWAL_WORDS,
  SORT_WORDS,
  STATE_WORDS,
  STORE_VIEWS,
  VIEW_WORDS,
  inView,
  storeName,
  type HomeStore,
  type StoreFilter,
  type StoreRow,
  type StoreSort,
} from "../lib/stores";

type Lang = "ar" | "en";

export type StoreActions = {
  openAdmin: (store: HomeStore) => void;
  edit: (store: HomeStore) => void;
  remove: (store: HomeStore) => void;
};

const dayOf = (iso: string | null | undefined, lang: Lang) =>
  iso
    ? new Date(iso).toLocaleDateString(lang === "ar" ? "ar-BH-u-nu-latn" : "en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

const kindOf = (vertical: string | null | undefined, lang: Lang) =>
  vertical ? getVerticalDefinition(vertical).label[lang] : "—";

function StatePill({ row, lang }: { row: StoreRow; lang: Lang }) {
  const words = STATE_WORDS[row.state];
  const left =
    row.daysLeft !== null && (row.state === "active" || row.state === "trial")
      ? lang === "ar"
        ? `باقي ${countOf(row.daysLeft, "day", lang)}`
        : `${countOf(row.daysLeft, "day", lang)} left`
      : null;
  const intent = row.store.renewal_intent ? RENEWAL_WORDS[row.store.renewal_intent] : null;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <OsStatusPill variant={row.endingSoon ? "warning" : words.tone} dot>
        {words[lang]}
      </OsStatusPill>
      {left && <span className="text-xs text-muted-foreground">{left}</span>}
      {intent && <span className="text-xs font-semibold text-foreground">{intent[lang]}</span>}
    </span>
  );
}

function StoreIdentity({ store, lang }: { store: HomeStore; lang: Lang }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {store.logo_url ? (
        <img
          src={store.logo_url}
          alt=""
          className="size-9 shrink-0 rounded-md border border-border bg-muted object-contain"
        />
      ) : (
        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-muted">
          <Store className="size-4 text-muted-foreground" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0">
        <div dir="auto" className="text-page-start line-clamp-2 break-words text-sm font-semibold">
          {storeName(store, lang)}
        </div>
        <div className="truncate font-mono text-xs text-muted-foreground" dir="ltr">
          {store.slug}.boutq.store
        </div>
      </div>
    </div>
  );
}

function RowMenu({
  store,
  actions,
  lang,
}: {
  store: HomeStore;
  actions: StoreActions;
  lang: Lang;
}) {
  const ar = lang === "ar";
  const name = storeName(store, lang);
  const locked = store.support_access_enabled === false;
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button
        size="sm"
        variant="secondary"
        disabled={locked}
        onClick={() => actions.openAdmin(store)}
        title={
          locked
            ? ar
              ? "المتجر أوقف وصول الدعم"
              : "The store turned support access off"
            : undefined
        }
      >
        <Shield className="size-3.5" aria-hidden="true" />
        {ar ? "لوحة المتجر" : "Open admin"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            aria-label={ar ? `خيارات ${name}` : `${name} options`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link to="/$slug" params={{ slug: store.slug }}>
              <ExternalLink className="size-4" />
              {ar ? "المتجر" : "Storefront"}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/admin/b/$slug/addons" params={{ slug: store.slug }}>
              <Puzzle className="size-4" />
              {ar ? "الإضافات" : "Add-ons"}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => actions.edit(store)}>
            <Pencil className="size-4" />
            {ar ? "تعديل" : "Edit"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => actions.remove(store)}
          >
            <Trash2 className="size-4" />
            {ar ? "حذف" : "Delete"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const sales = (row: StoreRow, lang: Lang) =>
  formatMoney(row.stats?.sales30d ?? 0, row.stats?.currency ?? "BHD", lang);

/** Every store with its own figures: searched, filtered by state and kind, sorted. */
export function StoresTable({
  rows,
  shown,
  filter,
  onFilter,
  verticals,
  actions,
  lang,
}: {
  rows: StoreRow[];
  shown: StoreRow[];
  filter: StoreFilter;
  onFilter: (patch: Partial<StoreFilter>) => void;
  verticals: string[];
  actions: StoreActions;
  lang: Lang;
}) {
  const ar = lang === "ar";
  return (
    <div className="space-y-3 @container">
      <div
        className="flex gap-1.5 overflow-x-auto pb-1"
        role="tablist"
        aria-label={ar ? "حالة المتجر" : "Store state"}
      >
        {STORE_VIEWS.map((view) => {
          const count = rows.filter((row) => inView(row, view)).length;
          if (view !== "all" && count === 0) return null;
          return (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={filter.view === view}
              onClick={() => onFilter({ view })}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold pointer-coarse:min-h-11",
                filter.view === view
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {VIEW_WORDS[view][lang]} ({count})
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter.term}
            onChange={(e) => onFilter({ term: e.target.value })}
            placeholder={ar ? "ابحث بالاسم أو الرابط" : "Search by name or address"}
            aria-label={ar ? "بحث في المتاجر" : "Search stores"}
            className="ps-9"
          />
        </div>
        {verticals.length > 1 && (
          <Select value={filter.vertical} onValueChange={(vertical) => onFilter({ vertical })}>
            <SelectTrigger
              className="w-auto min-w-36"
              aria-label={ar ? "نوع المتجر" : "Kind of store"}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{ar ? "كل الأنواع" : "Every kind"}</SelectItem>
              {verticals.map((vertical) => (
                <SelectItem key={vertical} value={vertical}>
                  {kindOf(vertical, lang)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={filter.sort} onValueChange={(sort) => onFilter({ sort: sort as StoreSort })}>
          <SelectTrigger className="w-auto min-w-36" aria-label={ar ? "الترتيب" : "Sort"}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_WORDS) as StoreSort[]).map((sort) => (
              <SelectItem key={sort} value={sort}>
                {SORT_WORDS[sort][lang]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {shown.length === 0 ? (
        <OsEmptyState
          icon={Store}
          title={
            rows.length === 0
              ? ar
                ? "لا توجد متاجر بعد"
                : "No stores yet"
              : ar
                ? "لا نتائج"
                : "Nothing matches"
          }
          description={
            rows.length === 0
              ? ar
                ? "أطلق أول متجر من معالج الإطلاق."
                : "Launch the first store from the wizard."
              : ar
                ? "جرّب حالة أخرى أو كلمة بحث أخرى."
                : "Try another state or another search."
          }
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card @3xl:block">
            <table className="w-full text-sm">
              <thead className="whitespace-nowrap border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start font-semibold">{ar ? "المتجر" : "Store"}</th>
                  <th className="px-3 py-2 text-start font-semibold">{ar ? "الحالة" : "State"}</th>
                  <th className="px-3 py-2 text-start font-semibold">{ar ? "النوع" : "Kind"}</th>
                  <th className="px-3 py-2 text-end font-semibold">
                    {ar ? "المنتجات" : "Products"}
                  </th>
                  <th className="px-3 py-2 text-end font-semibold">
                    {ar ? "طلبات 30 يوماً" : "Orders 30d"}
                  </th>
                  <th className="px-3 py-2 text-end font-semibold">
                    {ar ? "مبيعات 30 يوماً" : "Sales 30d"}
                  </th>
                  <th className="px-3 py-2 text-start font-semibold">
                    {ar ? "آخر طلب" : "Last order"}
                  </th>
                  <th className="px-3 py-2">
                    <span className="sr-only">{ar ? "إجراءات" : "Actions"}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((row) => (
                  <tr key={row.store.id} className="align-middle">
                    <td className="max-w-64 px-3 py-2.5">
                      <StoreIdentity store={row.store} lang={lang} />
                    </td>
                    <td className="px-3 py-2.5">
                      <StatePill row={row} lang={lang} />
                    </td>
                    <td className="px-3 py-2.5 text-xs">{kindOf(row.stats?.vertical, lang)}</td>
                    <td className="px-3 py-2.5 text-end font-mono">{row.stats?.products ?? 0}</td>
                    <td className="px-3 py-2.5 text-end font-mono">{row.stats?.orders30d ?? 0}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-end font-mono">
                      {sales(row, lang)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                      {dayOf(row.stats?.lastOrderAt, lang)}
                    </td>
                    <td className="px-3 py-2.5">
                      <RowMenu store={row.store} actions={actions} lang={lang} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-2 @3xl:hidden">
            {shown.map((row) => (
              <li
                key={row.store.id}
                className="space-y-3 rounded-xl border border-border bg-card p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <StoreIdentity store={row.store} lang={lang} />
                  <StatePill row={row} lang={lang} />
                </div>
                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">
                      {ar ? "طلبات 30 يوماً" : "Orders 30d"}
                    </dt>
                    <dd className="font-mono font-semibold">{row.stats?.orders30d ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {ar ? "مبيعات 30 يوماً" : "Sales 30d"}
                    </dt>
                    <dd className="break-words font-mono font-semibold">{sales(row, lang)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{ar ? "آخر طلب" : "Last order"}</dt>
                    <dd className="font-semibold">{dayOf(row.stats?.lastOrderAt, lang)}</dd>
                  </div>
                </dl>
                <RowMenu store={row.store} actions={actions} lang={lang} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
