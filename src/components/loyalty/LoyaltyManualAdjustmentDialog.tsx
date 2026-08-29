import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { Sparkles, Loader2, Coins } from "lucide-react";

interface LoyaltyManualAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
}

export function LoyaltyManualAdjustmentDialog({
  open,
  onOpenChange,
  brandId,
}: LoyaltyManualAdjustmentDialogProps) {
  const { lang, t } = useI18n();
  const isAr = lang === "ar";
  const queryClient = useQueryClient();

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [adjustmentType, setAdjustmentType] = useState<"add" | "deduct">("add");
  const [pointsAmount, setPointsAmount] = useState<number>(50);
  const [reasonAr, setReasonAr] = useState<string>("");
  const [reasonEn, setReasonEn] = useState<string>("");

  // Fetch customers for selector
  const { data: customers = [] } = useQuery({
    queryKey: ["brand_customers_select", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, email, phone")
        .eq("brand_id", brandId)
        .order("name", { ascending: true })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const adjustMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomerId) {
        throw new Error(isAr ? "يرجى اختيار العميل أولاً" : "Please select a customer");
      }
      if (pointsAmount <= 0) {
        throw new Error(isAr ? "مقدار النقاط يجب أن يكون أكبر من الصفر" : "Points must be > 0");
      }

      const pointsDelta = adjustmentType === "add" ? pointsAmount : -pointsAmount;
      const idempotencyKey = `manual_adj_${brandId}_${selectedCustomerId}_${Date.now()}`;

      // 1. Get or create loyalty account
      const { data: account, error: accErr } = await (supabase as any)
        .from("loyalty_accounts")
        .select("id, active_points, lifetime_points, lifetime_spent_points")
        .eq("brand_id", brandId)
        .eq("customer_id", selectedCustomerId)
        .maybeSingle();

      let activeBalance = account?.active_points || 0;
      let accountId = account?.id;

      if (!account) {
        const { data: newAcc, error: createErr } = await (supabase as any)
          .from("loyalty_accounts")
          .insert({
            brand_id: brandId,
            customer_id: selectedCustomerId,
            active_points: 0,
            pending_points: 0,
            current_tier_key: "bronze",
          })
          .select()
          .single();
        if (createErr) throw createErr;
        accountId = newAcc.id;
        activeBalance = 0;
      }

      const newBalance = Math.max(0, activeBalance + pointsDelta);

      // 2. Update account
      const { error: updateErr } = await (supabase as any)
        .from("loyalty_accounts")
        .update({
          active_points: newBalance,
          lifetime_points:
            pointsDelta > 0
              ? (account?.lifetime_points || 0) + pointsDelta
              : account?.lifetime_points || 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", accountId);
      if (updateErr) throw updateErr;

      // 3. Log into ledger
      const { error: ledgerErr } = await (supabase as any)
        .from("loyalty_ledger")
        .insert({
          brand_id: brandId,
          customer_id: selectedCustomerId,
          account_id: accountId,
          event_type: "earn_manual",
          points: pointsDelta,
          points_status: "active",
          effective_at: new Date().toISOString(),
          idempotency_key: idempotencyKey,
          reference_note_ar:
            reasonAr.trim() ||
            (adjustmentType === "add" ? "منح يدوي لنقاط مكافأة" : "خصم يدوي للنقاط"),
          reference_note_en:
            reasonEn.trim() ||
            (adjustmentType === "add"
              ? "Manual loyalty points bonus"
              : "Manual loyalty points deduction"),
          balance_after: newBalance,
        });

      if (ledgerErr) throw ledgerErr;
    },
    onSuccess: () => {
      toast.success(
        isAr ? "تم تعديل رصيد النقاط بنجاح" : "Loyalty balance adjusted successfully",
      );
      queryClient.invalidateQueries({ queryKey: ["brand_loyalty_ledger", brandId] });
      queryClient.invalidateQueries({ queryKey: ["brand_loyalty_accounts", brandId] });
      onOpenChange(false);
      setSelectedCustomerId("");
      setPointsAmount(50);
      setReasonAr("");
      setReasonEn("");
    },
    onError: (err: any) => {
      toast.error(err.message || (isAr ? "حدث خطأ أثناء التعديل" : "Adjustment failed"));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Sparkles className="h-5 w-5 text-primary" />
            {isAr ? "تعديل رصيد ولاء يدوي" : "Manual Loyalty Adjustment"}
          </DialogTitle>
          <DialogDescription>
            {isAr
              ? "منح أو خصم نقاط مكافأة مباشرة مع تسجيل سبب العملية في سجل الرقابة."
              : "Directly award or deduct reward points for a customer with an audit note."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Customer Selector */}
          <div className="space-y-1.5">
            <Label>{isAr ? "اختيار العميل" : "Select Customer"}</Label>
            <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
              <SelectTrigger className="min-h-[44px] bg-background border-border">
                <SelectValue placeholder={isAr ? "ابحث أو اختر عميلاً..." : "Select customer..."} />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {customers.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name || "Customer"} ({c.phone || c.email || "No contact"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type of Adjustment */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={adjustmentType === "add" ? "default" : "outline"}
              onClick={() => setAdjustmentType("add")}
              className={`min-h-[44px] ${
                adjustmentType === "add"
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "border-border"
              }`}
            >
              + {isAr ? "إضافة / منح نقاط" : "Award Points"}
            </Button>
            <Button
              type="button"
              variant={adjustmentType === "deduct" ? "default" : "outline"}
              onClick={() => setAdjustmentType("deduct")}
              className={`min-h-[44px] ${
                adjustmentType === "deduct"
                  ? "bg-rose-600 text-white hover:bg-rose-700"
                  : "border-border"
              }`}
            >
              - {isAr ? "خصم نقاط" : "Deduct Points"}
            </Button>
          </div>

          {/* Points Amount */}
          <div className="space-y-1.5">
            <Label>{isAr ? "مقدار النقاط" : "Points Amount"}</Label>
            <div className="relative">
              <Coins className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="number"
                min="1"
                step="1"
                value={pointsAmount}
                onChange={(e) => setPointsAmount(Number(e.target.value) || 0)}
                className="pl-9 min-h-[44px] bg-background border-border"
              />
            </div>
          </div>

          {/* Reason Note */}
          <div className="space-y-1.5">
            <Label>{isAr ? "سبب التعديل (عربي)" : "Audit Reason (Arabic)"}</Label>
            <Input
              placeholder={isAr ? "مثال: تعويض عن تأخير أو مكافأة خاصة" : "e.g. Special perk"}
              value={reasonAr}
              onChange={(e) => setReasonAr(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{isAr ? "سبب التعديل (إنجليزي)" : "Audit Reason (English)"}</Label>
            <Input
              placeholder="e.g. Compensation for order delay"
              value={reasonEn}
              onChange={(e) => setReasonEn(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="min-h-[44px]"
          >
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            type="button"
            onClick={() => adjustMutation.mutate()}
            disabled={adjustMutation.isPending || !selectedCustomerId}
            className="min-h-[44px] bg-primary text-primary-foreground"
          >
            {adjustMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isAr ? (
              "تنفيذ التعديل"
            ) : (
              "Apply Adjustment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
