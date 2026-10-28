import { Wallet } from "lucide-react";
import { advanceLines } from "@/lib/payments/advance-payment";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ExpectedAdvance } from "@/features/orders/lib/expected-advance";

type Lang = "en" | "ar";

/** The heading, the status chip and what approving a transfer will record, in words. */
export function advanceNoticeText(
  expected: ExpectedAdvance,
  lang: Lang,
  money: (n: number) => string,
) {
  const ar = lang === "ar";
  const { split, payInFull, isDeposit, standing } = expected;
  const title = payInFull
    ? ar
      ? "العميل يدفع المبلغ كاملاً الآن"
      : "Customer pays the full amount now"
    : isDeposit
      ? ar
        ? "عربون الحجز"
        : "Booking deposit"
      : ar
        ? "دفعة مقدمة مطلوبة"
        : "Advance payment required";
  const chip =
    standing === "paid"
      ? ar
        ? "تم التحصيل"
        : "Collected"
      : standing === "advance_paid"
        ? ar
          ? "تم تحصيل الدفعة"
          : "Advance collected"
        : ar
          ? "لم تُحصَّل بعد"
          : "Not collected yet";
  const records =
    standing === "awaiting"
      ? payInFull
        ? ar
          ? `اعتماد التحويل يسجّل المبلغ كاملاً: ${money(split.dueNow)}`
          : `Approving the transfer records the full amount: ${money(split.dueNow)}`
        : ar
          ? `اعتماد التحويل يسجّل ${money(split.dueNow)} فقط، ويبقى ${money(split.balance)}`
          : `Approving the transfer records ${money(split.dueNow)} only; ${money(split.balance)} stays due`
      : null;
  return { title, chip, records };
}

/**
 * What the shopper was asked to pay now. The order's `advance_paid` stays 0 until a transfer is
 * approved, so without this an order placed under a 50% advance reads like a plain unpaid one.
 */
export function AdvanceRequirementNotice({
  expected,
  currency,
  lang,
  appointment = false,
  className,
}: {
  expected: ExpectedAdvance;
  currency: string;
  lang: Lang;
  appointment?: boolean;
  className?: string;
}) {
  const money = (n: number) => formatMoney(n, currency, lang);
  const { title, chip, records } = advanceNoticeText(expected, lang, money);
  const lines = advanceLines(expected.split, {
    isAr: lang === "ar",
    money,
    balanceWhen: appointment ? "event" : "delivery",
  });
  return (
    <div
      role="group"
      aria-label={title}
      className={cn(
        "space-y-1.5 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 font-bold text-foreground">
          <Wallet className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="break-words">{title}</span>
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 font-semibold",
            expected.standing === "awaiting"
              ? "bg-amber-100 text-amber-900"
              : "bg-emerald-100 text-emerald-800",
          )}
        >
          {chip}
        </span>
      </div>
      {lines.map((line) => (
        <p key={line} className="text-foreground">
          {line}
        </p>
      ))}
      {records && <p className="font-semibold text-foreground">{records}</p>}
    </div>
  );
}
