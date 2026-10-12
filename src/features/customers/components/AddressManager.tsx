import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Pencil, Plus, Star, Check } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { formatAddressLine, type StructuredAddress } from "@/lib/bahrain-regions";
import { useBrand } from "@/lib/brand-context";
import {
  createCustomerAddress,
  customersKeys,
  deleteCustomerAddress,
  setDefaultCustomerAddress,
  updateCustomerAddress,
} from "@/lib/data/customers";
import { invalidateOrders } from "@/lib/data/orders";
import { getFriendlyErrorMessage } from "@/lib/utils";

import { getCurrentUser } from "@/lib/auth/session";
import type { Address } from "@/features/customers/lib/customers-shared";
import { DeleteAction } from "@/features/customers/components/DeleteAction";
import { AddressFields } from "@/features/customers/components/AddressFields";

export function AddressManager({
  customerId,
  addresses,
  lang,
}: {
  customerId: string;
  addresses: Address[];
  lang: "en" | "ar";
}) {
  const t = useT();
  const qc = useQueryClient();
  const brandId = useBrand().id;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    label: "",
    region: "",
    block: "",
    road: "",
    house: "",
    flat: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: customersKeys.addresses(brandId) });
    void invalidateOrders(qc, brandId);
  };

  const setDefault = async (id: string) => {
    try {
      await setDefaultCustomerAddress(brandId, customerId, id);
    } catch (error) {
      return toast.error(getFriendlyErrorMessage(error));
    }
    toast.success(t("customers.setDefault"));
    invalidate();
  };

  const remove = async (id: string) => {
    try {
      await deleteCustomerAddress(brandId, customerId, id);
    } catch (error) {
      return toast.error(getFriendlyErrorMessage(error));
    }
    invalidate();
  };

  const saveDraft = async () => {
    if (!draft.region.trim() || !draft.block.trim() || !draft.road.trim() || !draft.house.trim()) {
      return toast.error(t("customers.requiredError"));
    }
    const user = await getCurrentUser();
    if (!user) return;
    const payload = {
      user_id: user.id,
      customer_id: customerId,
      label: draft.label || null,
      region: draft.region,
      block: draft.block,
      road: draft.road,
      house: draft.house,
      flat: draft.flat || null,
    };
    try {
      if (editingId) {
        await updateCustomerAddress(brandId, customerId, editingId, payload);
      } else {
        const shouldBeDefault = addresses.length === 0;
        await createCustomerAddress(brandId, { ...payload, is_default: shouldBeDefault });
      }
    } catch (error) {
      return toast.error(getFriendlyErrorMessage(error));
    }
    setAdding(false);
    setEditingId(null);
    setDraft({ label: "", region: "", block: "", road: "", house: "", flat: "" });
    invalidate();
  };

  const startEdit = (a: Address) => {
    setEditingId(a.id);
    setAdding(true);
    setDraft({
      label: a.label ?? "",
      region: a.region ?? "",
      block: a.block ?? "",
      road: a.road ?? "",
      house: a.house ?? "",
      flat: a.flat ?? "",
    });
  };

  return (
    <div className="space-y-3">
      {addresses.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground italic">{t("customers.noAddresses")}</p>
      )}
      <ul className="space-y-2">
        {addresses.map((a) => (
          <li key={a.id} className="flex items-start gap-2 border border-border rounded-md p-3">
            <div className="flex-1 min-w-0 text-start">
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">{a.label || t("customers.address")}</p>
                {a.is_default && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1">
                    <Star className="h-3 w-3" /> {t("customers.default")}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {formatAddressLine(a as StructuredAddress, lang) || "—"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {!a.is_default && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDefault(a.id)}
                  title={t("customers.setDefault")}
                >
                  <Check className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => startEdit(a)}
                aria-label={lang === "ar" ? "تعديل العنوان" : "Edit address"}
                title={lang === "ar" ? "تعديل العنوان" : "Edit address"}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <DeleteAction
                message={t("customers.deleteAddressConfirm")}
                onConfirm={() => remove(a.id)}
              />
            </div>
          </li>
        ))}
      </ul>
      {adding ? (
        <div className="border border-border rounded-md p-3 space-y-3">
          <AddressFields value={draft} onChange={setDraft} lang={lang} />
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAdding(false);
                setEditingId(null);
                setDraft({ label: "", region: "", block: "", road: "", house: "", flat: "" });
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={saveDraft}>
              {t("common.save")}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 me-1" /> {t("customers.addAddress")}
        </Button>
      )}
    </div>
  );
}
