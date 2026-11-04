/**
 * Where a piece added to an order comes from at first: the store's own stock while it has some,
 * else a partner shop holding one; a made-to-order piece with none is made. Staff change it on the
 * line (`LineSupplyChoice`). It once sent every piece the store had none of to the partner shop,
 * a made-to-order one too, whose save then failed for want of stock.
 */
export function lineSupplyFor({
  mainStock,
  partnerStock,
  madeToOrder,
}: {
  mainStock: number;
  partnerStock: number;
  madeToOrder: boolean;
}): "main" | "incubator" | "custom" {
  if (mainStock > 0) return "main";
  if (partnerStock > 0) return "incubator";
  return madeToOrder ? "custom" : "main";
}
