import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accountingQueries, createVendor, invalidateVendors } from "@/lib/data/accounting";
import { cn } from "@/lib/utils";

/** Who the order is from: one of the store's suppliers, or a new one added on the spot. */
export function SupplierField({
  brandId,
  value,
  onChange,
  invalid,
  lang,
}: {
  brandId: string;
  value: string;
  onChange: (vendorId: string) => void;
  invalid: boolean;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const id = useId();
  const qc = useQueryClient();
  const vendorsQ = useQuery(accountingQueries.vendorOptions(brandId));
  const vendors = vendorsQ.data ?? [];
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const vendorId = await createVendor(brandId, {
        name: name.trim().slice(0, 120),
        phone: phone.trim() || null,
      });
      await invalidateVendors(qc, brandId);
      onChange(vendorId);
      setAdding(false);
      setName("");
      setPhone("");
    } catch {
      toast.error(
        isAr ? "تعذرت إضافة المورد، حاول مرة أخرى." : "Could not add the supplier. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{isAr ? "المورد" : "Supplier"}</Label>
      <div className="flex min-w-0 gap-2">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid || undefined}
          className={cn(
            "h-10 min-w-0 max-w-full flex-1 rounded-md border border-input bg-background px-3 text-sm pointer-coarse:h-11",
            invalid && "border-destructive",
          )}
        >
          <option value="">{isAr ? "اختر المورد" : "Choose the supplier"}</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          onClick={() => setAdding(true)}
          className="h-10 shrink-0 gap-1 pointer-coarse:h-11"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {isAr ? "جديد" : "New"}
        </Button>
      </div>
      {invalid && (
        <p className="text-xs text-destructive">
          {isAr ? "اختر من ستطلب منه." : "Choose who the order is from."}
        </p>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent dir={isAr ? "rtl" : "ltr"} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{isAr ? "مورد جديد" : "New supplier"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor={`${id}-name`}>{isAr ? "الاسم" : "Name"}</Label>
              <Input
                id={`${id}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isAr ? "مثال: مشغل النور" : "e.g. Al Noor workshop"}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${id}-phone`}>
                {isAr ? "رقم الهاتف (اختياري)" : "Phone (optional)"}
              </Label>
              <Input
                id={`${id}-phone`}
                dir="ltr"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setAdding(false)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="button" onClick={save} disabled={!name.trim() || saving}>
              {isAr ? "إضافة" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
