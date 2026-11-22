import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Plus, Smartphone } from "lucide-react";
import {
  AdminPageAction,
  AdminPageCount,
  AdminPageHeader,
} from "@/components/admin/AdminPageHeader";
import { BrandWizardDialog } from "@/components/super-admin/brand-wizard/BrandWizardDialog";
import { DeleteBrandDialog } from "@/components/super-admin/DeleteBrandDialog";
import { EditBrandDialog, type Brand } from "@/components/super-admin/EditBrandDialog";
import { WhiteLabelAppsPanel } from "@/components/super-admin/WhiteLabelAppsPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOpenSession } from "@/hooks/use-open-session";
import { countOf } from "@/lib/arabic-count";
import { brandKeys, brandQueries } from "@/lib/data/brands";
import { superAdminQueries } from "@/lib/data/super-admin";
import { superAdminHomeKeys, superAdminHomeQueries } from "@/lib/data/super-admin/home";
import { isSilent, latestPerService } from "@/lib/system-health";
import { useImpersonate } from "../hooks/use-impersonate";
import { deletedStores } from "../lib/deleted-stores";
import { needsYou, type NeedsYouTarget } from "../lib/needs-you";
import {
  filterStores,
  platformFigures,
  storeRows,
  verticalsOf,
  type HomeStore,
  type StoreFilter,
} from "../lib/stores";
import { DeletedStoresList } from "./DeletedStoresList";
import { NeedsYouList } from "./NeedsYouList";
import { PlatformFiguresStrip } from "./PlatformFiguresStrip";
import { ReceiptApprovals } from "./ReceiptApprovals";
import { StoresTable } from "./StoresTable";

type Lang = "ar" | "en";
type Tab = "stores" | "receipts" | "apps" | "deleted";

/**
 * The super admin's home, read top to bottom: the platform's figures, what needs a person today,
 * then the stores (searched, filtered, sorted), the receipts to check, the stores' own apps and
 * the stores that were deleted.
 */
