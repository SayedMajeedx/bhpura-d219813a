import type { MergeableDraft } from "../lib/merge-drafts";

/** What sits under a draft's price field: why it is empty (a conflict) or the old price it will show crossed out. */
export function PriceNotes({ draft, isAr }: { draft: MergeableDraft; isAr: boolean }) {
  return (
    <>
      {draft.originalPrice != null && draft.price !== null && (
        <p className="text-xs text-muted-foreground leading-tight">
          {isAr
            ? `كان ${draft.originalPrice}: يظهر مشطوباً بجانب السعر.`
            : `Was ${draft.originalPrice}: shown struck through next to the price.`}
        </p>
      )}
      {draft.priceConflict && (
        <p className="text-xs text-destructive leading-tight">{draft.priceConflict.reason}</p>
      )}
    </>
  );
}
