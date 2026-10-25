/**
 * A store charges VAT only when it has a VAT number (the owner's decision, 2026-10-25): a
 * business that is not registered for VAT may not charge it. The database holds the rule
 * (`trg_business_settings_vat_needs_number`, migration `20261025110000`: with no number the
 * rate is 0, whatever is sent); the settings form follows it, so what it shows is what is saved.
 */

/** A VAT number that is written (blank or spaces are none). */
export function hasVatNumber(vatNumber: string | null | undefined): boolean {
  return Boolean(vatNumber && vatNumber.trim());
}

type VatSettings = { vat_number?: string | null; default_tax_rate?: number | string | null };

/** The rate the store charges: its own with a VAT number, else none. */
export function chargedTaxRate(settings: VatSettings): number {
  if (!hasVatNumber(settings.vat_number)) return 0;
  const rate = Number(settings.default_tax_rate ?? 0);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}

/**
 * What the form saves when the VAT number is typed: the number, and no rate once it is cleared
 * (the database would drop the rate anyway, and the form would show one that is not charged).
 */
export function vatNumberPatch(vatNumber: string): {
  vat_number: string | null;
  default_tax_rate?: number;
} {
  const value = vatNumber.trim() ? vatNumber : null;
  return value ? { vat_number: value } : { vat_number: null, default_tax_rate: 0 };
}
