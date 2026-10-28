import { readHours } from "@/lib/opening-hours";
import { storefrontBase } from "@/lib/seo/canonical";

/**
 * A services store's entry for local search (schema.org `LocalBusiness`): who it is, how to reach
 * it, the country it serves and the hours it takes orders and bookings, from the store's own
 * settings. It is the main route to Google's local results for a store that books. Nothing is made
 * up: no address (a store keeps none), and hours only when the store turned them on.
 */

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** The country a currency belongs to, among the GCC's own: where the store's customers are. */
const COUNTRY_OF_CURRENCY: Record<string, { code: string; name: string }> = {
  BHD: { code: "BH", name: "Bahrain" },
  SAR: { code: "SA", name: "Saudi Arabia" },
  AED: { code: "AE", name: "United Arab Emirates" },
  KWD: { code: "KW", name: "Kuwait" },
  QAR: { code: "QA", name: "Qatar" },
  OMR: { code: "OM", name: "Oman" },
};

type HoursSpec = {
  "@type": "OpeningHoursSpecification";
  dayOfWeek: string[];
  opens: string;
  closes: string;
};

/** The hours as Google reads them: days with the same window are one entry. */
export function openingHoursSpecification(raw: unknown): HoursSpec[] {
  const hours = readHours(raw);
  if (!hours.enabled) return [];
  const byWindow = new Map<string, HoursSpec>();
  hours.days.forEach((windows, day) => {
    for (const window of windows) {
      // schema.org writes the end of the day as 23:59.
      const closes = window.to === "24:00" ? "23:59" : window.to;
      const key = `${window.from}-${closes}`;
      const existing = byWindow.get(key);
      if (existing) existing.dayOfWeek.push(DAYS[day]);
      else
        byWindow.set(key, {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: [DAYS[day]],
          opens: window.from,
          closes,
        });
    }
  });
  return [...byWindow.values()];
}

type Brand = {
  slug?: string;
  name_en?: string | null;
  name_ar?: string | null;
  custom_domain?: string | null;
};
type Settings = {
  business_name?: string | null;
  currency?: string | null;
  whatsapp_number?: string | null;
  opening_hours?: unknown;
  socials?: Record<string, string> | Array<{ name: string; url: string }> | null;
};

export function buildLocalBusinessSchema({
  brand,
  settings,
  lang,
  image,
  description,
}: {
  brand: Brand;
  settings: Settings | null | undefined;
  lang: "ar" | "en";
  image?: string | null;
  description?: string | null;
}) {
  const name =
    settings?.business_name ||
    (lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en || brand.name_ar) ||
    brand.slug ||
    "";
  const country = COUNTRY_OF_CURRENCY[(settings?.currency || "").toUpperCase()];
  const hours = openingHoursSpecification(settings?.opening_hours);
  const socials = Array.isArray(settings?.socials)
    ? settings.socials.map((item) => item?.url)
    : Object.values(settings?.socials ?? {});
  const sameAs = socials.filter(
    (url): url is string => typeof url === "string" && /^https?:\/\//i.test(url),
  );

  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name,
    url: storefrontBase({ slug: brand.slug || "", custom_domain: brand.custom_domain }),
    ...(image ? { image } : {}),
    ...(description ? { description } : {}),
    ...(settings?.whatsapp_number ? { telephone: settings.whatsapp_number } : {}),
    ...(country ? { areaServed: { "@type": "Country", name: country.name } } : {}),
    ...(hours.length > 0 ? { openingHoursSpecification: hours } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}
