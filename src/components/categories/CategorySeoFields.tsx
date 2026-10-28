import { SeoListingEditor, type SeoWords } from "@/components/seo/SeoListingEditor";
import { useBrand } from "@/lib/brand-context";
import { storefrontCanonical } from "@/lib/seo/canonical";
import { categoryListing } from "@/lib/seo/listing";

type CategoryForm = SeoWords & { name_ar: string; name_en: string; slug: string };

/** The title and description Google shows for a category page, in each language. */
export function CategorySeoFields<Form extends CategoryForm>({
  form,
  setForm,
  isAr,
}: {
  form: Form;
  setForm: (form: Form) => void;
  isAr: boolean;
}) {
  const brand = useBrand();
  const storeName = (lang: "ar" | "en") =>
    (lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en) || brand.slug;

  return (
    <SeoListingEditor
      isAr={isAr}
      words={form}
      onChange={(patch) => setForm({ ...form, ...patch })}
      address={storefrontCanonical(brand, form.slug.trim() || "category")}
      listing={(lang) =>
        categoryListing(form, lang, {
          name: (lang === "ar" ? form.name_ar || form.name_en : form.name_en) || form.name_en,
          storeName: storeName(lang),
        })
      }
    />
  );
}
