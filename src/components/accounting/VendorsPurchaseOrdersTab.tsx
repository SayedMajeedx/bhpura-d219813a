import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Building2, Phone, Mail, Scissors } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { accountingQueries, createVendor, invalidateVendors } from "@/lib/data/accounting";
import { supplierOrderQueries } from "@/lib/data/supplier-orders";
import { localToday, ordersSummary } from "@/features/supplier-orders/lib/order-state";
import { useStoreCurrency } from "@/hooks/use-store-currency";
import { arNoun } from "@/lib/arabic-count";

export function VendorsPurchaseOrdersTab() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const brandId = brand.id;
  const currency = useStoreCurrency(brandId);
  const qc = useQueryClient();

  // Vendor Modal State
  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [vendorContact, setVendorContact] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [vendorEmail, setVendorEmail] = useState("");

  const [isSaving, setIsSaving] = useState(false);

  const vendorsQ = useQuery(accountingQueries.vendors(brandId));
  // Purchase orders are supplier orders now (their own page): what is owed is read from them.
  const ordersQ = useQuery(supplierOrderQueries.list(brandId));
  const vendors: any[] = vendorsQ.data ?? [];
  const summary = ordersSummary(ordersQ.data ?? [], localToday());

  const handleSaveVendor = async () => {
    if (!vendorName.trim()) {
      toast.error(isAr ? "يرجى إدخال اسم المورد" : "Please enter vendor name");
      return;
    }

    setIsSaving(true);
    try {
      await createVendor(brandId, {
        name: vendorName,
        contact_person: vendorContact,
        phone: vendorPhone,
        email: vendorEmail,
      });

      toast.success(isAr ? "تم إضافة المورد بنجاح" : "Vendor added");
      invalidateVendors(qc, brandId);
      setVendorModalOpen(false);
      setVendorName("");
      setVendorContact("");
      setVendorPhone("");
      setVendorEmail("");
    } catch (err: any) {
      console.error("Vendor add error:", err);
      toast.error(
        isAr
          ? "تعذر إضافة المورد، يرجى المحاولة مرة أخرى."
          : "Failed to add vendor. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* What is owed to suppliers, from their orders (the supplier orders page). */}
      <Card className="p-4 border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-muted-foreground block">
            {isAr ? "الباقي للموردين" : "Owed to suppliers"}
          </span>
          <span className="text-xl font-extrabold text-warning mt-1 block">
            {formatMoney(summary.owed, currency, lang)}
          </span>
          <span className="text-xs text-muted-foreground">
            {isAr
              ? `${summary.open} طلبية بانتظار الاستلام · ${arNoun(summary.awaited, "piece")}`
              : `${summary.open} orders awaiting delivery · ${summary.awaited} pieces`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setVendorModalOpen(true)}
            className="h-9 text-xs font-bold gap-1"
          >
            <Building2 className="h-3.5 w-3.5" />
            {isAr ? "إضافة مورد" : "Add supplier"}
          </Button>
          <Button asChild size="sm" className="h-9 text-xs font-bold gap-1">
            <Link to="/admin/b/$slug/supplier-orders" params={{ slug: brand.slug }}>
              <Scissors className="h-3.5 w-3.5" />
              {isAr ? "طلبيات الموردين" : "Supplier orders"}
            </Link>
          </Button>
        </div>
      </Card>

      <h3 className="text-sm font-bold">
        {isAr ? `دليل الموردين (${vendors.length})` : `Suppliers (${vendors.length})`}
      </h3>
      {vendors.length === 0 ? (
        <Card className="p-8 text-center text-xs text-muted-foreground">
          {isAr ? "لا يوجد موردين مسجلين بعد." : "No suppliers registered yet."}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendors.map((v) => (
            <Card key={v.id} className="p-4 border-border space-y-2">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-primary" />
                {v.name}
              </h3>
              {v.contact_person && (
                <p className="text-xs text-muted-foreground">{v.contact_person}</p>
              )}
              {v.phone && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {v.phone}
                </p>
              )}
              {v.email && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {v.email}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Add Vendor Dialog */}
      <Dialog open={vendorModalOpen} onOpenChange={setVendorModalOpen}>
        <DialogContent
          dir={isAr ? "rtl" : "ltr"}
          className="max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl"
        >
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">
              {isAr ? "إضافة مورد جديد" : "Add Vendor"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label>{isAr ? "اسم الشركة / المورد" : "Vendor Name"}</Label>
              <Input
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="e.g. Gulf Packaging Co."
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label>{isAr ? "اسم المسؤول" : "Contact Person"}</Label>
              <Input
                value={vendorContact}
                onChange={(e) => setVendorContact(e.target.value)}
                placeholder="e.g. Ahmed Ali"
                className="h-9 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>{isAr ? "رقم الهاتف" : "Phone"}</Label>
                <Input
                  value={vendorPhone}
                  onChange={(e) => setVendorPhone(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label>{isAr ? "البريد الإلكتروني" : "Email"}</Label>
                <Input
                  value={vendorEmail}
                  onChange={(e) => setVendorEmail(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setVendorModalOpen(false)}
              className="h-9 text-xs"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={handleSaveVendor}
              disabled={isSaving}
              className="h-9 text-xs font-bold"
            >
              {isAr ? "حفظ المورد" : "Save Vendor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
