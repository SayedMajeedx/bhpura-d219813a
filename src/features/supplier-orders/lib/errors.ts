/**
 * What a refusal from the database means, in the reader's language: never a bare code.
 * The codes are raised by migration `20261019100000` and the accounting triggers.
 */
const WORDS: Array<[code: string, ar: string, en: string]> = [
  [
    "RECEIVE_MORE_THAN_ORDERED",
    "الكمية المستلمة أكثر من المتبقي في الطلبية. عدّل الطلبية أولاً إن وصل أكثر.",
    "More pieces than are still to come. Change the order first if more arrived.",
  ],
  [
    "PURCHASE_ORDER_NOT_OPEN",
    "هذه الطلبية ليست بانتظار الاستلام.",
    "This order is not awaiting delivery.",
  ],
  [
    "PURCHASE_ORDER_LINE_ALREADY_RECEIVED",
    "وصلت قطع من هذا المقاس، فلا يمكن تغيير مقاسه أو تكلفته أو حذفه.",
    "Pieces of this size have arrived: its size and cost can no longer change, and it cannot be removed.",
  ],
  [
    "PURCHASE_ORDER_LINE_BELOW_RECEIVED",
    "لا يمكن أن تقل الكمية عمّا وصل فعلاً.",
    "A quantity cannot be lower than what has already arrived.",
  ],
  [
    "PURCHASE_ORDER_ALREADY_RECEIVED",
    "وصلت قطع من هذه الطلبية، فلا يمكن إلغاؤها أو حذفها. خفّض الكميات إلى ما وصل بدلاً من ذلك.",
    "Pieces of this order have arrived, so it cannot be cancelled or deleted. Lower its quantities to what came instead.",
  ],
  [
    "CROSS_BRAND_PURCHASE_ORDER",
    "هذا المورد أو المنتج لا يتبع هذا المتجر.",
    "This supplier or product does not belong to this store.",
  ],
  ["INVALID_QUANTITY", "اكتب عدداً صحيحاً من القطع.", "Type a whole number of pieces."],
  ["NOTHING_TO_RECEIVE", "اكتب كم قطعة وصلت.", "Type how many pieces arrived."],
  ["NOT_AUTHORIZED", "ليست لديك صلاحية لهذا.", "You do not have permission for this."],
  ["row-level security", "ليست لديك صلاحية لهذا.", "You do not have permission for this."],
  ["permission denied", "ليست لديك صلاحية لهذا.", "You do not have permission for this."],
  [
    "NOT_FOUND",
    "لم تعد هذه الطلبية موجودة. حدّث الصفحة.",
    "This order no longer exists. Refresh the page.",
  ],
];

export function supplierOrderError(error: unknown, isAr: boolean): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error ?? "");
  const found = WORDS.find(([code]) => message.includes(code));
  if (found) return isAr ? found[1] : found[2];
  return isAr ? "تعذر الحفظ، حاول مرة أخرى." : "Could not save. Please try again.";
}
