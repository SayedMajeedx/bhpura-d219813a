import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { META_DESCRIPTION_LIMIT, META_TITLE_LIMIT, typingMetaText } from "@/lib/seo";
import { homeListing } from "@/lib/seo/listing";
import { ListingPreview } from "@/components/seo/ListingPreview";

type TitleKey = "meta_title" | "meta_title_en";
type DescriptionKey = "meta_description" | "meta_description_en";

/** The brand columns each language's home page is written in. */
const FIELDS: Record<
  "ar" | "en",
  { title: { key: TitleKey }; description: { key: DescriptionKey } }
> = {
  ar: { title: { key: "meta_title" }, description: { key: "meta_description" } },
  en: { title: { key: "meta_title_en" }, description: { key: "meta_description_en" } },
};

type Brand = {
  name_ar?: string | null;
  name_en?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  meta_title_en?: string | null;
  meta_description_en?: string | null;
};

function Counter({ length, limit }: { length: number; limit: number }) {
  return (
    <span
      className={`font-mono text-xs ${length > limit ? "font-semibold text-destructive" : "text-muted-foreground"}`}
    >
      {length}/{limit}
    </span>
  );
}

/** The home page's title and description in one language, with Google's result under them. */
export function HomeListingFields({
  lang,
  isAr,
  brand,
  businessName,
  bookings,
  address,
  onChange,
}: {
  lang: "ar" | "en";
  isAr: boolean;
  brand: Brand;
  businessName?: string | null;
  bookings: boolean;
  address: string;
  onChange: (patch: Partial<Record<TitleKey | DescriptionKey, string | null>>) => void;
}) {
  const fields = FIELDS[lang];
  const title = brand[fields.title.key] ?? "";
  const description = brand[fields.description.key] ?? "";
  const listing = homeListing(brand, lang, { businessName, bookings });
  const idBase = `seo-${lang}`;
  const heading =
    lang === "ar"
      ? isAr
        ? "الصفحة الرئيسية بالعربية"
        : "Home page in Arabic"
      : isAr
        ? "الصفحة الرئيسية بالإنجليزية"
        : "Home page in English";

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
      <ListingPreview listing={listing} address={address} lang={lang} isAr={isAr} />
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <Label htmlFor={`${idBase}-title`} className="font-medium">
            {isAr ? "العنوان" : "Title"}
          </Label>
          <Counter length={title.length} limit={META_TITLE_LIMIT} />
        </div>
        <Input
          id={`${idBase}-title`}
          dir={lang === "ar" ? "rtl" : "ltr"}
          value={title}
          maxLength={META_TITLE_LIMIT}
          onChange={(e) =>
            onChange({
              [fields.title.key]: typingMetaText(e.target.value, META_TITLE_LIMIT) || null,
            })
          }
          placeholder={
            lang === "ar"
              ? "اسم المتجر وما يميّزه باختصار"
              : "Store name and what makes it different"
          }
          className="h-9 text-xs"
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <Label htmlFor={`${idBase}-description`} className="font-medium">
            {isAr ? "الوصف" : "Description"}
          </Label>
          <Counter length={description.length} limit={META_DESCRIPTION_LIMIT} />
        </div>
        <Textarea
          id={`${idBase}-description`}
          dir={lang === "ar" ? "rtl" : "ltr"}
          value={description}
          maxLength={META_DESCRIPTION_LIMIT}
          rows={3}
          onChange={(e) =>
            onChange({
              [fields.description.key]:
                typingMetaText(e.target.value, META_DESCRIPTION_LIMIT) || null,
            })
          }
          placeholder={
            lang === "ar"
              ? "جملة أو جملتان عمّا تبيعه ولمن"
              : "One or two sentences on what you sell and for whom"
          }
          className="min-h-[72px] text-xs"
        />
      </div>
    </section>
  );
}
