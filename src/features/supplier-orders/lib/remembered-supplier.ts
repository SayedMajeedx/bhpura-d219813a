/**
 * The supplier this browser last sent a customer's pieces to, per store: "Send to workshop"
 * opens on them (the owner's request of 2026-11-04: choose the supplier once). A convenience of
 * this browser only; it can be missing or refused, and the choice is always shown to change.
 */

const keyOf = (brandId: string) => `boutq:workshop-supplier:${brandId}`;

export function rememberedSupplier(
  brandId: string,
  suppliers: ReadonlyArray<{ id: string }>,
): string | null {
  try {
    const id = window.localStorage.getItem(keyOf(brandId));
    return id && suppliers.some((s) => s.id === id) ? id : null;
  } catch {
    return null;
  }
}

export function rememberSupplier(brandId: string, vendorId: string) {
  try {
    if (vendorId) window.localStorage.setItem(keyOf(brandId), vendorId);
  } catch {
    // Storage refused (a private window): the next send asks again.
  }
}
