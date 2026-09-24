import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { PhoneInput } from "@/components/phone-input";

/** Creates a customer (and a default address when one is typed) and assigns it to the order. */
export function NewCustomerDialog({
  open,
  onOpenChange,
  brandId,
  lang,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  lang: string;
  onCreated: (customerId: string, addressId: string | null) => void;
}) {
  const qc = useQueryClient();
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [newCustRegion, setNewCustRegion] = useState("");
  const [newCustBlock, setNewCustBlock] = useState("");
  const [newCustRoad, setNewCustRoad] = useState("");
  const [newCustHouse, setNewCustHouse] = useState("");
  const [newCustFlat, setNewCustFlat] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  const handleCreateInlineCustomer = async () => {
    if (!newCustName.trim()) {
      return toast.error(lang === "ar" ? "أدخل اسم العميل" : "Customer name is required");
    }
    setCreatingCustomer(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // 1. Insert customer
      const { data: cust, error: custErr } = await (supabase.from("customers") as any)
        .insert({
          user_id: user.id,
          brand_id: brandId,
          name: newCustName.trim(),
          phone: newCustPhone.trim() || null,
          email: newCustEmail.trim().toLowerCase() || null,
          region: newCustRegion.trim() || null,
          block: newCustBlock.trim() || null,
          road: newCustRoad.trim() || null,
          house: newCustHouse.trim() || null,
          flat: newCustFlat.trim() || null,
        })
        .select()
        .single();

      if (custErr) throw custErr;

      // 2. Insert default address if address details provided
      let addressId: string | null = null;
      if (newCustRegion || newCustBlock || newCustRoad || newCustHouse) {
        const { data: addr, error: addrErr } = await (supabase.from("customer_addresses") as any)
          .insert({
            user_id: user.id,
            brand_id: brandId,
            customer_id: cust.id,
            label: "Home",
            region: newCustRegion.trim() || null,
            block: newCustBlock.trim() || null,
            road: newCustRoad.trim() || null,
            house: newCustHouse.trim() || null,
            flat: newCustFlat.trim() || null,
            is_default: true,
          })
          .select()
          .single();

        if (!addrErr && addr) {
          addressId = addr.id;
        }
      }

      toast.success(
        lang === "ar"
          ? `تم إضافة العميل "${cust.name}" بنجاح!`
          : `Customer "${cust.name}" created successfully!`,
      );

      // Auto-assign to current order!
      onCreated(cust.id, addressId);

      // Refetch queries
      qc.invalidateQueries({ queryKey: ["customers", brandId] });
      qc.invalidateQueries({ queryKey: ["customer_addresses", brandId] });

      // Reset form & close modal
      setNewCustName("");
      setNewCustPhone("");
      setNewCustEmail("");
      setNewCustRegion("");
      setNewCustBlock("");
      setNewCustRoad("");
      setNewCustHouse("");
      setNewCustFlat("");
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(
        getFriendlyErrorMessage(err) ||
          (lang === "ar" ? "تعذر إنشاء العميل" : "Failed to create customer"),
      );
    } finally {
      setCreatingCustomer(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto w-[95vw] p-4 sm:p-6 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <UserPlus className="h-5 w-5 text-primary shrink-0" />
            {lang === "ar" ? "إضافة زبون جديد" : "Create New Customer"}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {lang === "ar"
              ? "أدخل بيانات الزبون وسيتم تعيينه مباشرة لهذا الطلب بدون فقدان التغييرات."
              : "Enter customer details. They will be assigned to this order draft immediately."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs font-semibold">
              {lang === "ar" ? "اسم الزبون *" : "Full Name *"}
            </Label>
            <Input
              className="h-11 mt-1 text-sm"
              placeholder={lang === "ar" ? "مثال: علي محمد" : "e.g. Ali Mohamed"}
              value={newCustName}
              onChange={(e) => setNewCustName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">
                {lang === "ar" ? "رقم الهاتف" : "Phone Number"}
              </Label>
              <div className="mt-1">
                <PhoneInput
                  value={newCustPhone}
                  onChange={setNewCustPhone}
                  placeholder="33000000"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold">
                {lang === "ar" ? "البريد الإلكتروني" : "Email Address"}
              </Label>
              <Input
                className="h-11 mt-1 text-sm text-start"
                dir="ltr"
                type="email"
                placeholder="ali@example.com"
                value={newCustEmail}
                onChange={(e) => setNewCustEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="border-t pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-muted-foreground">
                {lang === "ar" ? "عنوان التوصيل الافتراضي" : "Default Delivery Address"}
              </Label>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {lang === "ar" ? "اختياري" : "Optional"}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <Input
                className="h-10 text-sm"
                placeholder={lang === "ar" ? "المنطقة (مثال: المنامة)" : "Region (e.g. Manama)"}
                value={newCustRegion}
                onChange={(e) => setNewCustRegion(e.target.value)}
              />
              <Input
                className="h-10 text-sm"
                placeholder={lang === "ar" ? "المجمع (مثال: 321)" : "Block (e.g. 321)"}
                value={newCustBlock}
                onChange={(e) => setNewCustBlock(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <Input
                className="h-10 text-sm"
                placeholder={lang === "ar" ? "الطريق" : "Road"}
                value={newCustRoad}
                onChange={(e) => setNewCustRoad(e.target.value)}
              />
              <Input
                className="h-10 text-sm"
                placeholder={lang === "ar" ? "المنزل" : "House"}
                value={newCustHouse}
                onChange={(e) => setNewCustHouse(e.target.value)}
              />
              <Input
                className="h-10 text-sm"
                placeholder={lang === "ar" ? "الشقة" : "Flat"}
                value={newCustFlat}
                onChange={(e) => setNewCustFlat(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto h-11"
          >
            {lang === "ar" ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            type="button"
            onClick={handleCreateInlineCustomer}
            disabled={creatingCustomer || !newCustName.trim()}
            className="w-full sm:w-auto h-11 bg-primary text-primary-foreground font-medium"
          >
            {creatingCustomer ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin me-2" />
                {lang === "ar" ? "جاري الحفظ..." : "Creating..."}
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4 me-2" />
                {lang === "ar" ? "حفظ وتعين الزبون" : "Save & Assign Customer"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
