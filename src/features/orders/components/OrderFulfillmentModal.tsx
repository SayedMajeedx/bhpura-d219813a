import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Package, PackageCheck, CheckSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { generateCourierWhatsAppUrl, recordCourierNotified } from "@/lib/courier-whatsapp";
import { useI18n } from "@/lib/i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getOrderCustomerName, getOrderCustomerPhone } from "@/lib/order-customer-snapshot";

import { DeliveryAddressSnapshot } from "@/features/orders/components/DeliveryAddressSnapshot";
import { useBrandCouriers } from "@/features/orders/hooks/use-brand-couriers";
import { authenticatedJsonHeaders } from "@/features/orders/actions/order-links";
import type { Dispatch, SetStateAction } from "react";

import type { Order } from "@/features/orders/types";
/** Packing checklist and courier/shipping details before an order leaves the store. */
export function OrderFulfillmentModal({
  brandId,
  checkedItems,
  couriersQ,
  fulfillNotes,
  isFulfillModalOpen,
  isFulfilling,
  lang,
  locale,
  qc,
  selectedCourierId,
  selectedFulfillOrder,
  setCheckedItems,
  setFulfillNotes,
  setIsFulfillModalOpen,
  setIsFulfilling,
  setSelectedCourierId,
  slug,
}: {
  brandId: string;
  checkedItems: Record<string, boolean>;
  couriersQ: ReturnType<typeof useBrandCouriers>;
  fulfillNotes: string;
  isFulfillModalOpen: boolean;
  isFulfilling: boolean;
  lang: ReturnType<typeof useI18n>["lang"];
  locale: string;
  qc: ReturnType<typeof useQueryClient>;
  selectedCourierId: string;
  selectedFulfillOrder: Order | null;
  setCheckedItems: Dispatch<SetStateAction<Record<string, boolean>>>;
  setFulfillNotes: Dispatch<SetStateAction<string>>;
  setIsFulfillModalOpen: Dispatch<SetStateAction<boolean>>;
  setIsFulfilling: Dispatch<SetStateAction<boolean>>;
  setSelectedCourierId: Dispatch<SetStateAction<string>>;
  slug: string;
}) {
  return (
    <Dialog open={isFulfillModalOpen} onOpenChange={setIsFulfillModalOpen}>
      <DialogContent
        className="max-w-[calc(100vw-2rem)] sm:max-w-lg bg-background border rounded-2xl shadow-2xl p-6 overflow-hidden max-h-[90vh] flex flex-col"
        dir={lang === "ar" ? "rtl" : "ltr"}
      >
        {selectedFulfillOrder && (
          <>
            {/* Header: Order Number, Customer Name & Address Snapshot */}
            <DialogHeader className="pb-3 border-b shrink-0">
              <div className="flex items-center justify-between gap-2">
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <PackageCheck className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>
                    {lang === "ar"
                      ? `قائمة التعبئة والتجهيز #${selectedFulfillOrder.invoice_number}`
                      : `Packing Slip Verification #${selectedFulfillOrder.invoice_number}`}
                  </span>
                </DialogTitle>
              </div>
              <div className="mt-1 text-xs text-muted-foreground flex flex-col gap-0.5">
                <div className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                  <span>
                    {getOrderCustomerName(selectedFulfillOrder) ||
                      (lang === "ar" ? "عميل زائر" : "Customer")}
                  </span>
                  {getOrderCustomerPhone(selectedFulfillOrder) && (
                    <span className="text-xs font-normal text-muted-foreground">
                      ({getOrderCustomerPhone(selectedFulfillOrder)})
                    </span>
                  )}
                </div>
                <DeliveryAddressSnapshot customer={selectedFulfillOrder.customers} lang={lang} />
              </div>
            </DialogHeader>

            <div className="space-y-4 py-3 overflow-y-auto flex-1 pe-1 text-sm">
              {/* Pick Checklist Header */}
              {(() => {
                const modalItems = selectedFulfillOrder.order_items ?? [];
                const checkedCount = modalItems.filter((it: any) => checkedItems[it.id]).length;
                const allChecked = modalItems.length > 0 && checkedCount === modalItems.length;

                const toggleAll = () => {
                  const nextState = !allChecked;
                  const next: Record<string, boolean> = {};
                  modalItems.forEach((it: any) => {
                    next[it.id] = nextState;
                  });
                  setCheckedItems(next);
                };

                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 bg-muted/40 p-2.5 rounded-xl border">
                      <div className="flex items-center gap-2">
                        <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-semibold text-xs text-foreground">
                          {lang === "ar" ? "قائمة فحص المنتجات" : "Pick & Pack Checklist"}
                        </span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {checkedCount} / {modalItems.length} {lang === "ar" ? "جاهز" : "packed"}
                        </span>
                      </div>
                      {modalItems.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={toggleAll}
                          className="h-7 text-xs font-semibold px-2 text-primary hover:text-primary/90"
                        >
                          {allChecked
                            ? lang === "ar"
                              ? "إلغاء تحديد الكل"
                              : "Uncheck All"
                            : lang === "ar"
                              ? "تحديد الكل"
                              : "Check All"}
                        </Button>
                      )}
                    </div>

                    {/* Items List */}
                    {modalItems.length === 0 ? (
                      <div className="p-4 text-center text-xs text-muted-foreground border rounded-xl bg-muted/20">
                        {lang === "ar"
                          ? "لا توجد تفاصيل منتجات مسجلة لهذا الطلب."
                          : "No item line details recorded for this order."}
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[220px] overflow-y-auto pe-1">
                        {modalItems.map((item: any, idx: number) => {
                          const isChecked = Boolean(checkedItems[item.id]);
                          const imgUrl =
                            item.products?.main_image ||
                            item.products?.image_url ||
                            item.product_variants?.products?.main_image ||
                            item.selected_variant?.image_url;
                          const sku = item.product_variants?.sku || item.sku || null;
                          const title =
                            item.description ||
                            item.products?.title ||
                            (lang === "ar" ? "منتج" : "Product");

                          return (
                            <div
                              key={item.id || idx}
                              onClick={() =>
                                setCheckedItems((prev) => ({
                                  ...prev,
                                  [item.id]: !prev[item.id],
                                }))
                              }
                              className={cn(
                                "flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer select-none",
                                isChecked
                                  ? "bg-emerald-50/80 border-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-800"
                                  : "bg-card border-border hover:border-primary/50",
                              )}
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(checked) =>
                                  setCheckedItems((prev) => ({
                                    ...prev,
                                    [item.id]: Boolean(checked),
                                  }))
                                }
                                onClick={(e) => e.stopPropagation()}
                                className="h-5 w-5 rounded-md border-primary/50"
                              />

                              {imgUrl ? (
                                <img
                                  src={imgUrl}
                                  alt={title}
                                  className="h-10 w-10 object-cover rounded-lg border shrink-0 bg-background"
                                />
                              ) : (
                                <div className="h-10 w-10 rounded-lg border bg-muted/60 flex items-center justify-center shrink-0">
                                  <Package className="h-5 w-5 text-muted-foreground" />
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span
                                    className={cn(
                                      "font-semibold text-xs sm:text-sm truncate",
                                      isChecked && "line-through text-muted-foreground",
                                    )}
                                  >
                                    <span className="font-bold text-primary me-1">
                                      {item.quantity}x
                                    </span>{" "}
                                    {title}
                                  </span>
                                  <span className="text-xs font-mono font-bold shrink-0 text-muted-foreground">
                                    {formatMoney(
                                      Number(item.line_total || item.unit_price * item.quantity),
                                      selectedFulfillOrder.currency || "BHD",
                                      locale,
                                    )}
                                  </span>
                                </div>
                                {sku && (
                                  <div className="text-xs text-muted-foreground font-mono mt-0.5">
                                    SKU: {sku}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Courier & Shipping Details */}
              <div className="space-y-3 pt-2 border-t">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground block">
                    {lang === "ar" ? "تعيين مندوب التوصيل" : "Driver / Courier"}
                  </label>
                  <Select value={selectedCourierId} onValueChange={setSelectedCourierId}>
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={lang === "ar" ? "اختر مندوب التوصيل" : "Select a courier"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">
                        {lang === "ar"
                          ? "غير مسند (تعبئة بدون تعيين)"
                          : "Unassigned (Pack without assigning)"}
                      </SelectItem>
                      {(couriersQ.data ?? []).map((courier: any) => (
                        <SelectItem key={courier.id} value={courier.id}>
                          {courier.name || courier.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground block">
                    {lang === "ar" ? "ملاحظات الشحن أو رقم التتبع" : "Delivery Notes or Tracking"}
                  </label>
                  <Input
                    value={fulfillNotes}
                    onChange={(e) => setFulfillNotes(e.target.value)}
                    placeholder={
                      lang === "ar"
                        ? "أدخل رقم التتبع أو أي تعليمات خاصة للتوصيل..."
                        : "Enter tracking number or special packing notes..."
                    }
                  />
                </div>
              </div>
            </div>

            {/* Primary Action Button Footer */}
            <div className="pt-3 border-t shrink-0 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isFulfilling}
                onClick={() => setIsFulfillModalOpen(false)}
              >
                {lang === "ar" ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                size="sm"
                className={cn(
                  "font-bold shadow-md transition-all px-4",
                  (selectedFulfillOrder.order_items ?? []).every((it: any) => checkedItems[it.id])
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-amber-600 hover:bg-amber-700 text-white",
                )}
                disabled={isFulfilling}
                onClick={async () => {
                  if (!selectedFulfillOrder) return;
                  setIsFulfilling(true);
                  try {
                    const res = await fetch("/api/orders/status", {
                      method: "PATCH",
                      headers: await authenticatedJsonHeaders(),
                      body: JSON.stringify({
                        id: selectedFulfillOrder.id,
                        fulfillment_status: "ASSIGNED",
                        assigned_to: selectedCourierId === "unassigned" ? null : selectedCourierId,
                        delivery_notes: fulfillNotes,
                        admin_override: ["cash", "cod"].includes(
                          String(selectedFulfillOrder.payment_method || "").toLowerCase(),
                        ),
                      }),
                    });
                    const data = await res.json<{ error?: string; error_ar?: string }>();
                    if (!res.ok)
                      throw new Error(data.error_ar && lang === "ar" ? data.error_ar : data.error);
                    toast.success(
                      lang === "ar"
                        ? "تم تأكيد تعبئة الطلب وتجهيزه للشحن!"
                        : "Order packed and dispatched successfully!",
                    );

                    if (selectedCourierId !== "unassigned") {
                      const courierObj = (couriersQ.data ?? []).find(
                        (c: any) => c.id === selectedCourierId,
                      );
                      if (courierObj && courierObj.phone) {
                        const waUrl = generateCourierWhatsAppUrl({
                          order: selectedFulfillOrder,
                          courierPhone: courierObj.phone,
                          courierName: courierObj.name || courierObj.email,
                          brandSlug: slug,
                          lang,
                        });
                        toast(
                          lang === "ar"
                            ? `تم إسناد الطلب إلى "${courierObj.name || "المندوب"}"`
                            : `Assigned to ${courierObj.name || "Courier"}`,
                          {
                            action: {
                              label:
                                lang === "ar" ? "📱 إشعار عبر واتساب" : "📱 Notify on WhatsApp",
                              onClick: async () => {
                                await recordCourierNotified(selectedFulfillOrder.id);
                                qc.invalidateQueries({ queryKey: ["orders", brandId] });
                                window.open(waUrl, "_blank", "noopener,noreferrer");
                              },
                            },
                            duration: 10000,
                          },
                        );
                      }
                    }

                    qc.invalidateQueries({ queryKey: ["orders", brandId] });
                    setIsFulfillModalOpen(false);
                  } catch (err: any) {
                    toast.error(err.message || "Failed to fulfill order");
                  } finally {
                    setIsFulfilling(false);
                  }
                }}
              >
                {isFulfilling ? (
                  <Loader2 className="animate-spin h-4 w-4 me-1.5 inline" />
                ) : (
                  <PackageCheck className="h-4 w-4 me-1.5 inline" />
                )}
                {lang === "ar" ? "تأكيد التعبئة والتجهيز للشحن" : "Confirm Packed & Dispatch"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
