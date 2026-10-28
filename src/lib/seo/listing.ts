/**
 * What Google shows for a store's pages: the title and the description of its home page, a
 * category and a product, in the page's language. The page's head and the settings' preview call
 * these same functions, so the preview is the result and not a guess.
 *
 * A store writes its own words; without them a page says only what is true of every store (never
 * a promise: it once said "fast delivery and secure checkout" in the preview and "Shop X online."
 * on the page).
 */

type Lang = "ar" | "en";

export type Listing = {
  title: string;
  description: string;
  /** True when the store wrote neither: the words are the platform's. */
  fallback: boolean;
};

type StoreWords = {
  name_ar?: string | null;
  name_en?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  meta_title_en?: string | null;
  meta_description_en?: string | null;
};

const text = (value: string | null | undefined) => value?.trim() || "";

/**
 * The home page's title and description. The English page uses the English fields and, while it has
 * none, the ones written before there were two (they were shown in both languages).
 */
export function homeListing(
  store: StoreWords,
  lang: Lang,
  options: { businessName?: string | null; bookings?: boolean } = {},
): Listing {
  const nameAr = text(options.businessName) || text(store.name_ar) || text(store.name_en);
  const nameEn = text(options.businessName) || text(store.name_en) || text(store.name_ar);
  const written =
    lang === "ar"
      ? { title: text(store.meta_title), description: text(store.meta_description) }
      : {
          title: text(store.meta_title_en) || text(store.meta_title),
          description: text(store.meta_description_en) || text(store.meta_description),
        };

  const title =
    written.title ||
    (lang === "ar"
      ? options.bookings
        ? `${nameAr} — احجز موعدك أونلاين`
        : text(options.businessName) ||
          text(store.name_ar) ||
          `${text(store.name_en)} — متجر إلكتروني`
      : options.bookings
        ? `${nameEn} — Book online`
        : text(options.businessName) ||
          text(store.name_en) ||
          `${text(store.name_ar)} — Online Store`);
  const description =
    written.description ||
    (lang === "ar"
      ? options.bookings
        ? `احجز مع ${nameAr} أونلاين: شاهد التواريخ المتاحة وخدماتنا وعروضنا.`
        : `تسوق من ${text(store.name_ar) || text(store.name_en)} أونلاين.`
      : options.bookings
        ? `Book ${nameEn} online: see the free dates, our services and offers.`
        : `Shop ${text(store.name_en) || text(store.name_ar)} online.`);
  return { title, description, fallback: !written.title && !written.description };
}

type PageWords = {
  seo_title_ar?: string | null;
  seo_title_en?: string | null;
  seo_description_ar?: string | null;
  seo_description_en?: string | null;
};

/** What a product or a category wrote for Google in this language (never the other language's). */
export function writtenListing(
  words: PageWords | null | undefined,
  lang: Lang,
): { title: string; description: string } {
  return {
    title: text(lang === "ar" ? words?.seo_title_ar : words?.seo_title_en),
    description: text(lang === "ar" ? words?.seo_description_ar : words?.seo_description_en),
  };
}

/**
 * A category's title and description: its own words, else "Name | Store" and one true sentence
 * (a services store is booked, not shopped).
 */
export function categoryListing(
  category: PageWords | null | undefined,
  lang: Lang,
  names: { name: string; storeName: string; servicesStore?: boolean },
): Listing {
  const written = writtenListing(category, lang);
  const { name, storeName } = names;
  const description = names.servicesStore
    ? lang === "ar"
      ? `احجز ${name} من ${storeName}.`
      : `Book ${name} with ${storeName}.`
    : lang === "ar"
      ? `تسوّق ${name} من ${storeName}.`
      : `Shop ${name} at ${storeName}.`;
  return {
    title: written.title || `${name} | ${storeName}`,
    description: written.description || description,
    fallback: !written.title && !written.description,
  };
}
