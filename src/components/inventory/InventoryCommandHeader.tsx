import React from "react";
import { Link } from "@tanstack/react-router";
import { Package, Plus, MoreHorizontal, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminPageCount, AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface InventoryCommandHeaderProps {
  lang: "en" | "ar";
  productCount: number;
  pendingNotifyCount?: number;
  /** The store whose sign-ups page lists the people waiting: the count is then a link to it. */
  waitlistSlug?: string;
  isCourier: boolean;
  onCreateNew: () => void;
  renderImporters?: React.ReactNode;
  /** A services store lists services, not products and stock. */
  isServices?: boolean;
}

export const InventoryCommandHeader: React.FC<InventoryCommandHeaderProps> = ({
  lang,
  productCount,
  pendingNotifyCount,
  waitlistSlug,
  isCourier,
  onCreateNew,
  renderImporters,
  isServices = false,
}) => {
  const isAr = lang === "ar";

  return (
    <AdminPageHeader
      icon={Package}
      headingProps={{ "data-route-heading": "inventory", tabIndex: -1 }}
      title={
        <>
          {isServices
            ? isAr
              ? "الخدمات"
              : "Services"
            : isAr
              ? "المخزون والمنتجات"
              : "Inventory & Products"}
        </>
      }
      badges={
        <>
          <AdminPageCount>
            {productCount} {isServices ? (isAr ? "خدمة" : "services") : isAr ? "منتج" : "products"}
          </AdminPageCount>
          {Boolean(pendingNotifyCount && pendingNotifyCount > 0) && (
            <WaitlistMark slug={waitlistSlug}>
              <Bell className="size-3" />
              <span>
                {pendingNotifyCount} {isAr ? "طلب إشعار توفر" : "waitlist"}
              </span>
            </WaitlistMark>
          )}
        </>
      }
      description={
        <>
          {isServices
            ? isAr
              ? "أدر خدماتك ومددها وباقاتها وأسعارها"
              : "Manage your services, their lengths, packages and prices."
            : isAr
              ? "تابع المنتجات والكميات والأسعار، واطبع الباركود بسهولة"
              : "Manage product catalog, stock levels, variants, and barcode printing."}
        </>
      }
      actions={
        !isCourier && (
          <>
            <Button
              onClick={onCreateNew}
              className="h-9 gap-1.5 px-3 text-xs font-bold shadow-2xs sm:px-3.5"
            >
              <Plus className="h-4 w-4" />
              {isServices
                ? isAr
                  ? "إضافة خدمة"
                  : "Add Service"
                : isAr
                  ? "إضافة منتج"
                  : "Add Product"}
            </Button>

            {renderImporters && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 border-border-strong text-foreground hover:bg-muted"
                    aria-label={isAr ? "خيارات الاستيراد والطباعة" : "Import & Print Options"}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align={isAr ? "start" : "end"}
                  className="w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-border-strong p-1.5 shadow-xl [&_button]:h-auto [&_button]:min-h-9 [&_button]:w-full [&_button]:min-w-0 [&_button]:justify-start [&_button]:whitespace-normal [&_button]:text-start"
                >
                  {renderImporters}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        )
      }
    />
  );
};

/** The count of shoppers waiting for stock: a link to who they are, when the page is known. */
function WaitlistMark({ slug, children }: { slug?: string; children: React.ReactNode }) {
  const className =
    "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20";
  return slug ? (
    <Link
      to="/admin/b/$slug/signups"
      params={{ slug }}
      className={`${className} underline-offset-2 hover:underline`}
    >
      {children}
    </Link>
  ) : (
    <span className={className}>{children}</span>
  );
}
