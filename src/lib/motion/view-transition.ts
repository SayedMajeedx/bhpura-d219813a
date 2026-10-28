/**
 * A product's photo travels from its card to its page: the router starts a view transition
 * when the card's link says `viewTransition` (after the page's data has loaded, so nothing
 * waits on it), and the photo on both sides carries the same name.
 *
 * A name must be unique on a page, and a product can show twice on one (a rail and the full
 * grid), so a card names its photo only when it is tapped, and lets the name go once the
 * page has changed.
 */
export function productPhotoName(productId: string): string {
  return `product-img-${productId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

const RELEASE_AFTER_MS = 1200;

/** Names the photo inside a tapped card (its first `img`) for the transition to come. */
export function nameTappedPhoto(card: Element | null, productId: string): void {
  const photo = card?.querySelector<HTMLElement>("img");
  if (!photo) return;
  photo.style.viewTransitionName = productPhotoName(productId);
  window.setTimeout(() => {
    photo.style.viewTransitionName = "";
  }, RELEASE_AFTER_MS);
}
