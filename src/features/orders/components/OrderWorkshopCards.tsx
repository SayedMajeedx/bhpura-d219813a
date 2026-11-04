import type { ComponentProps } from "react";
import { OrderAlterationsCard } from "./OrderAlterationsCard";
import { OrderPieceChangesCard } from "./OrderPieceChangesCard";

/**
 * The order's workshop cards, outside the editor's fieldset so they work in view mode: changes
 * to a made-to-order piece's measurements (step 4 of `docs/workshop-flow-plan.md`) and the
 * order's alterations (step 3). Each draws nothing when it has nothing to show.
 */
export function OrderWorkshopCards(
  props: ComponentProps<typeof OrderAlterationsCard> & {
    order: ComponentProps<typeof OrderPieceChangesCard>["order"];
  },
) {
  const storeName = (props.settings?.business_name ?? "").trim() || props.storeName;
  return (
    <>
      <OrderPieceChangesCard
        brandId={props.brandId}
        order={props.order}
        items={props.items}
        products={props.products}
        unsaved={props.unsaved}
        storeName={storeName}
        lang={props.lang}
      />
      <OrderAlterationsCard {...props} />
    </>
  );
}
