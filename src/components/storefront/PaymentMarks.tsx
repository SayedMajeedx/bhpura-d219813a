import { Banknote } from "lucide-react";
import type { PaymentMark } from "@/features/storefront-shell/lib/footer-care";

const CHIP =
  "inline-flex h-7 items-center gap-1.5 rounded-md border border-current/15 px-2 text-xs leading-none";

/**
 * The store's payment methods as quiet marks in the footer's own colour, as luxury stores show
 * them: one colour, one height, the card schemes by their shape and the rest in words.
 */
export function PaymentMarks({ marks, lang }: { marks: PaymentMark[]; lang: "ar" | "en" }) {
  if (marks.length === 0) return null;
  return (
    <ul
      className="flex flex-wrap items-center gap-1.5"
      aria-label={lang === "ar" ? "طرق الدفع" : "Ways to pay"}
    >
      {marks.map((mark) => (
        <li key={mark} className={CHIP}>
          {mark === "benefit" && (
            <span dir="ltr" className="font-semibold">
              BenefitPay
            </span>
          )}
          {mark === "visa" && (
            <span
              dir="ltr"
              className="font-black italic tracking-tight"
              aria-label={lang === "ar" ? "فيزا" : "Visa"}
            >
              VISA
            </span>
          )}
          {mark === "mastercard" && (
            <svg
              viewBox="0 0 32 20"
              className="h-4 w-auto"
              role="img"
              aria-label={lang === "ar" ? "ماستركارد" : "Mastercard"}
            >
              <circle cx="11" cy="10" r="8" fill="currentColor" opacity="0.9" />
              <circle cx="21" cy="10" r="8" fill="currentColor" opacity="0.5" />
            </svg>
          )}
          {mark === "cod" && (
            <>
              <Banknote aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>{lang === "ar" ? "الدفع عند الاستلام" : "Cash on delivery"}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
