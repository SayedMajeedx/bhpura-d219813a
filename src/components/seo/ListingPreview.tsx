import { Globe } from "lucide-react";
import type { Listing } from "@/lib/seo/listing";

/**
 * Google's result for a page as the storefront will write it (`homeListing` and its siblings are
 * the ones the page's head calls). When the store wrote nothing, it says so: those are the
 * platform's words, shown until the store writes its own.
 */
export function ListingPreview({
  listing,
  address,
  lang,
  isAr,
}: {
  listing: Listing;
  address: string;
  lang: "ar" | "en";
  isAr: boolean;
}) {
  return (
    <div className="space-y-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Globe className="size-3.5 text-primary" aria-hidden="true" />
        {isAr
          ? lang === "ar"
            ? "كما سيظهر في Google بالعربية"
            : "كما سيظهر في Google بالإنجليزية"
          : lang === "ar"
            ? "As Google shows it in Arabic"
            : "As Google shows it in English"}
      </span>
      <div
        className="space-y-1 rounded-lg border border-border bg-background p-3.5 shadow-xs"
        dir={lang === "ar" ? "rtl" : "ltr"}
      >
        <div className="truncate font-mono text-xs text-muted-foreground" dir="ltr">
          {address.replace(/^https?:\/\//, "").replace(/\//g, " › ")}
        </div>
        <h4 className="line-clamp-2 break-words text-sm font-medium text-info">{listing.title}</h4>
        <p className="line-clamp-3 break-words text-xs leading-relaxed text-muted-foreground">
          {listing.description}
        </p>
      </div>
      {listing.fallback && (
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "هذه الكلمات من المنصة لأنك لم تكتب عنوانًا ولا وصفًا. اكتب كلماتك أدناه لتحل محلها."
            : "These are the platform's words because you wrote no title or description. Write yours below to replace them."}
        </p>
      )}
    </div>
  );
}
