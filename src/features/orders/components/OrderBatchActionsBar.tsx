import { Button } from "@/components/ui/button";
import { Trash2, Truck, Package, CheckSquare, Square } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

import { useBrandCouriers } from "@/features/orders/hooks/use-brand-couriers";
import type { Dispatch, SetStateAction } from "react";

import type { Order } from "@/features/orders/types";
/** Selection bar for admins: select all, delete, change fulfillment status and assign a courier in bulk. */
export function OrderBatchActionsBar({
  allFilteredOrdersSelected,
  couriersQ,
  handleBatchAssignCourier,
  handleBatchFulfillmentUpdate,
  isBatchUpdating,
  lang,
  selectedOrderIds,
  setBulkDeleteOpen,
  setSelectedOrderIds,
  sortedOrders,
}: {
  allFilteredOrdersSelected: boolean;
  couriersQ: ReturnType<typeof useBrandCouriers>;
  handleBatchAssignCourier: (courierId: string) => Promise<unknown>;
  handleBatchFulfillmentUpdate: (
    newFulfillmentStatus: string,
    newOrderStatus?: string,
  ) => Promise<unknown>;
  isBatchUpdating: boolean;
  lang: ReturnType<typeof useI18n>["lang"];
  selectedOrderIds: Set<string>;
  setBulkDeleteOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedOrderIds: Dispatch<SetStateAction<Set<string>>>;
  sortedOrders: Order[];
}) {
  return (
    <div
      className={cn(
        "flex-col gap-2 rounded-xl border border-border-strong bg-card p-3 shadow-sm sm:flex sm:flex-row sm:items-center sm:justify-between",
        selectedOrderIds.size > 0 ? "flex" : "hidden",
      )}
    >
      <div className="flex items-center gap-2 text-xs font-semibold">
        <CheckSquare className="h-4 w-4 text-primary" />
        <span>
          {lang === "ar"
            ? `${selectedOrderIds.size} طلب محدد`
            : `${selectedOrderIds.size} selected`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={allFilteredOrdersSelected}
          onClick={() => setSelectedOrderIds(new Set(sortedOrders.map((order) => order.id)))}
        >
          <CheckSquare className="h-3.5 w-3.5" />
          {lang === "ar" ? "تحديد الكل" : "Select all"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={selectedOrderIds.size === 0}
          onClick={() => setSelectedOrderIds(new Set())}
        >
          <Square className="h-3.5 w-3.5" />
          {lang === "ar" ? "إلغاء تحديد الكل" : "Deselect all"}
        </Button>
        {selectedOrderIds.size > 0 && (
          <>
            {/* Batch Fulfillment Status Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isBatchUpdating}
                  className="h-8 gap-1.5 text-xs font-semibold"
                >
                  <Package className="h-3.5 w-3.5 text-primary" />
                  {lang === "ar" ? "تحديث حالة التجهيز" : "Update fulfillment"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  onClick={() => handleBatchFulfillmentUpdate("PACKING")}
                  className="text-xs cursor-pointer"
                >
                  {lang === "ar" ? "قيد التجهيز والتغليف" : "Mark as Packing"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleBatchFulfillmentUpdate("READY_FOR_PICKUP")}
                  className="text-xs cursor-pointer"
                >
                  {lang === "ar" ? "جاهز للتسليم / للشحن" : "Ready for pickup / dispatch"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleBatchFulfillmentUpdate("OUT_FOR_DELIVERY")}
                  className="text-xs cursor-pointer"
                >
                  {lang === "ar" ? "خرج مع المندوب للتوصيل" : "Out for delivery"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleBatchFulfillmentUpdate("COMPLETED", "completed")}
                  className="text-xs cursor-pointer font-semibold text-emerald-600 dark:text-emerald-400"
                >
                  {lang === "ar" ? "اكتمال وتسليم الطلب" : "Mark as Completed"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Batch Assign Courier Dropdown */}
            {(couriersQ.data?.length ?? 0) > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isBatchUpdating}
                    className="h-8 gap-1.5 text-xs font-semibold"
                  >
                    <Truck className="h-3.5 w-3.5 text-blue-600" />
                    {lang === "ar" ? "تعيين المندوب" : "Assign courier"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {(couriersQ.data ?? []).map((courier: any) => (
                    <DropdownMenuItem
                      key={courier.id}
                      onClick={() => handleBatchAssignCourier(courier.id)}
                      className="text-xs cursor-pointer"
                    >
                      {courier.name || courier.email}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-8 gap-1.5 text-xs font-semibold"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {lang === "ar"
                ? `حذف المحدد (${selectedOrderIds.size})`
                : `Delete selected (${selectedOrderIds.size})`}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
