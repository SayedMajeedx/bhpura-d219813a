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
  Wallet,
  Building,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { formatMoney, formatDate } from "@/lib/format";
import { toast } from "sonner";

export function CashFlowLiquidityTab() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const brandId = brand.id;
  const qc = useQueryClient();

  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferAmount, setTransferAmount] = useState<number>(0);
  const [transferNotes, setTransferNotes] = useState("");
  const [isSubmitting, setIsSaving] = useState(false);

  // Fetch cash accounts
  const accountsQ = useQuery({
    queryKey: ["cash-flow-accounts", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cash_flow_accounts")
        .select("*")
        .eq("brand_id", brandId);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Fetch orders with cash/benefit reconciliation status
  const ordersQ = useQuery({
    queryKey: ["orders-reconciliation", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, invoice_number, created_at, total, status, payment_status, payment_method, reconciliation_status, customer_name_snapshot, customers(name)")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const accounts: any[] = accountsQ.data ?? [];
  const orders: any[] = ordersQ.data ?? [];

  const cashBoxAcc = accounts.find((a) => a.account_type === "cash_box") || {
    id: "cash",
    balance: 0,
    name_ar: "الصندوق (Cash Box)",
    name_en: "Cash Box",
  };
  const bankAcc = accounts.find((a) => a.account_type === "bank_account") || {
    id: "bank",
    balance: 0,
    name_ar: "الحساب البنكي / BENEFIT",
    name_en: "Bank Account",
  };


  const totalLiquidity = Number(cashBoxAcc.balance || 0) + Number(bankAcc.balance || 0);

  const handleUpdateReconciliation = async (orderId: string, nextStatus: "reconciled" | "pending" | "unreconciled") => {
    try {
      await supabase
        .from("orders")
        .update({ reconciliation_status: nextStatus } as any)
        .eq("id", orderId)
        .eq("brand_id", brandId);

      toast.success(isAr ? "تم تحديث حالة التسوية النقدية" : "Reconciliation status updated");
      qc.invalidateQueries({ queryKey: ["orders-reconciliation", brandId] });
      qc.invalidateQueries({ queryKey: ["dashboard-orders-with-items", brandId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    }
  };

  const handleTransferFunds = async () => {
    if (transferAmount <= 0) {
      toast.error(isAr ? "يرجى إدخال مبلغ صحيح للتحويل" : "Please enter a valid transfer amount");
      return;
    }

    setIsSaving(true);
    try {
      // Deduct from cash box, add to bank account
      await (supabase as any)
        .from("cash_flow_accounts")
        .update({ balance: Math.max(0, Number(cashBoxAcc.balance || 0) - transferAmount) } as any)
        .eq("id", cashBoxAcc.id)
        .eq("brand_id", brandId);

      await (supabase as any)
        .from("cash_flow_accounts")
        .update({ balance: Number(bankAcc.balance || 0) + transferAmount } as any)
        .eq("id", bankAcc.id)
        .eq("brand_id", brandId);

      // Record account transaction log
      await (supabase as any).from("account_transactions").insert({
        brand_id: brandId,
        source_account_id: cashBoxAcc.id,
        target_account_id: bankAcc.id,
        amount: transferAmount,
        transaction_type: "transfer",
        notes: transferNotes || "إيداع نقدي من الصندوق إلى الحساب البنكي",
      } as any);


      toast.success(isAr ? "تم تحويل السيولة النقدية بنجاح" : "Funds transferred successfully");
      qc.invalidateQueries({ queryKey: ["cash-flow-accounts", brandId] });
      setTransferModalOpen(false);
      setTransferAmount(0);
      setTransferNotes("");
    } catch (err: any) {
      toast.error(err.message || "Failed to transfer funds");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Account Balances Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Cash Box */}
        <Card className="p-4 border-border/80 bg-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <Wallet className="h-4 w-4 text-amber-500" />
              {isAr ? "الصندوق النقدي (Cash Box)" : "Cash Box Balance"}
            </span>
            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
              Cash
            </Badge>
          </div>
          <span className="text-xl font-extrabold text-foreground mt-2">
            {formatMoney(cashBoxAcc.balance || 0, "BHD")}
          </span>
        </Card>

        {/* Bank Account */}
        <Card className="p-4 border-border/80 bg-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <Building className="h-4 w-4 text-emerald-500" />
              {isAr ? "الحساب البنكي / BENEFIT" : "Bank / BENEFIT Balance"}
            </span>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
              Bank / BENEFIT
            </Badge>
          </div>
          <span className="text-xl font-extrabold text-foreground mt-2">
            {formatMoney(bankAcc.balance || 0, "BHD")}
          </span>
        </Card>

        {/* Total Liquidity & Transfer Button */}
        <Card className="p-4 border-border/80 bg-primary/5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-primary">{isAr ? "إجمالي السيولة المتاحة" : "Total Liquidity"}</span>
            <Button
              size="sm"
              onClick={() => setTransferModalOpen(true)}
              className="h-7 text-[11px] font-bold gap-1 px-2"
            >
              <ArrowRightLeft className="h-3 w-3" />
              {isAr ? "تحويل سيولة" : "Transfer"}
            </Button>
          </div>
          <span className="text-xl font-extrabold text-primary mt-2">
            {formatMoney(totalLiquidity, "BHD")}
          </span>
        </Card>
      </div>

      {/* Payment & Transfer Reconciliation Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {isAr ? "تسوية التحويلات والمبيعات النقدية (Reconciliation)" : "Payment Reconciliation"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr
                ? "تدقيق وتأكيد مطابقة تحويلات BENEFIT Pay المباشرة والمبالغ النقدية في الصندوق."
                : "Reconcile manual BENEFIT transfers & Cash Box payments."}
            </p>
          </div>
        </div>

        {orders.length === 0 ? (
          <Card className="p-6 text-center text-xs text-muted-foreground">
            {isAr ? "لا توجد طلبات تحتاج إلى تسوية." : "No orders pending reconciliation."}
          </Card>
        ) : (
          <div className="space-y-2">
            {orders.map((o) => {
              const customerName = (o.customers as any)?.name || o.customer_name_snapshot || "Guest";
              const recStatus = o.reconciliation_status || "unreconciled";

              return (
                <Card key={o.id} className="p-3 border-border flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                      {o.payment_method === "cash" ? <Wallet className="h-4 w-4" /> : <Building className="h-4 w-4" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-foreground">#{o.invoice_number}</span>
                        <span className="text-xs text-muted-foreground">• {customerName}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                        <span>{formatDate(o.created_at)}</span>
                        <span>•</span>
                        <span className="uppercase font-mono">{o.payment_method || "cash"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-extrabold text-xs text-foreground">{formatMoney(o.total, "BHD")}</span>

                    {/* Status Pill Switcher */}
                    {recStatus === "reconciled" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUpdateReconciliation(o.id, "pending")}
                        className="h-7 text-xs bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 gap-1 font-bold"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {isAr ? "مؤكد ومسوى" : "Reconciled"}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUpdateReconciliation(o.id, "reconciled")}
                        className="h-7 text-xs border-amber-500/30 text-amber-600 hover:bg-amber-500/10 gap-1 font-bold"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        {isAr ? "تأكيد التسوية" : "Mark Reconciled"}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Inter-Account Transfer Modal */}
      <Dialog open={transferModalOpen} onOpenChange={setTransferModalOpen}>
        <DialogContent className="max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-primary" />
              {isAr ? "تحويل سيولة (من الصندوق إلى البنك)" : "Transfer Funds"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
              <span className="text-[11px] text-muted-foreground block">{isAr ? "رصيد الصندوق المتاح:" : "Cash Box Balance:"}</span>
              <span className="font-bold text-sm text-foreground">{formatMoney(cashBoxAcc.balance || 0, "BHD")}</span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{isAr ? "المبلغ المراد تحويله وإيداعه بالبنك (BHD)" : "Transfer Amount (BHD)"}</Label>
              <Input
                type="number"
                step="0.001"
                min="0"
                value={transferAmount}
                onChange={(e) => setTransferAmount(parseFloat(e.target.value) || 0)}
                className="h-9 text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{isAr ? "ملاحظات التحويل" : "Notes"}</Label>
              <Input
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
                placeholder={isAr ? "إيداع نقدي في حساب البنك" : "Cash deposit into bank"}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setTransferModalOpen(false)} className="h-9 text-xs">
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button onClick={handleTransferFunds} disabled={isSubmitting} className="h-9 text-xs font-bold">
              {isSubmitting ? (isAr ? "جاري التحويل..." : "Transferring...") : isAr ? "تأكيد التحويل" : "Confirm Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
