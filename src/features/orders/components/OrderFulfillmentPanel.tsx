import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatNotifiedTimeAgo } from "@/lib/courier-whatsapp";
import { formatMoney } from "@/lib/format";
import { useT, useI18n } from "@/lib/i18n";
import { formatAddressLine, type StructuredAddress } from "@/lib/bahrain-regions";
import { DeliveryAddressCard } from "@/components/delivery-address-card";
import { getFulfillmentLabel } from "@/lib/status-labels";
import type { Order } from "@/features/orders/types";
import { formatDeliveryAddress } from "@/features/orders/lib/order-editor";
import { BhdFeeInput } from "@/features/orders/components/BhdFeeInput";
import type { Dispatch, SetStateAction } from "react";
import type { OrderDetailData } from "@/features/orders/hooks/use-order-detail-data";

/** How the order reaches the customer: delivery address and courier, pickup branch, or digital channel. */
export function OrderFulfillmentPanel({
  addressesQ,
  assignCourier,
  branchesQ,
  couriersQ,
  customersQ,
  isAdmin,
  isCreationMode,
  isReadOnly,
  lang,
  order,
  setOrder,
  setWaModalOpen,
  settingsQ,
  t,
}: {
  addressesQ: OrderDetailData["addressesQ"];
  assignCourier: (courierId: string) => Promise<unknown>;
  branchesQ: OrderDetailData["branchesQ"];
  couriersQ: OrderDetailData["couriersQ"];
  customersQ: OrderDetailData["customersQ"];
  isAdmin: boolean;
  isCreationMode: boolean;
  isReadOnly: boolean;
  lang: ReturnType<typeof useI18n>["lang"];
  order: Order;
  setOrder: Dispatch<SetStateAction<Order | null>>;
  setWaModalOpen: Dispatch<SetStateAction<boolean>>;
  settingsQ: OrderDetailData["settingsQ"];
  t: ReturnType<typeof useT>;
}) {
  const method = order.fulfillment_method ?? "delivery";
  const deliveryEnabled = Boolean((settingsQ.data as any).delivery_enabled);
  const pickupEnabled = Boolean((settingsQ.data as any).pickup_enabled);
  const digitalEnabled = Boolean((settingsQ.data as any).digital_delivery_enabled);
  const defaultDeliveryFee = Number((settingsQ.data as any).delivery_fee ?? 0);
  const selectedCustomer = (customersQ.data ?? []).find((c: any) => c.id === order.customer_id);
  const selectedAddress = (addressesQ.data ?? []).find((a) => a.id === order.shipping_address_id);
  const storedAddressSnapshot = order.delivery_address_snapshot as StructuredAddress | null;
  const snapshotMatchesSavedSelection =
    storedAddressSnapshot &&
    (!order.shipping_address_id ||
      !storedAddressSnapshot.id ||
      storedAddressSnapshot.id === order.shipping_address_id);
  const addressSnapshot =
    (snapshotMatchesSavedSelection ? storedAddressSnapshot : null) ??
    selectedAddress ??
    storedAddressSnapshot ??
    (selectedCustomer as StructuredAddress | null);
  const selectedBranch = (branchesQ.data ?? []).find((b: any) => b.id === order.branch_id);
  const address = selectedAddress
    ? formatAddressLine(selectedAddress as StructuredAddress, lang)
    : formatDeliveryAddress(selectedCustomer, lang).join("، ");
  const branchName = selectedBranch
    ? lang === "ar"
      ? selectedBranch.name_ar || selectedBranch.name_en
      : selectedBranch.name_en || selectedBranch.name_ar
    : null;
  const branchLocation = selectedBranch
    ? lang === "ar"
      ? selectedBranch.location_ar || selectedBranch.location_en
      : selectedBranch.location_en || selectedBranch.location_ar
    : null;
  const customerAddresses = (addressesQ.data ?? []).filter(
    (item) => item.customer_id === order.customer_id,
  );
  const defaultAddress =
    customerAddresses.find((item) => item.is_default) ?? customerAddresses[0] ?? null;
  const title =
    method === "digital"
      ? lang === "ar"
        ? "تسليم رقمي"
        : "Digital delivery"
      : method === "pickup"
        ? lang === "ar"
          ? "استلام"
          : "Pickup"
        : lang === "ar"
          ? "توصيل"
          : "Delivery";
  return (
    <div className="mt-5 overflow-hidden rounded-xl border bg-muted/20 text-start shadow-sm">
      <div className="flex flex-col gap-2.5 border-b bg-muted/50 px-4 py-3">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">
            {lang === "ar" ? "طريقة التسليم" : "FULFILLMENT"}
          </p>
          <p className="text-base font-semibold leading-tight text-foreground mt-0.5">{title}</p>
        </div>
        <div className="w-full">
          <Label className="sr-only">
            {lang === "ar" ? "طريقة التسليم" : "Fulfillment method"}
          </Label>
          <Select
            value={method}
            onValueChange={(value) =>
              setOrder({
                ...order,
                fulfillment_method: value,
                branch_id: value === "pickup" ? (order.branch_id ?? null) : null,
                shipping_address_id:
                  value === "delivery"
                    ? (order.shipping_address_id ?? defaultAddress?.id ?? null)
                    : null,
                shipping:
                  value === "delivery"
                    ? isCreationMode
                      ? defaultDeliveryFee
                      : Number(order.shipping ?? defaultDeliveryFee)
                    : 0,
              })
            }
          >
            <SelectTrigger className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(pickupEnabled || method === "pickup") && (
                <SelectItem value="pickup">{lang === "ar" ? "استلام" : "Pickup"}</SelectItem>
              )}
              {(deliveryEnabled || method === "delivery") && (
                <SelectItem value="delivery">
                  {lang === "ar" ? "توصيل للمنزل" : "Home Delivery"}
                </SelectItem>
              )}
              {(digitalEnabled || method === "digital") && (
                <SelectItem value="digital">
                  {lang === "ar" ? "تسليم رقمي" : "Digital Delivery"}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="p-4">
        {method === "delivery" && isAdmin && (
          <div className="mb-4 space-y-3 rounded-lg border bg-background p-3">
            <Label>{lang === "ar" ? "مندوب التوصيل المسند" : "Assigned courier"}</Label>
            <Select value={order.assigned_to ?? "unassigned"} onValueChange={assignCourier}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">
                  {lang === "ar" ? "غير مسند" : "Unassigned"}
                </SelectItem>
                {(couriersQ.data ?? []).map((courier: any) => (
                  <SelectItem key={courier.id} value={courier.id}>
                    {courier.name || courier.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(() => {
              if (!order.assigned_to) return null;
              const assignedCourierObj = (couriersQ.data ?? []).find(
                (c: any) => c.id === order.assigned_to,
              );
              const notifiedAgo = formatNotifiedTimeAgo(order.courier_notified_at, lang);
              return (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {notifiedAgo ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800 text-xs font-bold px-2.5 py-1">
                        🔔{" "}
                        {lang === "ar" ? `تم الإشعار (${notifiedAgo})` : `Notified ${notifiedAgo}`}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800 text-xs font-bold px-2.5 py-1">
                        ⏳{" "}
                        {lang === "ar"
                          ? "لم يتم الإشعار عبر واتساب بعد"
                          : "WhatsApp notification pending"}
                      </span>
                    )}

                    <Button
                      type="button"
                      size="sm"
                      className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 shadow-sm flex items-center gap-1.5"
                      onClick={() => setWaModalOpen(true)}
                    >
                      📱{" "}
                      {lang === "ar"
                        ? `إشعار ${assignedCourierObj?.name ? assignedCourierObj.name.split(" ")[0] : "المندوب"} عبر واتساب`
                        : `Notify ${assignedCourierObj?.name ? assignedCourierObj.name.split(" ")[0] : "Courier"} on WhatsApp`}
                    </Button>
                  </div>
                </div>
              );
            })()}

            <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
              <span className="text-muted-foreground">
                {lang === "ar" ? "حالة التوصيل:" : "Delivery status:"}
              </span>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary">
                {getFulfillmentLabel(order.fulfillment_status, lang)}
              </span>
              {order.payment_method === "cod" && (
                <span
                  className={`rounded-full px-2.5 py-1 font-medium ${order.cod_collected_at ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                >
                  {order.cod_collected_at
                    ? `${lang === "ar" ? "تم استلام النقد" : "Cash received"}: ${formatMoney(Number(order.cod_collected_amount || 0), order.currency || "BHD")}`
                    : lang === "ar"
                      ? "النقد بانتظار التحصيل"
                      : "Cash collection pending"}
                </span>
              )}
            </div>
          </div>
        )}
        {method === "digital" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>{lang === "ar" ? "قناة التسليم" : "Delivery channel"}</Label>
              <Select
                value={order.digital_delivery_channel ?? "email"}
                onValueChange={(value) => setOrder({ ...order, digital_delivery_channel: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">
                    {lang === "ar" ? "البريد الإلكتروني" : "Email"}
                  </SelectItem>
                  <SelectItem value="whatsapp">{lang === "ar" ? "واتساب" : "WhatsApp"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>
                {order.digital_delivery_channel === "whatsapp"
                  ? lang === "ar"
                    ? "رقم أو معرّف واتساب"
                    : "WhatsApp number or user ID"
                  : lang === "ar"
                    ? "البريد الإلكتروني"
                    : "Email address"}
              </Label>
              <Input
                dir="ltr"
                value={order.digital_delivery_contact ?? ""}
                onChange={(e) => setOrder({ ...order, digital_delivery_contact: e.target.value })}
              />
            </div>
          </div>
        ) : method === "pickup" ? (
          <div className="space-y-2">
            <Label>{lang === "ar" ? "فرع الاستلام" : "Pickup location"}</Label>
            <Select
              value={order.branch_id ?? ""}
              onValueChange={(branchId) => setOrder({ ...order, branch_id: branchId })}
            >
              <SelectTrigger className="text-start">
                <SelectValue placeholder={lang === "ar" ? "اختر الفرع" : "Select a branch"} />
              </SelectTrigger>
              <SelectContent>
                {(branchesQ.data ?? []).map((branch: any) => {
                  const name =
                    lang === "ar"
                      ? branch.name_ar || branch.name_en
                      : branch.name_en || branch.name_ar;
                  const location =
                    lang === "ar"
                      ? branch.location_ar || branch.location_en
                      : branch.location_en || branch.location_ar;
                  return (
                    <SelectItem key={branch.id} value={branch.id}>
                      {name}
                      {location ? ` — ${location}` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedBranch && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{branchName}</span>
                {branchLocation ? ` — ${branchLocation}` : ""}
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>{lang === "ar" ? "عنوان التوصيل" : "Delivery address"}</Label>
                {defaultAddress && (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => setOrder({ ...order, shipping_address_id: defaultAddress.id })}
                  >
                    {lang === "ar" ? "استخدام عنوان ملف العميل" : "Use Customer Profile Address"}
                  </button>
                )}
              </div>
              <Select
                value={order.shipping_address_id ?? ""}
                onValueChange={(addressId) =>
                  setOrder({ ...order, shipping_address_id: addressId })
                }
              >
                <SelectTrigger className="text-start">
                  <SelectValue placeholder={lang === "ar" ? "اختر عنواناً" : "Select an address"} />
                </SelectTrigger>
                <SelectContent>
                  {customerAddresses.map((savedAddress) => (
                    <SelectItem key={savedAddress.id} value={savedAddress.id}>
                      {savedAddress.label || t("customers.address")}
                      {savedAddress.is_default ? " ★" : ""} —{" "}
                      {formatAddressLine(savedAddress as StructuredAddress, lang) || "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {addressSnapshot && (
                <DeliveryAddressCard
                  address={addressSnapshot}
                  lang={lang}
                  compact
                  showLabel={false}
                />
              )}
              <p className="hidden text-sm text-muted-foreground">
                {address ||
                  (lang === "ar"
                    ? "لا يوجد عنوان توصيل محفوظ لهذا العميل"
                    : "No saved delivery address for this customer")}
              </p>
            </div>
            <div>
              <Label>{lang === "ar" ? "رسوم التوصيل" : "Delivery fee"}</Label>
              <BhdFeeInput
                value={Number(order.shipping ?? 0)}
                disabled={isReadOnly}
                onChange={(shipping) => setOrder({ ...order, shipping })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {formatMoney(Number(order.shipping ?? 0), order.currency ?? "BHD")}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