export function SuperAdminHome({ lang }: { lang: Lang }) {
  const ar = lang === "ar";
  const qc = useQueryClient();
  const [now] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>("stores");
  const [filter, setFilter] = useState<StoreFilter>({
    term: "",
    view: "all",
    vertical: "all",
    sort: "newest",
  });
  const [wizardOpen, setWizardOpen] = useState(false);
  const wizardSession = useOpenSession(wizardOpen);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [deleting, setDeleting] = useState<Brand | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const impersonate = useImpersonate(lang);

  const brandsQuery = useQuery(brandQueries.list());
  const statsQuery = useQuery(superAdminHomeQueries.storeStats());
  const { data: records = [] } = useQuery(superAdminHomeQueries.deletedStores());
  const responsesQuery = useQuery(superAdminHomeQueries.newResponses());
  const requestsQuery = useQuery(superAdminQueries.tenantRequests());
  const healthQuery = useQuery(superAdminQueries.systemHealth());

  const brands = useMemo(() => (brandsQuery.data ?? []) as unknown as Brand[], [brandsQuery.data]);
  const stores = brands as unknown as HomeStore[];
  const rows = useMemo(
    () => storeRows(stores, statsQuery.data ?? [], now),
    [stores, statsQuery.data, now],
  );
  const shown = useMemo(() => filterStores(rows, filter, lang), [rows, filter, lang]);
  const figures = useMemo(() => platformFigures(rows, now), [rows, now]);
  const pending = rows.filter((row) => row.state === "pending").map((row) => row.store);
  const deleted = useMemo(() => deletedStores(stores, records), [stores, records]);

  const health = useMemo(() => {
    if (!healthQuery.data) return null;
    return {
      failed: healthQuery.data.incidents.length,
      silent: latestPerService(healthQuery.data.events).filter((event) => isSilent(event, now))
        .length,
    };
  }, [healthQuery.data, now]);

  const lines = needsYou(
    {
      rows,
      tenantRequests: requestsQuery.data?.length ?? 0,
      newResponses: responsesQuery.data ?? [],
      health,
    },
    lang,
  );

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: brandKeys.list() });
    void qc.invalidateQueries({ queryKey: superAdminHomeKeys.all() });
  };
  const brandOf = (store: HomeStore) => brands.find((b) => b.id === store.id) ?? null;

  const open = (target: NeedsYouTarget) => {
    if (target.kind === "receipts") setTab("receipts");
    if (target.kind === "stores") {
      setTab("stores");
      setFilter((current) => ({ ...current, view: target.view, term: "" }));
    }
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:space-y-5 sm:p-6" dir={ar ? "rtl" : "ltr"}>
      <AdminPageHeader
        icon={Crown}
        title={ar ? "لوحة بوتيك" : "Boutq platform"}
        badges={<AdminPageCount>{countOf(rows.length, "store", lang)}</AdminPageCount>}
        description={
          ar
            ? "متاجر المنصة واشتراكاتها، وما ينتظرك اليوم."
            : "The platform's stores and subscriptions, and what is waiting for you today."
        }
        actions={
          <AdminPageAction
            icon={Plus}
            label={ar ? "إطلاق متجر" : "Launch a store"}
            short={ar ? "متجر" : "Store"}
            onClick={() => setWizardOpen(true)}
          />
        }
      />

      <PlatformFiguresStrip figures={figures} loading={statsQuery.isLoading} lang={lang} />

      <NeedsYouList
        lines={lines}
        loading={brandsQuery.isLoading || statsQuery.isLoading}
        lang={lang}
        onOpen={open}
      />

      <div ref={tabsRef} className="scroll-mt-4">
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="min-w-0">
          <TabsList className="mb-3 flex w-full justify-start overflow-x-auto sm:w-auto">
            <TabsTrigger value="stores">
              {ar ? "المتاجر" : "Stores"} ({rows.length})
            </TabsTrigger>
            <TabsTrigger value="receipts">
              {ar ? "الإيصالات" : "Receipts"} ({pending.length})
            </TabsTrigger>
            <TabsTrigger value="apps" className="gap-1.5">
              <Smartphone className="size-3.5" aria-hidden="true" />
              {ar ? "تطبيقات المتاجر" : "Store apps"}
            </TabsTrigger>
            <TabsTrigger value="deleted">
              {ar ? "المحذوفة" : "Deleted"} ({deleted.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stores">
            <StoresTable
              rows={rows}
              shown={shown}
              filter={filter}
              onFilter={(patch) => setFilter((current) => ({ ...current, ...patch }))}
              verticals={verticalsOf(rows)}
              lang={lang}
              actions={{
                openAdmin: (store) => void impersonate(store.id, store.slug),
                edit: (store) => setEditing(brandOf(store)),
                remove: (store) => setDeleting(brandOf(store)),
              }}
            />
          </TabsContent>
          <TabsContent value="receipts">
            <ReceiptApprovals stores={pending} lang={lang} onChanged={refresh} />
          </TabsContent>
          <TabsContent value="apps">
            <WhiteLabelAppsPanel
              brands={brands.filter((b) => !b.slug.includes("-deleted-"))}
              isAr={ar}
            />
          </TabsContent>
          <TabsContent value="deleted">
            <DeletedStoresList stores={deleted} lang={lang} />
          </TabsContent>
        </Tabs>
      </div>

      <BrandWizardDialog
        key={wizardSession}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onSaved={() => {
          setWizardOpen(false);
          refresh();
        }}
        onClose={() => setWizardOpen(false)}
      />
      {editing && (
        <EditBrandDialog
          open
          onOpenChange={(value) => !value && setEditing(null)}
          brand={editing}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
      {deleting && (
        <DeleteBrandDialog
          brand={deleting}
          open
          onOpenChange={(value) => !value && setDeleting(null)}
          onDone={() => {
            setDeleting(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
