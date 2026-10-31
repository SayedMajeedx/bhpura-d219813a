import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMoneyLabel } from "@/hooks/use-store-currency";
import { issueGiftCard, invalidateGiftCards, type GiftCard } from "@/lib/data/gift-cards";
import { localToday } from "@/features/supplier-orders/lib/order-state";
import {
  CARD_ORIGINS,
  ORIGIN_WORDS,
  emptyIssueForm,
  giftCardError,
  issueProblems,
  paidWithOf,
  type IssueForm,
} from "../lib/gift-cards";
import { GiftCardShare } from "./GiftCardShare";

/**
 * Issuing a card: sold (and how it was paid) or given, its amount, who it is for and from, a note
 * and an optional end date.
 */
export function IssueGiftCardDialog({
  brandId,
  lang,
  open,
  onOpenChange,
}: {
  brandId: string;
  lang: "ar" | "en";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const moneyLabel = useMoneyLabel(lang);
  const [form, setForm] = useState<IssueForm>(emptyIssueForm);
  const [shown, setShown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [issued, setIssued] = useState<GiftCard | null>(null);
  const problems = issueProblems(form, localToday());
  const set = (key: keyof IssueForm) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setForm(emptyIssueForm());
      setShown(false);
      setIssued(null);
    }
  };

  const submit = async () => {
    setShown(true);
    if (problems.length > 0) return;
    setSaving(true);
    try {
      const card = await issueGiftCard(brandId, {
        amount: Number(form.amount),
        recipientName: form.recipientName.trim(),
        purchaserName: form.purchaserName.trim(),
        note: form.note.trim(),
        expiresOn: form.expiresOn || null,
        paidWith: paidWithOf(form.origin),
      });
      await invalidateGiftCards(qc, brandId);
      setIssued(card);
    } catch (error) {
      toast.error(giftCardError(error, lang));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent dir={isAr ? "rtl" : "ltr"} className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {issued
              ? isAr
                ? "صدرت البطاقة"
                : "Card issued"
              : isAr
                ? "إصدار بطاقة هدية"
                : "Issue a gift card"}
          </DialogTitle>
          <DialogDescription>
            {issued
              ? isAr
                ? "أرسل الرمز للعميل: يُدفع به عند الطلب."
                : "Send the code to the customer: it pays when they order."
              : isAr
                ? "بطاقة الهدية دفعة مقدمة يحتفظ بها المتجر حتى تُستخدم، وليست خصمًا."
                : "A gift card is money the store holds until it is used, not a discount."}
          </DialogDescription>
        </DialogHeader>

        {issued ? (
          <GiftCardShare card={issued} lang={lang} />
        ) : (
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <p id="gift-origin-label" className="text-sm font-medium">
                {isAr ? "كيف دُفعت؟" : "How was it paid?"}
              </p>
              <div
                role="radiogroup"
                aria-labelledby="gift-origin-label"
                className="grid grid-cols-2 gap-2"
              >
                {CARD_ORIGINS.map((origin) => (
                  <Button
                    key={origin}
                    type="button"
                    role="radio"
                    aria-checked={form.origin === origin}
                    variant={form.origin === origin ? "default" : "outline"}
                    size="sm"
                    onClick={() => setForm((current) => ({ ...current, origin }))}
                  >
                    {ORIGIN_WORDS[origin][lang]}
                  </Button>
                ))}
              </div>
              {shown && problems.includes("origin") ? (
                <p className="text-xs text-destructive">
                  {isAr
                    ? "اختر كيف دُفعت البطاقة، أو أنها هدية من المتجر."
                    : "Choose how the card was paid for, or that the store gave it."}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? "ثمن البطاقة مال يحتفظ به المتجر، لا مبيعات: تُحسب المبيعات حين تُستخدم."
                    : "What a card is sold for is money held, not a sale: the sale counts when it is spent."}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gift-amount">
                {isAr ? "القيمة" : "Amount"} ({moneyLabel})
              </Label>
              <Input
                id="gift-amount"
                inputMode="decimal"
                value={form.amount}
                onChange={set("amount")}
                aria-invalid={shown && problems.includes("amount")}
              />
              {shown && problems.includes("amount") && (
                <p className="text-xs text-destructive">
                  {isAr ? "اكتب قيمة أكبر من صفر." : "Write an amount above zero."}
                </p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="gift-recipient">{isAr ? "لمن (اختياري)" : "For (optional)"}</Label>
                <Input
                  id="gift-recipient"
                  value={form.recipientName}
                  onChange={set("recipientName")}
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gift-purchaser">{isAr ? "من (اختياري)" : "From (optional)"}</Label>
                <Input
                  id="gift-purchaser"
                  value={form.purchaserName}
                  onChange={set("purchaserName")}
                  maxLength={120}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gift-expiry">
                {isAr ? "صالحة حتى (اختياري)" : "Valid until (optional)"}
              </Label>
              <Input
                id="gift-expiry"
                type="date"
                value={form.expiresOn}
                onChange={set("expiresOn")}
                dir="ltr"
              />
              {shown && problems.includes("expiry") && (
                <p className="text-xs text-destructive">
                  {isAr ? "التاريخ مضى." : "That date has passed."}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gift-note">{isAr ? "ملاحظة (للفريق)" : "Note (for the team)"}</Label>
              <Textarea
                id="gift-note"
                value={form.note}
                onChange={set("note")}
                maxLength={500}
                rows={2}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {issued ? (
            <Button type="button" onClick={() => close(false)}>
              {isAr ? "تم" : "Done"}
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => close(false)}>
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button type="button" onClick={submit} disabled={saving}>
                {saving
                  ? isAr
                    ? "جارٍ الإصدار…"
                    : "Issuing…"
                  : isAr
                    ? "إصدار البطاقة"
                    : "Issue card"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
