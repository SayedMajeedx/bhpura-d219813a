import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  cashEntryRefusal,
  invalidateCashAccounts,
  recordCashAccountEntry,
  type CashAccountType,
  type CashEntryRefusal,
} from "@/lib/data/accounting";

const ENTRY_REFUSAL_MESSAGES: Record<CashEntryRefusal, { ar: string; en: string }> = {
  INVALID_ENTRY_AMOUNT: { ar: "يرجى إدخال مبلغ صحيح", en: "Please enter a valid amount" },
  INVALID_ENTRY_DIRECTION: { ar: "نوع الحركة غير صالح", en: "Invalid entry type" },
  INVALID_ENTRY_ACCOUNT: { ar: "الحساب غير صالح", en: "Invalid account" },
  NOT_AUTHORIZED: {
    ar: "ليس لديك صلاحية لتسجيل حركات السيولة.",
    en: "You do not have permission to record cash movements.",
  },
  INSUFFICIENT_BALANCE: {
    ar: "رصيد الحساب أقل من هذا المبلغ.",
    en: "The account holds less than this amount.",
  },
};

/**
 * Records money put into or taken out of the cash box or the bank account by
 * hand: an opening balance, an owner deposit or a withdrawal. The store has
 * no bank feed, so this keeps the balances true.
 */
export function CashEntryDialog({
  brandId,
  isAr,
  open,
  onOpenChange,
}: {
  brandId: string;
  isAr: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [account, setAccount] = useState<CashAccountType>("cash_box");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAccount("cash_box");
      setDirection("in");
      setAmount("");
      setNotes("");
    }
  }, [open]);

  const save = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error(ENTRY_REFUSAL_MESSAGES.INVALID_ENTRY_AMOUNT[isAr ? "ar" : "en"]);
      return;
    }
    setSaving(true);
    try {
      await recordCashAccountEntry(brandId, { account, direction, amount: value, notes });
      toast.success(isAr ? "تم تسجيل الحركة" : "Entry recorded");
      onOpenChange(false);
    } catch (error) {
      const refusal = cashEntryRefusal(error);
      toast.error(
        refusal
          ? ENTRY_REFUSAL_MESSAGES[refusal][isAr ? "ar" : "en"]
          : isAr
            ? "تعذر تسجيل الحركة، يرجى المحاولة مرة أخرى."
            : "Could not record the entry. Please try again.",
      );
    } finally {
      setSaving(false);
      // A refusal may mean the balances on screen are stale.
      void invalidateCashAccounts(qc, brandId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-foreground">
            {isAr ? "تسجيل حركة نقدية" : "Record cash in / out"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          <p className="text-muted-foreground">
            {isAr
              ? "للرصيد الافتتاحي، أو إيداع أو سحب من صاحب المتجر. لا يوجد ربط مباشر بالبنك، فسجّل ما تم فعلاً."
              : "For an opening balance, or an owner deposit or withdrawal. There is no live bank link, so record what actually happened."}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={direction === "in" ? "default" : "outline"}
              aria-pressed={direction === "in"}
              onClick={() => setDirection("in")}
              className="h-9 gap-1.5 text-xs"
            >
              <ArrowDownToLine className="h-3.5 w-3.5" />
              {isAr ? "إيداع" : "Cash in"}
            </Button>
            <Button
              type="button"
              variant={direction === "out" ? "default" : "outline"}
              aria-pressed={direction === "out"}
              onClick={() => setDirection("out")}
              className="h-9 gap-1.5 text-xs"
            >
              <ArrowUpFromLine className="h-3.5 w-3.5" />
              {isAr ? "سحب" : "Cash out"}
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">{isAr ? "الحساب" : "Account"}</Label>
            <Select value={account} onValueChange={(value) => setAccount(value as CashAccountType)}>
              <SelectTrigger className="h-9 text-xs" aria-label={isAr ? "الحساب" : "Account"}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash_box">{isAr ? "الصندوق النقدي" : "Cash box"}</SelectItem>
                <SelectItem value="bank_account">
                  {isAr ? "الحساب البنكي / BENEFIT" : "Bank / BENEFIT"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cash-entry-amount" className="text-xs font-semibold">
              {isAr ? "المبلغ (BHD)" : "Amount (BHD)"}
            </Label>
            <Input
              id="cash-entry-amount"
              type="number"
              step="0.001"
              min="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="h-9 text-xs font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cash-entry-notes" className="text-xs font-semibold">
              {isAr ? "ملاحظة" : "Note"}
            </Label>
            <Input
              id="cash-entry-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={isAr ? "الرصيد الافتتاحي" : "Opening balance"}
              className="h-9 text-xs"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 text-xs">
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={save} disabled={saving} className="h-9 text-xs font-bold">
            {saving ? (isAr ? "جاري الحفظ..." : "Saving...") : isAr ? "تسجيل" : "Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
