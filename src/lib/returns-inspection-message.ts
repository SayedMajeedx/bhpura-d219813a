/**
 * What staff read after inspecting a returned piece: whether it went back into stock, and why
 * not when it did not. A piece that was made to order for one customer is never put back into
 * ready stock, even in sellable condition (the database decides; this only says so).
 */
export function inspectionResultMessage(
  result: { restocked?: boolean; madeToOrder?: boolean },
  quantity: number,
  isAr: boolean,
): string {
  if (result.restocked) {
    return isAr
      ? `تم فحص البند وتحديث المخزون (+${quantity}) بنجاح`
      : `Item inspected and restocked (+${quantity}) successfully`;
  }
  if (result.madeToOrder) {
    return isAr
      ? "تم تسجيل الفحص. القطعة صُنعت حسب الطلب، فلا تُضاف إلى المخزون الجاهز."
      : "Inspection recorded. The piece was made to order, so it is not added to ready stock.";
  }
  return isAr ? "تم تسجيل حالة الفحص بنجاح" : "Item inspection recorded successfully";
}
