import { Search } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { storefrontBase, storefrontOrigin } from "@/lib/seo/canonical";
import { isServicesProfile, resolveStoreModules } from "@/lib/store-profile";
import { HomeListingFields } from "./seo/HomeListingFields";
import { SearchConsoleCard } from "./seo/SearchConsoleCard";
import { SeoChecklistCard } from "./seo/SeoChecklistCard";

/**
 * How the store looks in Google: the home page's title and description in each language with
 * Google's result as the storefront will write it, the Search Console connection and the sitemap,
 * and what is left to do. A product's and a category's own words are written where they are edited.
 */
export function SeoGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBrand } = useBrandSettingsFormContext();
  const brand = form.brand;
  const bs = form.bs;

  const store = { slug: brand.slug ?? "", custom_domain: brand.custom_domain };
  const bookings = isServicesProfile(
    resolveStoreModules({ store_vertical: bs.store_vertical, store_modules: bs.store_modules }),
  );
  const address = storefrontBase(store);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Search className="size-4 text-primary" aria-hidden="true" />
          <span>{isAr ? "الظهور في محركات البحث (SEO)" : "Search engines (SEO)"}</span>
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {isAr
            ? "اكتب العنوان والوصف اللذين يظهران في نتائج Google وفي بطاقات المشاركة، لكل لغة على حدة."
            : "Write the title and description shown in Google results and in share cards, for each language on its own."}
        </p>
      </div>

      {(["ar", "en"] as const).map((pageLang) => (
        <HomeListingFields
          key={pageLang}
          lang={pageLang}
          isAr={isAr}
          brand={brand}
          businessName={bs.business_name}
          bookings={bookings}
          address={address}
          onChange={(patch) => setBrand(patch)}
        />
      ))}

      <SearchConsoleCard
        isAr={isAr}
        token={brand.google_site_verification}
        sitemapUrl={`${storefrontOrigin(store)}/sitemap.xml`}
        onToken={(token) => setBrand({ google_site_verification: token })}
      />

      {brand.id && <SeoChecklistCard brandId={brand.id} isAr={isAr} brand={brand} />}
    </div>
  );
}
