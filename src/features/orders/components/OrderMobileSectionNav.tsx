import { Receipt, UserRound, Package } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Dispatch, SetStateAction } from "react";

/** Phone tabs for the order: items, customer and activity. */
export function OrderMobileSectionNav({
  isCreationMode,
  lang,
  mobileTab,
  setMobileTab,
}: {
  isCreationMode: boolean;
  lang: ReturnType<typeof useI18n>["lang"];
  mobileTab: "items" | "customer" | "activity";
  setMobileTab: Dispatch<SetStateAction<"items" | "customer" | "activity">>;
}) {
  return (
    <div
      className={cn(
        "no-print my-3 grid gap-1 rounded-2xl border border-border-strong bg-muted/60 p-1.5 shadow-2xs select-none sm:hidden",
        isCreationMode ? "grid-cols-2" : "grid-cols-3",
      )}
    >
      <button
        type="button"
        onClick={() => setMobileTab("items")}
        className={cn(
          "flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-extrabold transition-all touch-manipulation min-h-10",
          mobileTab === "items"
            ? "bg-card text-foreground shadow-xs border border-border-strong font-bold"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Package className="h-4 w-4 shrink-0" />
        <span>{lang === "ar" ? "المنتجات" : "Items"}</span>
      </button>
      <button
        type="button"
        onClick={() => setMobileTab("customer")}
        className={cn(
          "flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-extrabold transition-all touch-manipulation min-h-10",
          mobileTab === "customer"
            ? "bg-card text-foreground shadow-xs border border-border-strong font-bold"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <UserRound className="h-4 w-4 shrink-0" />
        <span>{lang === "ar" ? "العميل والتوصيل" : "Customer"}</span>
      </button>
      {!isCreationMode && (
        <button
          type="button"
          onClick={() => setMobileTab("activity")}
          className={cn(
            "flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-extrabold transition-all touch-manipulation min-h-10",
            mobileTab === "activity"
              ? "bg-card text-foreground shadow-xs border border-border-strong font-bold"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Receipt className="h-4 w-4 shrink-0" />
          <span>{lang === "ar" ? "النشاط" : "Activity"}</span>
        </button>
      )}
    </div>
  );
}
