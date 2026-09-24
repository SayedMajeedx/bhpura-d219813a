import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Search, ScanLine } from "lucide-react";
import { useT, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { variantAxisDefaultsFrom } from "@/lib/addons/addon-registry";
import { useCustomerFitPassport } from "@/features/orders/hooks/use-customer-fit-passport";
import type { Dispatch, SetStateAction } from "react";
import type { OrderItem } from "@/features/orders/types";
import type { OrderDetailData } from "@/features/orders/hooks/use-order-detail-data";

import { OrderLineCard } from "@/features/orders/components/OrderLineCard";
/** The order's lines, with add, search and barcode scan. */
export function OrderItemsCard({
  addItem,
  addonDefaults,
  cameraStreamPromise,
  currency,
  customQ,
  customerPassportQ,
  editingItemSheetIdx,
  editingItems,
  handleScanned,
  items,
  lang,
  mobileTab,
  openBarcodeScanner,
  pickVariant,
  productsQ,
  scannerOpen,
  setEditingItemSheetIdx,
  setItems,
  setProductSearchOpen,
  setScannerOpen,
  storeProfile,
  t,
  toggleCustom,
  updateItem,
  variantsQ,
  vocabulary,
}: {
  addItem: () => void;
  addonDefaults: ReturnType<typeof variantAxisDefaultsFrom>;
  cameraStreamPromise: Promise<MediaStream> | null;
  currency: string;
  customQ: OrderDetailData["customQ"];
  customerPassportQ: ReturnType<typeof useCustomerFitPassport>;
  editingItemSheetIdx: number | null;
  editingItems: Record<number, boolean>;
  handleScanned: (code: string) => void;
  items: OrderItem[];
  lang: ReturnType<typeof useI18n>["lang"];
  mobileTab: "items" | "customer" | "activity";
  openBarcodeScanner: () => void;
  pickVariant: (idx: number, variantId: string) => void;
  productsQ: OrderDetailData["productsQ"];
  scannerOpen: boolean;
  setEditingItemSheetIdx: Dispatch<SetStateAction<number | null>>;
  setItems: Dispatch<SetStateAction<OrderItem[]>>;
  setProductSearchOpen: Dispatch<SetStateAction<boolean>>;
  setScannerOpen: Dispatch<SetStateAction<boolean>>;
  storeProfile: ReturnType<typeof useAdminStoreProfile>["profile"];
  t: ReturnType<typeof useT>;
  toggleCustom: (idx: number, c: { name: string; price_delta: number }) => void;
  updateItem: (idx: number, patch: Partial<OrderItem>) => void;
  variantsQ: OrderDetailData["variantsQ"];
  vocabulary: ReturnType<typeof useVocabulary>["vocabulary"];
}) {
  return (
    <Card
      id="sec-items"
      className={cn(
        "scroll-mt-24 overflow-hidden rounded-2xl border border-border-subtle bg-card/60 p-4 shadow-sm  sm:bg-card sm:p-6 sm:shadow-lg",
        mobileTab !== "items" && "hidden sm:block",
      )}
    >
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h3 className="font-display text-lg">{t("orderDetail.lineItems")}</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            className="bg-primary text-primary-foreground font-semibold"
            onClick={() => setProductSearchOpen(true)}
          >
            <Search className="h-3.5 w-3.5 me-1.5" />
            {lang === "ar" ? "بحث المنتجات والـ SKU" : "Search Products & SKUs"}
          </Button>
          <Button size="sm" variant="outline" onClick={openBarcodeScanner}>
            <ScanLine className="h-3.5 w-3.5 me-1.5" />
            {lang === "ar" ? "مسح الباركود" : "Scan Barcode"}
          </Button>
          <Button size="sm" variant="outline" onClick={addItem}>
            <Plus className="h-3.5 w-3.5 me-1.5" /> {t("orderDetail.addLine")}
          </Button>
        </div>
      </div>
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("orderDetail.noLines")}</p>
      )}
      <div className="space-y-3">
        {items.map((it, idx) => (
          <OrderLineCard
            key={idx}
            addonDefaults={addonDefaults}
            currency={currency}
            customQ={customQ}
            customerPassportQ={customerPassportQ}
            editingItemSheetIdx={editingItemSheetIdx}
            editingItems={editingItems}
            idx={idx}
            it={it}
            items={items}
            lang={lang}
            pickVariant={pickVariant}
            productsQ={productsQ}
            setEditingItemSheetIdx={setEditingItemSheetIdx}
            setItems={setItems}
            storeProfile={storeProfile}
            t={t}
            toggleCustom={toggleCustom}
            updateItem={updateItem}
            variantsQ={variantsQ}
            vocabulary={vocabulary}
          />
        ))}
      </div>
      <BarcodeScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={handleScanned}
        cameraStreamPromise={cameraStreamPromise}
      />
    </Card>
  );
}
