import { Building2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BatchIncubatorTransferModal } from "@/components/incubators/BatchIncubatorTransferModal";
import { OsLoadFailedState } from "@/components/os/os-load-failed-state";
import { useIncubatorsPage } from "@/features/incubators/hooks/use-incubators-page";
import {
  IncubatorOverview,
  IncubatorPicker,
} from "@/features/incubators/components/IncubatorOverview";
import { IncubatorStockTab } from "@/features/incubators/components/IncubatorStockTab";
import {
  IncubatorHistoryTab,
  IncubatorPaymentsTab,
  IncubatorSalesTab,
} from "@/features/incubators/components/IncubatorLedgerTabs";
import {
  IncubatorFormDialog,
  ReverseSaleDialog,
  VoidPaymentDialog,
} from "@/features/incubators/components/IncubatorDialogs";
import { IncubatorStatementDialog } from "@/features/incubators/components/IncubatorStatementDialog";
import { PartnerStockNotices } from "@/features/incubators/components/PartnerStockNotices";

/**
 * Incubators and consignment: the partners that hold the store's pieces, what each holds,
 * what it sold, what it paid and what it owes. The state and the actions are in
 * `useIncubatorsPage`; the pure rules in `features/incubators/lib`.
 */
export function IncubatorsPage() {
  const page = useIncubatorsPage();
  const { brand, current, currentId, isAr, openDialog, refreshPrices, syncing } = page;

  if (page.failed) {
    return (
      <OsLoadFailedState
        isAr={isAr}
        title={isAr ? "تعذّر تحميل محلات الشركاء" : "Partner shops could not be loaded"}
        description={
          isAr
            ? "لم يتغير أي مخزون أو مبلغ. تحقق من الاتصال ثم أعد المحاولة."
            : "No stock or amount was changed. Check the connection and try again."
        }
        queries={[{ isLoading: false, isError: true, refetch: async () => page.retry() }]}
      />
    );
  }

  return (
    <div className="space-y-4 pb-8" dir={isAr ? "rtl" : "ltr"}>
      <header className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold">
              {isAr ? "محلات الشركاء والأمانات" : "Partner shops & consignment"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "البضاعة الخارجية، المبيعات، والمستحقات في مكان واحد"
                : "External stock, sales, and receivables in one place"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={refreshPrices} disabled={syncing || !currentId}>
            <RefreshCw className={`me-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {isAr ? "مزامنة الأسعار" : "Sync prices"}
          </Button>
          <Button onClick={() => openDialog("incubator")}>
            <Plus className="me-2 h-4 w-4" />
            {isAr ? "محل شريك جديد" : "New partner shop"}
          </Button>
        </div>
      </header>

      <IncubatorPicker page={page} />

      {current ? (
        <div className="min-w-0 space-y-4">
          <IncubatorOverview page={page} />
          <PartnerStockNotices
            brandId={brand.id}
            slug={brand.slug}
            incubatorId={currentId}
            stock={page.allStock}
            isAr={isAr}
          />
          <Tabs value={page.tab} onValueChange={page.setTab} dir={isAr ? "rtl" : "ltr"}>
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="stock">{isAr ? "البضاعة عندهم" : "Stock"}</TabsTrigger>
              <TabsTrigger value="sales">{isAr ? "المبيعات" : "Sales"}</TabsTrigger>
              <TabsTrigger value="payments">{isAr ? "الدفعات" : "Payments"}</TabsTrigger>
              <TabsTrigger value="history">{isAr ? "السجل" : "History"}</TabsTrigger>
            </TabsList>
            <TabsContent value="stock">
              <IncubatorStockTab page={page} />
            </TabsContent>
            <TabsContent value="sales">
              <IncubatorSalesTab page={page} />
            </TabsContent>
            <TabsContent value="payments">
              <IncubatorPaymentsTab page={page} />
            </TabsContent>
            <TabsContent value="history">
              <IncubatorHistoryTab page={page} />
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        !page.loading && (
          <Card className="border-border p-12 text-center text-muted-foreground">
            <Building2 className="mx-auto mb-3 h-10 w-10" />
            <p>
              {isAr
                ? "أضف محلًا شريكًا لبدء إدارة العُهد"
                : "Create an incubator to start managing consignments"}
            </p>
          </Card>
        )
      )}

      <IncubatorFormDialog page={page} />
      <ReverseSaleDialog page={page} />
      <VoidPaymentDialog page={page} />
      <IncubatorStatementDialog page={page} />
      <BatchIncubatorTransferModal
        open={page.dialog === "transfer"}
        onOpenChange={(open) => {
          if (!open) page.closeDialog();
        }}
        targetProducts={page.products}
        initialIncubatorId={currentId}
        onSuccess={page.invalidateData}
      />
    </div>
  );
}
