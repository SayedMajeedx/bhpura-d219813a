import React from "react";
import { Package, Plus, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface InventoryCommandHeaderProps {
  lang: "en" | "ar";
  productCount: number;
  isCourier: boolean;
  onCreateNew: () => void;
  renderImporters?: React.ReactNode;
}

export const InventoryCommandHeader: React.FC<InventoryCommandHeaderProps> = ({
  lang,
  productCount,
  isCourier,
  onCreateNew,
  renderImporters,
}) => {
  const isAr = lang === "ar";

  return (
    <header className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/60 bg-card p-3.5 shadow-2xs sm:flex-row sm:items-center sm:justify-between sm:p-4">
      {/* Title + Icon + Context Badge */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
          <Package className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1
              data-route-heading="inventory"
              tabIndex={-1}
              className="min-w-0 font-display text-lg font-bold tracking-tight text-foreground sm:text-xl"
            >
              {isAr ? "المخزون والمنتجات" : "Inventory & Products"}
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">
              {productCount} {isAr ? "منتج" : "products"}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {isAr
              ? "تابع المنتجات والكميات والأسعار، واطبع الباركود بسهولة"
              : "Manage product catalog, stock levels, variants, and barcode printing."}
          </p>
        </div>
      </div>

      {/* Primary & Secondary Actions Group */}
      {!isCourier && (
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:shrink-0">
          <Button
            onClick={onCreateNew}
            className="h-9 min-w-0 flex-1 gap-1.5 px-3.5 text-xs font-bold shadow-2xs sm:flex-none"
          >
            <Plus className="h-4 w-4" />
            {isAr ? "إضافة منتج" : "Add Product"}
          </Button>

          {renderImporters && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 border-border/70 text-foreground hover:bg-muted"
                  aria-label={isAr ? "خيارات الاستيراد والطباعة" : "Import & Print Options"}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align={isAr ? "start" : "end"}
                className="w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-border/80 p-1.5 shadow-xl [&_button]:h-auto [&_button]:min-h-9 [&_button]:w-full [&_button]:min-w-0 [&_button]:justify-start [&_button]:whitespace-normal [&_button]:text-start"
              >
                {renderImporters}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </header>
  );
};
