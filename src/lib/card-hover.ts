/**
 * Whether a pointer may show a product card's hover look (its second photo). Only a mouse rests
 * on a card: a finger's tap also fires `pointerenter`, so on a phone the second photo flashed in
 * on the same tap that opened the product page. A pen counts as a finger.
 */
export function cardHoverPointer(pointerType: string): boolean {
  return pointerType === "mouse";
}
