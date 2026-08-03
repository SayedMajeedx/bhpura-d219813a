import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, MapPin, Pencil, Plus, Trash2, Star, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { DeliveryAddressCard } from "@/components/delivery-address-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export type ManagedCustomerAddress = {
  id: string;
  label: string | null;
  region: string | null;
  block: string | null;
  road: string | null;
  house: string | null;
  flat: string | null;
  floor: string | null;
  landmark: string | null;
  delivery_notes: string | null;
  is_default: boolean;
};

type AddressForm = {
  label: string;
  block: string;
  road: string;
  house: string;
  flat: string;
  floor: string;
  landmark: string;
  region: string;
  delivery_notes: string;
};

const EMPTY_FORM: AddressForm = {
  label: "",
  block: "",
  road: "",
  house: "",
  flat: "",
  floor: "",
  landmark: "",
  region: "",
  delivery_notes: "",
};

export function CustomerAddressManager({
  addresses,
  loading,
  customerId,
  brandId,
  lang,
  onChanged,
}: {
  addresses: ManagedCustomerAddress[];
  loading: boolean;
  customerId: string;
  brandId: string;
  lang: "en" | "ar";
  onChanged: () => void;
}) {
  const isAr = lang === "ar";
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedCustomerAddress | null>(null);
  const [deleting, setDeleting] = useState<ManagedCustomerAddress | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [form, setForm] = useState<AddressForm>(EMPTY_FORM);

  useEffect(() => {
    if (addresses.length > 0) {
      const defaultId = addresses.find((a) => a.is_default)?.id || addresses[0]?.id;
      if (defaultId && (!selectedAddressId || !addresses.some((a) => a.id === selectedAddressId))) {
        setSelectedAddressId(defaultId);
      }
    }
  }, [addresses]);

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            label: editing.label ?? "",
            block: editing.block ?? "",
            road: editing.road ?? "",
            house: editing.house ?? "",
            flat: editing.flat ?? "",
            floor: editing.floor ?? "",
            landmark: editing.landmark ?? "",
            region: editing.region ?? "",
            delivery_notes: editing.delivery_notes ?? "",
          }
        : EMPTY_FORM,
    );
  }, [editing, open]);

  const startAdd = () => {
    setEditing(null);
    setOpen(true);
  };

  const startEdit = (address: ManagedCustomerAddress) => {
    setEditing(address);
    setOpen(true);
  };

  const save = async () => {
    if (
      !form.label.trim() ||
      !form.region.trim() ||
      !form.block.trim() ||
      !form.road.trim() ||
      !form.house.trim()
    ) {
      return toast.error(
        isAr
          ? "يرجى تعبئة اسم العنوان والمنطقة والمجمع والطريق والمبنى."
          : "Label, city/area, block, road, and building/house are required.",
      );
    }

    setSaving(true);
    const payload = {
      label: form.label.trim(),
      region: form.region.trim(),
      block: form.block.trim(),
      road: form.road.trim(),
      house: form.house.trim(),
      flat: form.flat.trim() || null,
      floor: form.floor.trim() || null,
      landmark: form.landmark.trim() || null,
      delivery_notes: form.delivery_notes.trim() || null,
    };

    let error: { message: string } | null = null;
    if (editing) {
      const result = await (supabase.from("customer_addresses") as any)
        .update(payload)
        .eq("id", editing.id)
        .eq("customer_id", customerId)
        .eq("brand_id", brandId);
      error = result.error;
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setSaving(false);
        return toast.error(
          isAr
            ? "انتهت جلسة الدخول. يرجى تسجيل الدخول مجدداً."
            : "Your session has expired. Please sign in again.",
        );
      }
      const normalizeVal = (v: string | null | undefined) => String(v || "").trim().toLowerCase();
      const existingDup = addresses.find(
        (a) =>
          normalizeVal(a.region) === normalizeVal(payload.region) &&
          normalizeVal(a.block) === normalizeVal(payload.block) &&
          normalizeVal(a.road) === normalizeVal(payload.road) &&
          normalizeVal(a.house) === normalizeVal(payload.house) &&
          normalizeVal(a.flat) === normalizeVal(payload.flat),
      );

      if (existingDup) {
        // Update existing address instead of creating a duplicate row!
        const result = await (supabase.from("customer_addresses") as any)
          .update(payload)
          .eq("id", existingDup.id)
          .eq("customer_id", customerId)
          .eq("brand_id", brandId);
        error = result.error;
      } else {
        const result = await (supabase.from("customer_addresses") as any).insert({
          ...payload,
          user_id: user.id,
          brand_id: brandId,
          customer_id: customerId,
          is_default: addresses.length === 0,
        });
        error = result.error;
      }
    }

    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(
      editing
        ? isAr
          ? "تم تحديث العنوان"
          : "Address updated"
        : isAr
          ? "تمت إضافة العنوان"
          : "Address added",
    );
    setOpen(false);
    setEditing(null);
    onChanged();
  };

  const remove = async () => {
    if (!deleting) return;
    const wasDefault = deleting.is_default;
    const { error } = await supabase
      .from("customer_addresses")
      .delete()
      .eq("id", deleting.id)
      .eq("customer_id", customerId)
      .eq("brand_id", brandId);
    if (error) return toast.error(error.message);

    if (wasDefault) {
      const replacement = addresses.find((address) => address.id !== deleting.id);
      if (replacement) {
        const { error: defaultError } = await supabase
          .from("customer_addresses")
          .update({ is_default: true })
          .eq("id", replacement.id)
          .eq("customer_id", customerId)
          .eq("brand_id", brandId);
        if (defaultError) toast.error(defaultError.message);
      }
    }

    toast.success(isAr ? "تم حذف العنوان" : "Address deleted");
    setDeleting(null);
    onChanged();
  };

  const makeDefault = async (targetId: string) => {
    setSaving(true);
    try {
      await supabase
        .from("customer_addresses")
        .update({ is_default: false })
        .eq("customer_id", customerId)
        .eq("brand_id", brandId);

      const { error } = await supabase
        .from("customer_addresses")
        .update({ is_default: true })
        .eq("id", targetId)
        .eq("customer_id", customerId)
        .eq("brand_id", brandId);

      if (error) throw error;

      toast.success(isAr ? "تم تعيين العنوان كعنوان افتراضي" : "Set as default address");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Error updating default address");
    } finally {
      setSaving(false);
    }
  };

  const deduplicateAddresses = async () => {
    if (addresses.length <= 1) return;
    setSaving(true);
    try {
      const normalizeStr = (s: string | null | undefined) => String(s || "").trim().toLowerCase();
      const map = new Map<string, ManagedCustomerAddress[]>();

      for (const addr of addresses) {
        const key = `${normalizeStr(addr.region)}|${normalizeStr(addr.block)}|${normalizeStr(addr.road)}|${normalizeStr(addr.house)}|${normalizeStr(addr.flat)}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(addr);
      }

      let duplicateCount = 0;
      for (const [, group] of map) {
        if (group.length > 1) {
          group.sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));
          const primary = group[0];
          const duplicates = group.slice(1);

          for (const dup of duplicates) {
            duplicateCount++;
            await supabase
              .from("orders")
              .update({ shipping_address_id: primary.id })
              .eq("shipping_address_id", dup.id);

            await supabase
              .from("customer_addresses")
              .delete()
              .eq("id", dup.id);
          }
        }
      }

      if (duplicateCount > 0) {
        toast.success(
          isAr
            ? `تم تنظيف ${duplicateCount} عنوان مكرر بنجاح!`
            : `Cleaned up ${duplicateCount} duplicate address${duplicateCount > 1 ? "es" : ""}!`,
        );
        onChanged();
      } else {
        toast.info(isAr ? "لا توجد عناوين مكررة لتنظيفها" : "No duplicate addresses found");
      }
    } catch (e: any) {
      toast.error(e.message || "Error cleaning up duplicates");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg">{isAr ? "عناوين التوصيل" : "Delivery Addresses"}</h2>
        </div>
        <div className="flex items-center gap-2">
          {addresses.length > 1 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={deduplicateAddresses}
              className="h-8 text-xs font-bold gap-1 text-amber-700 dark:text-amber-300 border-amber-300/60 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg"
              title={isAr ? "دمج وتنظيف العناوين المكررة تلقائياً" : "Merge and clean duplicate addresses automatically"}
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <span>{isAr ? "تنظيف المكررات" : "Deduplicate"}</span>
            </Button>
          )}
          {addresses.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={startAdd}>
              <Plus className="h-4 w-4" />
              {isAr ? "إضافة" : "Add"}
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{isAr ? "جاري التحميل…" : "Loading…"}</p>
      ) : addresses.length === 0 ? (
        <button
          type="button"
          onClick={startAdd}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed p-5 text-sm font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-primary/5"
        >
          <Plus className="h-4 w-4" />
          {isAr ? "إضافة عنوان" : "Add Address"}
        </button>
      ) : (
        <div className="space-y-2.5">
          {(() => {
            const activeAddress =
              addresses.find((a) => a.id === selectedAddressId) ||
              addresses.find((a) => a.is_default) ||
              addresses[0];

            if (!activeAddress) return null;

            return (
              <>
                {/* Address Dropdown Picker if customer has multiple addresses */}
                {addresses.length > 1 && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                      {isAr ? `تحديد العنوان (${addresses.length})` : `Select Address (${addresses.length})`}
                    </label>
                    <Select value={activeAddress.id} onValueChange={setSelectedAddressId}>
                      <SelectTrigger className="w-full h-9 text-xs font-semibold rounded-xl bg-background border-border/80">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {addresses.map((a) => (
                          <SelectItem key={a.id} value={a.id} className="text-xs font-medium">
                            <span className="flex items-center gap-1.5 truncate">
                              <strong>{a.label || (isAr ? "عنوان" : "Address")}</strong>
                              <span className="text-muted-foreground">— {a.region || a.block || a.road}</span>
                              {a.is_default && (
                                <span className="ms-auto font-bold text-primary text-[10px]">
                                  ({isAr ? "الافتراضي" : "Default"})
                                </span>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Selected Active Address Card */}
                <div className="space-y-2">
                  <DeliveryAddressCard address={activeAddress} lang={lang} compact showLabel={false} />

                  {/* Actions Bar: Edit, Delete, Set as Default */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    {!activeAddress.is_default ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={saving}
                        onClick={() => makeDefault(activeAddress.id)}
                        className="h-7 px-2.5 text-[11px] font-bold gap-1 text-primary border-primary/30 bg-primary/5 hover:bg-primary/10 rounded-lg"
                      >
                        <Star className="h-3 w-3 fill-primary text-primary" />
                        <span>{isAr ? "تعيين كافتراضي" : "Set as Default"}</span>
                      </Button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                        <Check className="h-3 w-3" />
                        {isAr ? "العنوان الافتراضي" : "Default Address"}
                      </span>
                    )}

                    <div className="flex items-center gap-1.5 ms-auto">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px] font-semibold gap-1 text-muted-foreground hover:text-foreground"
                        onClick={() => startEdit(activeAddress)}
                      >
                        <Pencil className="h-3 w-3" />
                        <span>{isAr ? "تعديل" : "Edit"}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px] font-semibold gap-1 text-destructive hover:text-destructive"
                        onClick={() => setDeleting(activeAddress)}
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>{isAr ? "حذف" : "Delete"}</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(null);
        }}
      >
        <DialogContent
          className="max-h-[90vh] max-w-2xl overflow-y-auto"
          dir={isAr ? "rtl" : "ltr"}
        >
          <DialogHeader>
            <DialogTitle>
              {editing
                ? isAr
                  ? "تعديل العنوان"
                  : "Edit Address"
                : isAr
                  ? "إضافة عنوان"
                  : "Add Address"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <Field label={isAr ? "اسم العنوان" : "Address Label"} required>
              <Input
                value={form.label}
                onChange={(event) => setForm({ ...form, label: event.target.value })}
                placeholder={isAr ? "المنزل، العمل" : "Home, Work"}
              />
            </Field>
            <Field label={isAr ? "المدينة / المنطقة" : "City / Area"} required>
              <Input
                value={form.region}
                onChange={(event) => setForm({ ...form, region: event.target.value })}
              />
            </Field>
            <Field label={isAr ? "المجمع" : "Block"} required>
              <Input
                value={form.block}
                onChange={(event) => setForm({ ...form, block: event.target.value })}
              />
            </Field>
            <Field label={isAr ? "الطريق" : "Road"} required>
              <Input
                value={form.road}
                onChange={(event) => setForm({ ...form, road: event.target.value })}
              />
            </Field>
            <Field label={isAr ? "المبنى / المنزل" : "Building / House"} required>
              <Input
                value={form.house}
                onChange={(event) => setForm({ ...form, house: event.target.value })}
              />
            </Field>
            <Field label={isAr ? "الشقة" : "Flat"}>
              <Input
                value={form.flat}
                onChange={(event) => setForm({ ...form, flat: event.target.value })}
              />
            </Field>
            <Field label={isAr ? "الطابق" : "Floor"}>
              <Input
                value={form.floor}
                onChange={(event) => setForm({ ...form, floor: event.target.value })}
              />
            </Field>
            <Field label={isAr ? "علامة مميزة قريبة" : "Nearby Landmark"}>
              <Input
                value={form.landmark}
                onChange={(event) => setForm({ ...form, landmark: event.target.value })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label={isAr ? "ملاحظات خاصة للتوصيل" : "Special Delivery Notes"}>
                <Textarea
                  rows={3}
                  value={form.delivery_notes}
                  onChange={(event) => setForm({ ...form, delivery_notes: event.target.value })}
                  placeholder={isAr ? "مثال: الاتصال عند الوصول" : "Example: Call when you arrive"}
                />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? (isAr ? "جاري الحفظ…" : "Saving…") : isAr ? "حفظ العنوان" : "Save Address"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
      >
        <AlertDialogContent dir={isAr ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>{isAr ? "حذف العنوان؟" : "Delete address?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isAr
                ? "سيتم حذف هذا العنوان نهائياً من ملف العميل."
                : "This address will be permanently removed from the customer profile."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isAr ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void remove()}
            >
              {isAr ? "حذف" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}
