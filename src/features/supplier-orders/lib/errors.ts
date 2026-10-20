/**
 * What a refusal from the database means, in the reader's language: never a bare code.
 * The codes are raised by migrations `20261019100000` and `20261019110000` and the accounting
 * triggers; `tests/supplier-order-errors.test.ts` fails on a code raised with no words here.
 */
export const WORDS: Array<[code: string, ar: string, en: string]> = [
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
  [
    "PURCHASE_ORDER_HAS_PAYMENTS",
    "على هذه الطلبية دفعات مسجّلة، فلا تُحذف حتى لا يضيع سجلها. ألغِ الدفعات أولاً من قائمة الدفعات، أو ألغِ الطلبية لتبقى في السجل.",
    "This order has payments recorded, so it is not deleted (their record would be lost). Take the payments back first, or cancel the order to keep it on record.",
  ],
  [
    "PAYMENT_MORE_THAN_OWED",
    "المبلغ أكثر من الباقي على هذه الطلبية.",
    "The amount is more than is still owed on this order.",
  ],
  [
    "INVALID_PAYMENT_AMOUNT",
    "اكتب مبلغاً أكبر من صفر، بثلاث خانات عشرية على الأكثر.",
    "Type an amount above zero, with at most three decimals.",
  ],
  [
    "INVALID_PAYMENT_DATE",
    "اختر يوم الدفع، اليوم أو قبله.",
    "Choose the day it was paid: today or before.",
  ],
  ["VOID_REASON_REQUIRED", "اكتب سبب إلغاء الدفعة.", "Type why the payment is taken back."],
  [
    "PAYMENT_NOT_FOUND",
    "لم تعد هذه الدفعة موجودة. حدّث الصفحة.",
    "This payment no longer exists. Refresh the page.",
  ],
  [
    "PURCHASE_ORDER_LINE_HAS_NO_PIECE",
    "هذا السطر تكلفة على الطلبية، ليس قطعاً تُستلم.",
    "This line is a cost of the order, not pieces to receive.",
  ],
  [
    "PURCHASE_ORDER_LINE_TWICE",
    "ظهر المقاس نفسه مرتين في الاستلام. حدّث الصفحة وأعد المحاولة.",
    "The same size appeared twice in the receipt. Refresh the page and try again.",
  ],
  [
    "PURCHASE_ORDER_STATE_IS_THE_DATABASES",
    "حالة الطلبية تتغير بالاستلام وحده. حدّث الصفحة.",
    "An order's state changes by receiving it. Refresh the page.",
  ],
  ["REQUEST_ID_REQUIRED", "تعذر الإرسال، حاول مرة أخرى.", "Could not send. Please try again."],
  [
    "CUSTOMER_PIECE_IS_SENT_FROM_ITS_ORDER",
    "قطعة الزبون تُرسل من طلبه، ولا يتغير منها هنا إلا سعرها.",
    "A customer's piece is sent from their order; only its price changes here.",
  ],
  [
    "ORDER_LINE_ALREADY_WITH_SUPPLIER",
    "هذه القطعة عند مورد الآن في طلبية مفتوحة: تُرسل مرة أخرى بعد رجوعها.",
    "This piece is with a supplier now, on an open order: it goes again once it is back.",
  ],
  [
    "ORDER_NOT_CANCELLED",
    "طلب الزبون غير ملغى: القطعة له.",
    "The customer's order is not cancelled: the piece is theirs.",
  ],
  [
    "ORDER_CANCELLED",
    "طلب الزبون ملغى، فلا تُرسل قطعه.",
    "The customer's order is cancelled, so its pieces are not sent.",
  ],
  [
    "PIECE_ALREADY_ARRIVED",
    "وصلت القطعة من المورد، فلا تُوقف. احتفظ بها للبيع.",
    "The piece has arrived, so it cannot be stopped. Keep it for sale instead.",
  ],
  [
    "PIECE_HAS_NO_SIZE",
    "هذه القطعة بلا مقاس من مقاسات المتجر، فلا تدخل المخزون.",
    "This piece has none of the store's sizes, so it cannot join the stock.",
  ],
  ["INVALID_PURPOSE", "تعذر الإرسال، حدّث الصفحة.", "Could not send. Refresh the page."],
  ["INVALID_CHOICE", "تعذر الحفظ، حدّث الصفحة.", "Could not save. Refresh the page."],
  [
    "SUPPLIER_NOT_FOUND",
    "هذا المورد غير موجود في متجرك. اختر مورداً آخر.",
    "This supplier is not in your store. Choose another one.",
  ],
  ["NOTHING_TO_SEND", "اختر قطعة واحدة على الأقل.", "Choose at least one piece."],
  [
    "INVALID_PIECE_COST",
    "اكتب تكلفة القطعة رقماً، صفراً أو أكثر.",
    "Type the piece's cost as a number, zero or more.",
  ],
  [
    "ORDER_LINE_NOT_FOUND",
    "تغيّر طلب الزبون. حدّث الصفحة وأعد المحاولة.",
    "The customer's order changed. Refresh the page and try again.",
  ],
  ["ORDER_NOT_FOUND", "لم يعد طلب الزبون موجوداً.", "The customer's order no longer exists."],
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
