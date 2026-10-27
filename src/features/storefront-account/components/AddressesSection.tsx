import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStorefront } from "@/lib/storefront-context";
import { getFriendlyErrorMessage } from "@/lib/utils";
import {
  createCustomerAddress,
  customersKeys,
  deleteCustomerAddress,
  setDefaultCustomerAddress,
} from "@/lib/data/customers";
import { Card } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, MapPin } from "lucide-react";
import { BAHRAIN_REGIONS } from "@/lib/bahrain-regions";
import { DeliveryAddressCard } from "@/components/delivery-address-card";
import type { Customer, Address } from "@/features/storefront-account/lib/account-shared";
import { emptyAddress } from "@/features/storefront-account/lib/empty-address";

export function AddressesSection({
  isAr,
  lang,
  addresses,
  isLoading,
  customer,
  loadingCustomer,
}: {
  isAr: boolean;
  lang: "ar" | "en";
  addresses?: Address[];
  isLoading: boolean;
  customer: Customer | null | undefined;
  loadingCustomer: boolean;
}) {
  const { t, brand } = useStorefront();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyAddress());
  const [saving, setSaving] = useState(false);

  if (loadingCustomer || isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!customer) {
    return (
      <Card className="p-8 text-center text-muted-foreground bg-card/20 border border-dashed rounded-xl">
        {t(
          "لا يوجد ملف عميل بعد. أكمل أول طلب لتفعيل حفظ العناوين.",
          "No customer profile yet. Place your first order to enable saved addresses.",
        )}
      </Card>
    );
  }

  const addAddress = async () => {
    if (!form.region.trim()) {
      return toast.error(t("المنطقة مطلوبة", "Region is required"));
    }
    setSaving(true);
    try {
      const addressId = await createCustomerAddress(customer.brand_id, {
        customer_id: customer.id,
        user_id: customer.user_id,
        label: form.label.trim() || null,
        region: form.region.trim() || null,
        block: form.block.trim() || null,
        road: form.road.trim() || null,
        house: form.house.trim() || null,
        flat: form.flat.trim() || null,
        floor: form.floor.trim() || null,
        landmark: form.landmark.trim() || null,
        delivery_notes: form.delivery_notes.trim() || null,
        is_default: false,
      });
      // The old default is cleared in the same transaction (bug #17).
      if (form.is_default)
        await setDefaultCustomerAddress(customer.brand_id, customer.id, addressId);
    } catch (error) {
      return toast.error(getFriendlyErrorMessage(error));
    } finally {
      setSaving(false);
      refreshAddresses();
    }
    toast.success(t("تم إضافة العنوان بنجاح", "Address added successfully"));
    setForm(emptyAddress());
    setAdding(false);
  };

  const refreshAddresses = () =>
    qc.invalidateQueries({ queryKey: customersKeys.ownAddresses(customer.brand_id, customer.id) });

  const remove = async (id: string) => {
    try {
      await deleteCustomerAddress(customer.brand_id, customer.id, id);
    } catch (error) {
      return toast.error(getFriendlyErrorMessage(error));
    }
    toast.success(t("تم حذف العنوان بنجاح", "Address deleted successfully"));
    refreshAddresses();
  };

  const setDefault = async (id: string) => {
    try {
      await setDefaultCustomerAddress(customer.brand_id, customer.id, id);
    } catch (error) {
      return toast.error(getFriendlyErrorMessage(error));
    }
    toast.success(t("تم التحديد كعنوان افتراضي", "Set as default shipping destination"));
    refreshAddresses();
  };

  return (
    <div className="space-y-4">
      {(!addresses || addresses.length === 0) && !adding && (
        <Card className="p-10 text-center text-muted-foreground bg-card/20 border border-dashed rounded-xl">
          <MapPin className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="font-semibold text-sm text-foreground">
            {t("لا توجد أي عناوين شحن محفوظة", "No saved addresses")}
          </p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
            {t(
              "لم تحفظ أي عناوين توصيل حتى الآن. أضف عنوانك لتسريع عملية الشراء القادمة.",
              "Add your delivery addresses to streamline your next checkout experience.",
            )}
          </p>
        </Card>
      )}

      {!adding && addresses && addresses.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addresses.map((a) => (
            <Card
              key={a.id}
              className={`p-5 flex flex-col justify-between gap-4 border shadow-xs rounded-xl bg-card transition-all duration-300 ${a.is_default ? "border-primary/40 ring-1 ring-primary/10 bg-primary/[0.01]" : "border-border-strong hover:border-primary/20"}`}
            >
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-semibold text-sm" style={{ color: "var(--sf-heading)" }}>
                    {a.label || t("عنوان توصيل", "Shipping destination")}
                  </span>
                  {a.is_default && (
                    <Badge className="bg-primary/10 text-primary hover:bg-primary/15 border-0 font-bold text-xs px-2.5 py-0.5 rounded-full">
                      {t("عنوان افتراضي", "Default")}
                    </Badge>
                  )}
                </div>
                <DeliveryAddressCard address={a} lang={lang} compact showLabel={false} />
              </div>
              <div className="flex gap-2 justify-end pt-3 border-t border-border-subtle">
                {!a.is_default && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-semibold"
                    onClick={() => setDefault(a.id)}
                  >
                    {t("تعيين افتراضي", "Set default")}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                  onClick={() => remove(a.id)}
                  aria-label={t(
                    `حذف العنوان ${a.label ?? ""}`.trim(),
                    `Delete address ${a.label ?? ""}`.trim(),
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {adding ? (
        <Card className="p-5 sm:p-6 space-y-4 border border-border-strong rounded-xl bg-card">
          <div className="border-b pb-3 mb-2">
            <h3 className="font-semibold text-base" style={{ color: "var(--sf-heading)" }}>
              {t("إضافة عنوان شحن جديد", "New delivery destination")}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t(
                "يرجى إدخال تفاصيل العنوان بدقة لضمان دقة وسرعة التوصيل من خلال المندوب.",
                "Fill in the fields accurately to facilitate quick and accurate delivery mapping.",
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="address-label" className="text-xs font-semibold">
                {t("الاسم (مثال: المنزل، المكتب)", "Label (e.g. Home, Work)")}
              </Label>
              <Input
                id="address-label"
                name="address-label"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Home"
                className="h-11 text-xs mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="address-region" className="text-xs font-semibold">
                {t("المنطقة", "Region")}
              </Label>
              <Select
                name="address-region"
                value={form.region}
                onValueChange={(v) => setForm({ ...form, region: v })}
              >
                <SelectTrigger id="address-region" className="h-11 text-xs mt-1.5">
                  <SelectValue placeholder={t("اختر المنطقة", "Choose region")} />
                </SelectTrigger>
                <SelectContent>
                  {BAHRAIN_REGIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {isAr ? r.ar : r.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="address-block" className="text-xs font-semibold">
                {t("المجمع", "Block")}
              </Label>
              <Input
                id="address-block"
                name="address-block"
                value={form.block}
                onChange={(e) => setForm({ ...form, block: e.target.value })}
                inputMode="numeric"
                className="h-11 text-xs mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="address-road" className="text-xs font-semibold">
                {t("الطريق", "Road")}
              </Label>
              <Input
                id="address-road"
                name="address-road"
                value={form.road}
                onChange={(e) => setForm({ ...form, road: e.target.value })}
                inputMode="numeric"
                className="h-11 text-xs mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="address-house" className="text-xs font-semibold">
                {t("رقم المبنى", "Building")}
              </Label>
              <Input
                id="address-house"
                name="address-house"
                value={form.house}
                onChange={(e) => setForm({ ...form, house: e.target.value })}
                className="h-11 text-xs mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="address-flat" className="text-xs font-semibold">
                {t("رقم الشقة (اختياري)", "Flat (optional)")}
              </Label>
              <Input
                id="address-flat"
                name="address-flat"
                value={form.flat}
                onChange={(e) => setForm({ ...form, flat: e.target.value })}
                className="h-11 text-xs mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="address-floor" className="text-xs font-semibold">
                {t("الطابق (اختياري)", "Floor (optional)")}
              </Label>
              <Input
                id="address-floor"
                name="address-floor"
                value={form.floor}
                onChange={(e) => setForm({ ...form, floor: e.target.value })}
                className="h-11 text-xs mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="address-landmark" className="text-xs font-semibold">
                {t("علامة مميزة (اختياري)", "Landmark (optional)")}
              </Label>
              <Input
                id="address-landmark"
                name="address-landmark"
                value={form.landmark}
                onChange={(e) => setForm({ ...form, landmark: e.target.value })}
                className="h-11 text-xs mt-1.5"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="address-notes" className="text-xs font-semibold">
                {t("ملاحظات التوصيل (اختياري)", "Delivery notes (optional)")}
              </Label>
              <Input
                id="address-notes"
                name="address-notes"
                value={form.delivery_notes}
                onChange={(e) => setForm({ ...form, delivery_notes: e.target.value })}
                className="h-11 text-xs mt-1.5"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold mt-2 select-none cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-border text-primary focus:ring-primary h-4 w-4"
              checked={form.is_default}
              onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
            />
            {t("تعيين كعنوان افتراضي للشحن", "Set as default shipping destination")}
          </label>

          <div className="flex gap-2 pt-3 border-t">
            <Button
              onClick={addAddress}
              disabled={saving}
              className="h-11 text-xs font-semibold px-4 shadow-xs"
            >
              {saving && <Loader2 className="h-4 w-4 me-1 animate-spin" />}
              {t("حفظ العنوان", "Save address")}
            </Button>
            <Button
              variant="ghost"
              className="h-11 text-xs font-semibold px-4"
              onClick={() => {
                setAdding(false);
                setForm(emptyAddress());
              }}
            >
              {t("إلغاء", "Cancel")}
            </Button>
          </div>
        </Card>
      ) : (
        <Button
          variant="outline"
          className="text-xs h-11 px-4 font-semibold gap-1"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-4 w-4" />
          {t("إضافة عنوان شحن جديد", "Add new destination")}
        </Button>
      )}

      <div className="text-xs text-muted-foreground pt-4 border-t">
        <Link
          to="/$slug"
          params={{ slug: brand.slug }}
          className="hover:underline transition-all font-semibold flex items-center gap-1"
          style={{ color: "var(--sf-link)" }}
        >
          {isAr ? "← العودة لتصفح المتجر" : "← Back to browse store"}
        </Link>
      </div>
    </div>
  );
}
