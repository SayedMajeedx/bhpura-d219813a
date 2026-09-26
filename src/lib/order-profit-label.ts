/**
 * The label of an order's gross profit. While the customer still owes money
 * it reads "expected after full collection", so unpaid profit never looks
 * realized (order editor and quick view).
 */
export function grossProfitLabel(remaining: number, lang: "ar" | "en") {
  if (remaining > 0) {
    return lang === "ar"
      ? "الربح الإجمالي المتوقع بعد التحصيل الكامل:"
      : "Estimated gross profit after full collection:";
  }
  return lang === "ar" ? "الربح الإجمالي التقديري:" : "Estimated gross profit:";
}
