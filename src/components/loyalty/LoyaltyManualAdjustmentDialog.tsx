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
      const trimmedReasonAr = reasonAr.trim();
      const trimmedReasonEn = reasonEn.trim();
      if (!trimmedReasonAr && !trimmedReasonEn) {
        throw new Error(
          isAr
            ? "يرجى كتابة سبب التعديل لتدوينه في سجل الرقابة والتدقيق"
            : "Please provide an audit reason for this manual adjustment",
        );
      }

      const pointsDelta = adjustmentType === "add" ? pointsAmount : -pointsAmount;

      const { data, error } = await (supabase as any).rpc("rpc_manual_adjust_loyalty_points", {
        p_brand_id: brandId,
        p_customer_id: selectedCustomerId,
        p_points_delta: pointsDelta,
        p_reason_ar: trimmedReasonAr || trimmedReasonEn,
        p_reason_en: trimmedReasonEn || trimmedReasonAr,
      });

      if (error) throw error;
      return data;
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
              className="min-h-[44px]"
            >
              + {isAr ? "إضافة / منح نقاط" : "Award Points"}
            </Button>
            <Button
              type="button"
              variant={adjustmentType === "deduct" ? "destructive" : "outline"}
              onClick={() => setAdjustmentType("deduct")}
              className="min-h-[44px]"
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
