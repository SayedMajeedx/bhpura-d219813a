/**
 * A sale or offer badge, in the store's own badge colour: Settings → Palette → "Sale badge accent"
 * (`business_settings.badge_accent`: maroon, crimson, slate or emerald), which `shellTheme` writes
 * as `--badge-accent-bg`. Every choice is a dark tone, so the text is white. The settings' preview
 * drew the store's choice while the store drew every sale in the error red (the cards and quick
 * view) or black (the product page): Pura chose maroon and showed red on its dusty-pink rails.
 */
export const SALE_BADGE_CLASS = "bg-[var(--badge-accent-bg,var(--primary))] text-white";
