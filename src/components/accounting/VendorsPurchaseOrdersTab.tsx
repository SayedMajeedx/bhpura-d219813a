import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Building2,
  FileSpreadsheet,
  Plus,
  Pencil,
  Trash2,
  DollarSign,
  Phone,
  Mail,
  Receipt,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { formatMoney, formatDate } from "@/lib/format";
import { toast } from "sonner";

export function VendorsPurchaseOrdersTab() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const brandId = brand.id;
  const qc = useQueryClient();

  const [activeSubTab, setActiveSubTab] = useState<"pos" | "vendors">("pos");

  // Vendor Modal State
  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [vendorContact, setVendorContact] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [vendorEmail, setVendorEmail] = useState("");

  // PO Modal State
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [poNumber, setPoNumber] = useState(`PO-${Math.floor(1000 + Math.random() * 9000)}`);
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [poTotalAmount, setPoTotalAmount] = useState<number>(0);
  const [poPaidAmount, setPoPaidAmount] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch Vendors
  const vendorsQ = useQuery({
    queryKey: ["vendors-full", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vendors")
        .select("*")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Fetch Purchase Orders
  const posQ = useQuery({
    queryKey: ["purchase-orders", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("purchase_orders")
        .select("*, vendors(name)")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const vendors: any[] = vendorsQ.data ?? [];
  const pos: any[] = posQ.data ?? [];

  // Calculate total Accounts Payable (الديون والتزامات الموردين)
  const totalAccountsPayable = pos.reduce((sum, po) => {
    const total = Number(po.total_amount || 0);
    const paid = Number(po.paid_amount || 0);
    return sum + Math.max(0, total - paid);
  }, 0);

  const handleSaveVendor = async () => {
    if (!vendorName.trim()) {
      toast.error(isAr ? "يرجى إدخال اسم المورد" : "Please enter vendor name");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await (supabase as any).from("vendors").insert({
        brand_id: brandId,
        name: vendorName,
        contact_person: vendorContact,
        phone: vendorPhone,
        email: vendorEmail,
      } as any);
      if (error) throw error;

      toast.success(isAr ? "تم إضافة المورد بنجاح" : "Vendor added");
      qc.invalidateQueries({ queryKey: ["vendors-full", brandId] });
      qc.invalidateQueries({ queryKey: ["vendors", brandId] });
      setVendorModalOpen(false);
      setVendorName("");
      setVendorContact("");
      setVendorPhone("");
      setVendorEmail("");
    } catch (err: any) {
      toast.error(err.message || "Failed to add vendor");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePO = async () => {
    if (!selectedVendorId || poTotalAmount <= 0) {
      toast.error(isAr ? "يرجى اختيار المورد وإدخال إجمالي أمر الشراء" : "Please select vendor & enter total");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await (supabase as any).from("purchase_orders").insert({
        brand_id: brandId,
        po_number: poNumber,
        vendor_id: selectedVendorId,
        total_amount: poTotalAmount,
        paid_amount: poPaidAmount,
        status: poPaidAmount >= poTotalAmount ? "received" : "ordered",
      } as any);
      if (error) throw error;

      toast.success(isAr ? "تم إنشاء أمر الشراء بنجاح" : "Purchase order created");
      qc.invalidateQueries({ queryKey: ["purchase-orders", brandId] });
      setPoModalOpen(false);
      setPoTotalAmount(0);
      setPoPaidAmount(0);
    } catch (err: any) {
      toast.error(err.message || "Failed to save PO");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRecordPartialPayment = async (po: any, addPaidAmt: number) => {
    try {
      const currentPaid = Number(po.paid_amount || 0);
      const total = Number(po.total_amount || 0);
      const newPaid = Math.min(total, currentPaid + addPaidAmt);

      const { error } = await (supabase as any)
        .from("purchase_orders")
        .update({
          paid_amount: newPaid,
          status: newPaid >= total ? "received" : "ordered",
        } as any)
        .eq("id", po.id)
        .eq("brand_id", brandId);
      if (error) throw error;

      toast.success(isAr ? "تم تسجيل الدفعة بنجاح" : "Payment recorded");
      qc.invalidateQueries({ queryKey: ["purchase-orders", brandId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update PO payment");
    }
  };

  return (
    <div className="space-y-6">
      {/* Accounts Payable Metric Card */}
      <Card className="p-4 border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-muted-foreground block">{isAr ? "التزامات الموردين والديون (Accounts Payable)" : "Total Accounts Payable"}</span>
          <span className="text-xl font-extrabold text-amber-500 mt-1 block">
            {formatMoney(totalAccountsPayable, "BHD")}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setVendorModalOpen(true)} className="h-8 text-xs font-bold gap-1">
            <Building2 className="h-3.5 w-3.5" />
            {isAr ? "إضافة مورد جديد" : "Add Vendor"}
          </Button>
          <Button size="sm" onClick={() => setPoModalOpen(true)} className="h-8 text-xs font-bold gap-1">
            <Plus className="h-3.5 w-3.5" />
            {isAr ? "أمر شراء جديد (PO)" : "New Purchase Order"}
          </Button>
        </div>
      </Card>

      {/* Sub Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <Button
          variant={activeSubTab === "pos" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveSubTab("pos")}
          className="h-8 text-xs font-bold"
        >
          {isAr ? `أوامر الشراء (${pos.length})` : `Purchase Orders (${pos.length})`}
        </Button>
        <Button
          variant={activeSubTab === "vendors" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveSubTab("vendors")}
          className="h-8 text-xs font-bold"
        >
          {isAr ? `دليل الموردين (${vendors.length})` : `Vendors Directory (${vendors.length})`}
        </Button>
      </div>

      {/* Content */}
      {activeSubTab === "pos" ? (
        pos.length === 0 ? (
          <Card className="p-8 text-center text-xs text-muted-foreground">
            {isAr ? "لا توجد أوامر شراء مسجلة." : "No purchase orders registered."}
          </Card>
        ) : (
          <div className="space-y-3">
            {pos.map((po) => {
              const total = Number(po.total_amount || 0);
              const paid = Number(po.paid_amount || 0);
              const remaining = Math.max(0, total - paid);
              const isFullyPaid = remaining === 0;

              return (
                <Card key={po.id} className="p-4 border-border space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-foreground">{po.po_number}</span>
                        <Badge variant="outline" className={`text-[10px] ${isFullyPaid ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"}`}>
                          {isFullyPaid ? (isAr ? "مسدد بالكامل" : "Paid") : isAr ? "دفع جزئي / آجل" : "Partial Payment"}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground block mt-0.5">
                        {isAr ? "المورد:" : "Vendor:"} <strong className="text-foreground">{(po.vendors as any)?.name || "N/A"}</strong> • {formatDate(po.created_at)}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-muted-foreground block">{isAr ? "الإجمالي:" : "Total:"}</span>
                      <span className="font-extrabold text-sm text-foreground">{formatMoney(total, "BHD")}</span>
                    </div>
                  </div>

                  {/* Payment Progress Bar */}
                  <div className="rounded-lg bg-muted/40 p-2.5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span>{isAr ? `المدفوع: ${formatMoney(paid, "BHD")}` : `Paid: ${formatMoney(paid, "BHD")}`}</span>
                      <span className="font-bold text-amber-500">
                        {isAr ? `المتبقي: ${formatMoney(remaining, "BHD")}` : `Remaining: ${formatMoney(remaining, "BHD")}`}
                      </span>
                    </div>

                    {!isFullyPaid && (
                      <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const amtStr = prompt(isAr ? "أدخل مبلغ الدفعة الإضافية (BHD):" : "Enter payment amount (BHD):");
                            if (amtStr) handleRecordPartialPayment(po, parseFloat(amtStr) || 0);
                          }}
                          className="h-7 text-xs font-bold text-primary"
                        >
                          {isAr ? "تسجيل دفعة للمورد" : "Record Payment"}
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        /* Vendors List */
        vendors.length === 0 ? (
          <Card className="p-8 text-center text-xs text-muted-foreground">
            {isAr ? "لا يوجد موردين مسجلين بعد." : "No vendors registered yet."}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vendors.map((v) => (
              <Card key={v.id} className="p-4 border-border space-y-2">
                <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-primary" />
                  {v.name}
                </h3>
                {v.contact_person && <p className="text-xs text-muted-foreground">{v.contact_person}</p>}
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
        )
      )}

      {/* Add Vendor Dialog */}
      <Dialog open={vendorModalOpen} onOpenChange={setVendorModalOpen}>
        <DialogContent dir={isAr ? "rtl" : "ltr"} className="max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">{isAr ? "إضافة مورد جديد" : "Add Vendor"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label>{isAr ? "اسم الشركة / المورد" : "Vendor Name"}</Label>
              <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="e.g. Gulf Packaging Co." className="h-9 text-xs" />
            </div>
            <div className="space-y-1">
              <Label>{isAr ? "اسم المسؤول" : "Contact Person"}</Label>
              <Input value={vendorContact} onChange={(e) => setVendorContact(e.target.value)} placeholder="e.g. Ahmed Ali" className="h-9 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>{isAr ? "رقم الهاتف" : "Phone"}</Label>
                <Input value={vendorPhone} onChange={(e) => setVendorPhone(e.target.value)} className="h-9 text-xs" />
              </div>
              <div className="space-y-1">
                <Label>{isAr ? "البريد الإلكتروني" : "Email"}</Label>
                <Input value={vendorEmail} onChange={(e) => setVendorEmail(e.target.value)} className="h-9 text-xs" />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setVendorModalOpen(false)} className="h-9 text-xs">{isAr ? "إلغاء" : "Cancel"}</Button>
            <Button onClick={handleSaveVendor} disabled={isSaving} className="h-9 text-xs font-bold">{isAr ? "حفظ المورد" : "Save Vendor"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create PO Dialog */}
      <Dialog open={poModalOpen} onOpenChange={setPoModalOpen}>
        <DialogContent dir={isAr ? "rtl" : "ltr"} className="max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">{isAr ? "إنشاء أمر شراء جديد (PO)" : "Create Purchase Order"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>{isAr ? "رقم أمر الشراء" : "PO Number"}</Label>
                <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} className="h-9 text-xs font-mono" />
              </div>
              <div className="space-y-1">
                <Label>{isAr ? "المورد" : "Vendor"}</Label>
                <select value={selectedVendorId} onChange={(e) => setSelectedVendorId(e.target.value)} className="h-9 text-xs w-full rounded-md border border-input bg-background px-2">
                  <option value="">{isAr ? "-- اختر المورد --" : "-- Select Vendor --"}</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>{isAr ? "الإجمالي الكلي (BHD)" : "Total Amount (BHD)"}</Label>
                <Input type="number" step="0.001" min="0" value={poTotalAmount} onChange={(e) => setPoTotalAmount(parseFloat(e.target.value) || 0)} className="h-9 text-xs font-mono" />
              </div>
              <div className="space-y-1">
                <Label>{isAr ? "الدفعة الأولى المقدمة (BHD)" : "Down Payment (BHD)"}</Label>
                <Input type="number" step="0.001" min="0" value={poPaidAmount} onChange={(e) => setPoPaidAmount(parseFloat(e.target.value) || 0)} className="h-9 text-xs font-mono" />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPoModalOpen(false)} className="h-9 text-xs">{isAr ? "إلغاء" : "Cancel"}</Button>
            <Button onClick={handleSavePO} disabled={isSaving} className="h-9 text-xs font-bold">{isAr ? "إنشاء أمر الشراء" : "Create PO"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
