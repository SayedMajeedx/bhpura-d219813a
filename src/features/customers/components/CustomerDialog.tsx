import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useT, useI18n } from "@/lib/i18n";
import { PhoneInput } from "@/components/phone-input";
import { useBrand } from "@/lib/brand-context";
import {
  createCustomer,
  createCustomerAddress,
  customersQueries,
  fetchCustomerIdentities,
  invalidateCustomers,
  updateCustomer,
} from "@/lib/data/customers";
import { invalidateOrders } from "@/lib/data/orders";
import { getFriendlyErrorMessage } from "@/lib/utils";

import { getCurrentUser } from "@/lib/auth/session";
import { oldestFirst } from "@/features/customers/lib/customers-shared";
import type { Customer } from "@/features/customers/lib/customers-shared";
import { AddressFields } from "@/features/customers/components/AddressFields";
import { AddressManager } from "@/features/customers/components/AddressManager";

export function CustomerDialog({
  customer,
  onSaved,
}: {
  customer: Customer | null;
  onSaved: () => void;
}) {
  const t = useT();
  const { lang } = useI18n();
  const qc = useQueryClient();
  const brand = useBrand();
  const [f, setF] = useState({
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
    notes: customer?.notes ?? "",
  });

  // For NEW customers we require one initial address inside the dialog.
  const [initialAddr, setInitialAddr] = useState({
    label: "",
    region: "",
    block: "",
    road: "",
    house: "",
    flat: "",
  });

  useEffect(() => {
    setF({
      name: customer?.name ?? "",
      phone: customer?.phone ?? "",
      email: customer?.email ?? "",
      notes: customer?.notes ?? "",
    });
    setInitialAddr({ label: "", region: "", block: "", road: "", house: "", flat: "" });
  }, [customer]);

  const addressesQ = useQuery({
    ...customersQueries.customerAddresses(brand.id, customer?.id ?? ""),
    select: oldestFirst,
  });

  const save = async () => {
    if (!f.name.trim()) return toast.error(t("customers.name"));
    const user = await getCurrentUser();
    if (!user) return;

    const normalizedPhone = f.phone.replace(/\D/g, "");
    const normalizedEmail = f.email.trim().toLowerCase();
    if (normalizedPhone || normalizedEmail) {
      let phoneRows: Awaited<ReturnType<typeof fetchCustomerIdentities>>;
      try {
        phoneRows = await fetchCustomerIdentities(brand.id);
      } catch (phoneError) {
        return toast.error(getFriendlyErrorMessage(phoneError));
      }
      const duplicatePhone =
        normalizedPhone &&
        (phoneRows ?? []).some(
          (row) =>
            row.id !== customer?.id &&
            String(row.phone ?? "").replace(/\D/g, "") === normalizedPhone,
        );
      const duplicateEmail =
        normalizedEmail &&
        (phoneRows ?? []).some(
          (row) =>
            row.id !== customer?.id &&
            String(row.email ?? "")
              .trim()
              .toLowerCase() === normalizedEmail,
        );
      if (duplicatePhone)
        return toast.error(
          lang === "ar"
            ? "رقم الهاتف مرتبط بملف عميل موجود بالفعل."
            : "A customer with this phone number already exists. Open the existing profile instead.",
        );
      if (duplicateEmail)
        return toast.error(
          lang === "ar"
            ? "البريد الإلكتروني مرتبط بملف عميل موجود بالفعل."
            : "A customer with this email already exists. Open the existing profile instead.",
        );
    }

    if (!customer) {
      const hasAddr = Boolean(
        initialAddr.region.trim() ||
        initialAddr.block.trim() ||
        initialAddr.road.trim() ||
        initialAddr.house.trim(),
      );
      const composedAddress = hasAddr
        ? [
            initialAddr.block && `Block ${initialAddr.block}`,
            initialAddr.road && `Road ${initialAddr.road}`,
            initialAddr.house && `House ${initialAddr.house}`,
            initialAddr.flat && `Flat ${initialAddr.flat}`,
          ]
            .filter(Boolean)
            .join(" · ")
        : null;
      try {
        const created = await createCustomer(brand.id, {
          name: f.name.trim(),
          phone: normalizedPhone || null,
          email: normalizedEmail || null,
          notes: f.notes,
          brand_id: brand.id,
          region: initialAddr.region.trim() || null,
          block: initialAddr.block.trim() || null,
          road: initialAddr.road.trim() || null,
          house: initialAddr.house.trim() || null,
          flat: initialAddr.flat.trim() || null,
          city: initialAddr.region.trim() || null,
          address: composedAddress,
          user_id: user.id,
        });

        if (hasAddr) {
          await createCustomerAddress(brand.id, {
            user_id: user.id,
            customer_id: created.id,
            label: initialAddr.label || "Primary",
            region: initialAddr.region.trim() || null,
            block: initialAddr.block.trim() || null,
            road: initialAddr.road.trim() || null,
            house: initialAddr.house.trim() || null,
            flat: initialAddr.flat.trim() || null,
            is_default: true,
          });
        }
      } catch (error) {
        return toast.error(getFriendlyErrorMessage(error) || "Failed");
      }
    } else {
      try {
        await updateCustomer(brand.id, customer.id, {
          name: f.name.trim(),
          phone: normalizedPhone || null,
          email: normalizedEmail || null,
          notes: f.notes,
        });
      } catch (error) {
        return toast.error(getFriendlyErrorMessage(error));
      }
    }
    toast.success(t("common.save"));
    void invalidateCustomers(qc, brand.id);
    void invalidateOrders(qc, brand.id);
    onSaved();
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{customer ? t("customers.editTitle") : t("customers.newTitle")}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>
            {t("customers.name")} <span className="text-destructive">*</span>
          </Label>
          <Input
            className="text-start"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>{t("customers.phone")}</Label>
            <PhoneInput value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
          </div>
          <div>
            <Label>{t("customers.email")}</Label>
            <Input
              className="text-start"
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
            />
          </div>
        </div>
        <div>
          <Label>{t("customers.notes")}</Label>
          <Textarea
            className="text-start"
            value={f.notes}
            onChange={(e) => setF({ ...f, notes: e.target.value })}
          />
        </div>

        <div className="pt-3 border-t border-border">
          <h3 className="font-medium mb-2">{t("customers.addresses")}</h3>
          {!customer ? (
            <AddressFields value={initialAddr} onChange={setInitialAddr} lang={lang} />
          ) : (
            <AddressManager
              customerId={customer.id}
              addresses={addressesQ.data ?? []}
              lang={lang}
            />
          )}
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save}>{t("common.save")}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
