import { useId, useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
} from "@/components/ui/app-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOpenSession } from "@/hooks/use-open-session";
import type { IncubatorsPageState } from "@/features/incubators/hooks/use-incubators-page";
import { localDateTimeValue } from "@/features/incubators/lib/forms";
import {
  PARTNER_PAYMENT_METHODS,
  partnerPaymentProblem,
  paymentProblemText,
  type PaymentMethod,
} from "@/features/incubators/lib/payment";
import { methodLabel } from "@/features/supplier-orders/lib/supplier-account";

/**
 * Money a partner shop paid the store: how much (all it owes in one tap), on which day, how
 * (the same four ways as a payment to a supplier) and its reference. The database spreads it on
 * the partner's oldest unpaid sales.
 */
export function PartnerPaymentDialog({ page }: { page: IncubatorsPageState }) {
  const open = page.dialog === "payment";
  // Each opening starts a blank form; what was typed stays while the dialog fades out.
  const session = useOpenSession(open);
  return <PaymentForm key={`${page.currentId ?? ""}-${session}`} open={open} page={page} />;
}

function PaymentForm({ page, open }: { page: IncubatorsPageState; open: boolean }) {
  const { isAr, lang, money, summary, current, busy } = page;
  const uid = useId();
  const today = localDateTimeValue().slice(0, 10);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [tried, setTried] = useState(false);

  const due = summary.due;
  const problem = partnerPaymentProblem({ amount, date, method }, due, today);
  const shown = tried || amount.trim() !== "" ? problem : null;
  const value = Number(amount.trim());

  const save = async () => {
    setTried(true);
    if (problem || !method) return;
    await page.recordPayment({
      amount: value,
      paymentDate: date,
      paymentMethod: method,
      reference: reference.trim() || null,
      notes: notes.trim() || null,
    });
  };

  const dirty = Boolean(amount.trim() || method || reference.trim() || notes.trim());

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => !next && page.closeDialog()}
      kind="form"
      busy={busy}
      dirty={dirty}
      dir={isAr ? "rtl" : "ltr"}
    >
      <AppDialogHeader
        icon={<Wallet />}
        title={isAr ? "تسجيل دفعة" : "Record payment"}
        description={
          <>
            {isAr ? "من " : "From "}
            <bdi>{current?.name}</bdi>
            {isAr
              ? ": تُوزَّع على أقدم المبيعات غير المسددة."
              : ": it settles their oldest unpaid sales first."}
          </>
        }
      />
      <AppDialogBody>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-amount`}>{isAr ? "المبلغ المستلم" : "Amount received"}</Label>
          <div className="flex min-w-0 gap-2">
            <Input
              id={`${uid}-amount`}
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={shown === "amount" || shown === "too_much" || undefined}
              className="min-w-0 flex-1 font-mono tabular-nums"
            />
            {due > 0 && (
              <Button type="button" variant="outline" onClick={() => setAmount(String(due))}>
                {isAr ? "كل المستحق" : "All owed"}
              </Button>
            )}
          </div>
          {(shown === "amount" || shown === "too_much") && (
            <p className="text-xs text-destructive">
              {paymentProblemText(shown, money(due), lang)}
            </p>
          )}
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">{isAr ? "طريقة الدفع" : "Paid by"}</legend>
          <div
            role="radiogroup"
            aria-label={isAr ? "طريقة الدفع" : "Paid by"}
            className="flex flex-wrap gap-2"
          >
            {PARTNER_PAYMENT_METHODS.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                role="radio"
                aria-checked={method === option}
                variant={method === option ? "default" : "outline"}
                onClick={() => setMethod(option)}
                className="rounded-full"
              >
                {methodLabel(option, lang)}
              </Button>
            ))}
          </div>
          {tried && problem === "method" && (
            <p className="text-xs text-destructive">{paymentProblemText("method", "", lang)}</p>
          )}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${uid}-date`}>{isAr ? "تاريخ الاستلام" : "Received on"}</Label>
            <Input
              id={`${uid}-date`}
              type="date"
              value={date}
              max={today}
              onChange={(event) => setDate(event.target.value)}
              aria-invalid={shown === "date" || undefined}
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${uid}-ref`}>
              {isAr ? "رقم المرجع (اختياري)" : "Reference (optional)"}
            </Label>
            <Input
              id={`${uid}-ref`}
              value={reference}
              maxLength={100}
              dir="auto"
              onChange={(event) => setReference(event.target.value)}
            />
          </div>
        </div>
        {shown === "date" && (
          <p className="text-xs text-destructive">{paymentProblemText("date", "", lang)}</p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-notes`}>{isAr ? "ملاحظة (اختياري)" : "Note (optional)"}</Label>
          <Textarea
            id={`${uid}-notes`}
            rows={2}
            maxLength={1000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
      </AppDialogBody>
      <AppDialogFooter
        summary={
          <>
            {isAr ? "عليهم الآن: " : "They owe now: "}
            <b className="font-semibold text-foreground">{money(due)}</b>
          </>
        }
      >
        <Button type="button" variant="outline" onClick={page.closeDialog} disabled={busy}>
          {isAr ? "إلغاء" : "Cancel"}
        </Button>
        <Button type="button" onClick={() => void save()} disabled={busy}>
          {problem === null || problem === "method"
            ? isAr
              ? `تسجيل ${money(value || 0)}`
              : `Record ${money(value || 0)}`
            : isAr
              ? "تسجيل الدفعة"
              : "Record payment"}
        </Button>
      </AppDialogFooter>
    </AppDialog>
  );
}
