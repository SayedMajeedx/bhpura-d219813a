import { createVariants, removeVariants, updateVariant, type NewVariant } from "@/lib/data/catalog";
import { becomePatch, type FirstSizes } from "./first-sizes";

type NewSize = NewVariant & Parameters<typeof becomePatch>[0];

/**
 * Adds sizes to a product by the one rule (`firstSizes`): the inventory's bulk dialog and a
 * supplier's order both call it, so a product sold with no options never keeps its default beside
 * its new sizes, whichever screen added them.
 *
 * - `add`: the sizes are made.
 * - `become`: the size at `becomeAt` is the default itself (its options, codes and prices change;
 *   its pieces, history, cost and order lines stay), and the rest are made.
 * - `replace`: the sizes are made first, then the default is removed (archived when it has a
 *   history), so the product always keeps a size. When that fails, `leftover` says so.
 *
 * Answers each size's id in the order given (the default's own id for the one it became).
 */
export async function addSizesToProduct({
  brandId,
  first,
  sizes,
  becomeAt,
}: {
  brandId: string;
  first: FirstSizes;
  sizes: readonly NewSize[];
  /** Which size the default becomes, for `become`. */
  becomeAt: number;
}): Promise<{ ids: string[]; leftover: boolean }> {
  const becomes = first.kind === "become" && becomeAt >= 0 && becomeAt < sizes.length;
  const made = sizes.filter((_, index) => !becomes || index !== becomeAt);
  const madeIds = made.length > 0 ? await createVariants(brandId, [...made]) : [];
  if (becomes) {
    await updateVariant(brandId, first.defaultId, becomePatch(sizes[becomeAt]));
  }
  let leftover = false;
  if (first.kind === "replace") {
    leftover = await removeVariants([first.defaultId]).then(
      () => false,
      () => true,
    );
  }
  let next = 0;
  const ids = sizes.map((_, index) =>
    becomes && index === becomeAt && first.kind === "become" ? first.defaultId : madeIds[next++],
  );
  return { ids, leftover };
}
