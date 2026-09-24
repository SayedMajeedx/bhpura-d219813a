import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Check, Mail, Truck, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useT, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Order } from "@/features/orders/types";
import { formatDeliveryAddress } from "@/features/orders/lib/order-editor";
import type { Dispatch, SetStateAction } from "react";
import type { OrderDetailData } from "@/features/orders/hooks/use-order-detail-data";

import { OrderFulfillmentPanel } from "@/features/orders/components/OrderFulfillmentPanel";
/** Customer, delivery or pickup details, courier and workflow controls. */
export function OrderCustomerCard({
  addressesQ,
  assignCourier,
  branchesQ,
  couriersQ,
  customerPickerOpen,
  customerSearchQuery,
  customersQ,
  filteredCustomers,
  isAdmin,
  isCreationMode,
  isReadOnly,
  lang,
  order,
  setCustomerPickerOpen,
  setCustomerSearchQuery,
  setNewCustomerOpen,
  setOrder,
  setWaModalOpen,
  settingsQ,
  t,
}: {
  addressesQ: OrderDetailData["addressesQ"];
  assignCourier: (courierId: string) => Promise<unknown>;
  branchesQ: OrderDetailData["branchesQ"];
  couriersQ: OrderDetailData["couriersQ"];
  customerPickerOpen: boolean;
  customerSearchQuery: string;
  customersQ: OrderDetailData["customersQ"];
  filteredCustomers: NonNullable<OrderDetailData["customersQ"]["data"]>;
  isAdmin: boolean;
  isCreationMode: boolean;
  isReadOnly: boolean;
  lang: ReturnType<typeof useI18n>["lang"];
  order: Order;
  setCustomerPickerOpen: Dispatch<SetStateAction<boolean>>;
  setCustomerSearchQuery: Dispatch<SetStateAction<string>>;
  setNewCustomerOpen: Dispatch<SetStateAction<boolean>>;
  setOrder: Dispatch<SetStateAction<Order | null>>;
  setWaModalOpen: Dispatch<SetStateAction<boolean>>;
  settingsQ: OrderDetailData["settingsQ"];
  t: ReturnType<typeof useT>;
}) {
  return (
    <Card
      id="sec-overview"
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-border-subtle bg-card/60 p-4 shadow-sm sm:bg-card sm:p-6 sm:shadow-lg"
    >
      <div className="grid grid-cols-1 gap-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="font-semibold text-sm">{t("orderDetail.customer")}</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs font-semibold text-primary"
              onClick={() => setNewCustomerOpen(true)}
            >
              <Plus className="h-3.5 w-3.5 me-1" />
              {lang === "ar" ? "زبون جديد" : "New Customer"}
            </Button>
          </div>

          <Popover open={customerPickerOpen} onOpenChange={setCustomerPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={customerPickerOpen}
                className="w-full justify-between h-10 px-3 font-normal bg-background hover:bg-muted/40"
              >
                <span className="truncate">
                  {order.customer_id
                    ? (() => {
                        const c = (customersQ.data ?? []).find(
                          (x: any) => x.id === order.customer_id,
                        );
                        return c
                          ? `${c.name}${c.phone ? ` (${c.phone})` : ""}`
                          : t("orderDetail.customer");
                      })()
                    : t("orderDetail.noCustomerOption")}
                </span>
                <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder={
                    lang === "ar"
                      ? "بحث بالاسم أو الهاتف أو البريد..."
                      : "Search customer by name, phone, or email..."
                  }
                  value={customerSearchQuery}
                  onValueChange={setCustomerSearchQuery}
                />
                <CommandList className="max-h-60 overflow-y-auto">
                  <CommandEmpty className="p-3 text-center text-xs text-muted-foreground">
                    {lang === "ar" ? "لم يتم العثور على زبائن" : "No customers found"}
                  </CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="none"
                      onSelect={() => {
                        setOrder({
                          ...order,
                          customer_id: null,
                          shipping_address_id: null,
                        });
                        setCustomerPickerOpen(false);
                        setCustomerSearchQuery("");
                      }}
                      className="cursor-pointer text-xs font-medium text-muted-foreground"
                    >
                      <Check
                        className={cn(
                          "me-2 h-4 w-4",
                          !order.customer_id ? "opacity-100 text-primary" : "opacity-0",
                        )}
                      />
                      {t("orderDetail.noCustomerOption")}
                    </CommandItem>
                    {filteredCustomers.map((c: any) => {
                      const isSelected = order.customer_id === c.id;
                      return (
                        <CommandItem
                          key={c.id}
                          value={c.id}
                          onSelect={() => {
                            const def =
                              (addressesQ.data ?? []).find(
                                (a) => a.customer_id === c.id && a.is_default,
                              ) ?? (addressesQ.data ?? []).find((a) => a.customer_id === c.id);
                            setOrder({
                              ...order,
                              customer_id: c.id,
                              shipping_address_id: def?.id ?? null,
                            });
                            setCustomerPickerOpen(false);
                            setCustomerSearchQuery("");
                          }}
                          className="cursor-pointer text-xs py-2"
                        >
                          <Check
                            className={cn(
                              "me-2 h-4 w-4 shrink-0",
                              isSelected ? "opacity-100 text-primary" : "opacity-0",
                            )}
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-foreground truncate">{c.name}</span>
                            {(c.phone || c.email) && (
                              <span className="text-xs text-muted-foreground font-mono truncate">
                                {[c.phone, c.email].filter(Boolean).join(" • ")}
                              </span>
                            )}
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {order.customer_id &&
        (() => {
          const selected = (customersQ.data ?? []).find((c: any) => c.id === order.customer_id);
          if (!selected) return null;
          const customerAddrs = (addressesQ.data ?? []).filter(
            (a) => a.customer_id === order.customer_id,
          );
          const legacyLines = formatDeliveryAddress(selected, lang);
          return (
            <div className="mt-4 pt-4 border-t border-border text-start">
              <p className="text-xs text-muted-foreground mb-1">
                {order.fulfillment_method === "digital"
                  ? lang === "ar"
                    ? "بيانات العميل"
                    : "Customer details"
                  : t("orderDetail.deliveryAddress")}
              </p>
              <p className="font-medium">{selected.name}</p>
              {selected.email && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 break-all">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <a href={`mailto:${selected.email}`} className="hover:underline">
                    {selected.email}
                  </a>
                </p>
              )}
              {selected.phone && <p className="text-sm text-muted-foreground">{selected.phone}</p>}
              {order.fulfillment_method === "delivery" &&
              legacyLines.length > 0 &&
              customerAddrs.length === 0
                ? legacyLines.map((line, index) => (
                    <p key={index} className="text-sm text-muted-foreground">
                      {line}
                    </p>
                  ))
                : null}
            </div>
          );
        })()}
      <OrderFulfillmentPanel
        addressesQ={addressesQ}
        assignCourier={assignCourier}
        branchesQ={branchesQ}
        couriersQ={couriersQ}
        customersQ={customersQ}
        isAdmin={isAdmin}
        isCreationMode={isCreationMode}
        isReadOnly={isReadOnly}
        lang={lang}
        order={order}
        setOrder={setOrder}
        setWaModalOpen={setWaModalOpen}
        settingsQ={settingsQ}
        t={t}
      />
      <div className="mt-4 grid grid-cols-1 gap-4">
        <div>
          <Label>{t("orderDetail.notes")}</Label>
          <Textarea
            value={order.notes ?? ""}
            onChange={(e) => setOrder({ ...order, notes: e.target.value })}
            rows={3}
            placeholder={lang === "ar" ? "ملاحظات داخلية للطلب" : "Internal order notes"}
          />
        </div>
        <div>
          <Label className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400 font-bold mb-1.5">
            <Truck className="h-4 w-4" />
            {lang === "ar" ? "ملاحظات التوصيل وسجل السائق" : "Courier Delivery Notes & Trace"}
          </Label>
          <Textarea
            value={order.delivery_notes ?? ""}
            onChange={(e) => setOrder({ ...order, delivery_notes: e.target.value })}
            rows={3}
            placeholder={
              lang === "ar" ? "ملاحظات السائق وسجل التوصيل" : "Driver notes and courier logs"
            }
            className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 font-mono text-xs"
          />
        </div>
      </div>
    </Card>
  );
}
