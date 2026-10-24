import React from "react";
import { ReceiptText, Plus, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminPageCount, AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { countOf } from "@/lib/arabic-count";

interface OrdersCommandHeaderProps {
  lang: "en" | "ar";
  filteredCount: number;
  isCourier: boolean;
  onCreateNew: () => void;
  renderImporter?: React.ReactNode;
  /** A services store: its orders are bookings, not parcels to pack and dispatch. */
  isServices?: boolean;
}

export const OrdersCommandHeader: React.FC<OrdersCommandHeaderProps> = ({
  lang,
  filteredCount,
  isCourier,
  onCreateNew,
  renderImporter,
  isServices = false,
}) => {
  const isAr = lang === "ar";

  return (
    <AdminPageHeader
      icon={ReceiptText}
      headingProps={{ "data-route-heading": "orders", tabIndex: -1 }}
      title={<>{isAr ? "الطلبات والفواتير" : "Orders & Invoices"}</>}
      badges={
        <>
          <AdminPageCount>{countOf(filteredCount, "order", isAr ? "ar" : "en")}</AdminPageCount>
        </>
      }
      description={
        <>
          {isServices
            ? isAr
              ? "متابعة الحجوزات والدفعات، والمواعيد التي حان وقت إنجازها"
              : "Follow bookings and payments, and the appointments that are due."
            : isAr
              ? "متابعة الطلبات، حالة الدفع والتسليم والتوصيل"
              : "Focus on the next order requiring payment, packing, or courier dispatch."}
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
              {isAr ? "طلب جديد" : "New Order"}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 border-border-strong text-foreground hover:bg-muted"
                  aria-label={isAr ? "خيارات إضافية" : "More options"}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isAr ? "start" : "end"} className="w-48">
                <DropdownMenuItem asChild className="p-0">
                  <div className="w-full">{renderImporter}</div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )
      }
    />
  );
};
