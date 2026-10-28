/**
 * The store's SEO checklist: what is still to do for Google to show the store well, counted from
 * what the store has written.
 */

export type SeoChecklistItem = {
  id: "home_ar" | "home_en" | "verified" | "descriptions" | "photos";
  done: boolean;
  /** How many products the item is about (descriptions, photos). */
  count?: number;
};

type Input = {
  brand: {
    meta_title?: string | null;
    meta_description?: string | null;
    meta_title_en?: string | null;
    meta_description_en?: string | null;
    google_site_verification?: string | null;
  };
  /** Active products with no description in either language, and with no photo. */
  productsWithoutDescription: number;
  productsWithoutPhoto: number;
};

const has = (value: string | null | undefined) => Boolean(value?.trim());

/** Each language's home page is done when its title and its description are both written. */
export function seoChecklist(input: Input): SeoChecklistItem[] {
  const { brand } = input;
  return [
    { id: "home_ar", done: has(brand.meta_title) && has(brand.meta_description) },
    { id: "home_en", done: has(brand.meta_title_en) && has(brand.meta_description_en) },
    { id: "verified", done: has(brand.google_site_verification) },
    {
      id: "descriptions",
      done: input.productsWithoutDescription === 0,
      count: input.productsWithoutDescription,
    },
    { id: "photos", done: input.productsWithoutPhoto === 0, count: input.productsWithoutPhoto },
  ];
}
