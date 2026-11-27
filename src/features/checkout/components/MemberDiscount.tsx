import { formatPrice } from "@/lib/storefront-context";
import type { Storefront } from "@/features/checkout/types";

/** The member's tier discount, when it saves more than the code and the offers. */
export type MemberDiscountView = { amount: number; label: string; replacedCode: boolean };

type T = (ar: string, en: string) => string;

/** Its line in the order summary. */
export function MemberDiscountLine({
  member,
  currency,
  lang,
}: {
  member: MemberDiscountView | null;
  currency: string;
  lang: Storefront["lang"];
}) {
  if (!member || member.amount <= 0) return null;
  return (
    <div className="flex justify-between gap-3 font-medium text-emerald-700 dark:text-emerald-400">
      <span className="min-w-0 break-words">{member.label}</span>
      <span className="shrink-0">− {formatPrice(member.amount, currency, lang)}</span>
    </div>
  );
}

/** Why the shopper's code is not used: their member discount saves more. */
export function MemberReplacedCodeNote({ t }: { t: T }) {
  return (
    <p className="text-xs text-muted-foreground" role="status">
      {t(
        "خصم عضويتك يوفّر لك أكثر من هذا الرمز، فطُبّق بدلًا منه.",
        "Your member discount saves you more than this code, so it is used instead.",
      )}
    </p>
  );
}
