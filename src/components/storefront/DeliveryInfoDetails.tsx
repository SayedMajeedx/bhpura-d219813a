import { Fragment } from "react";
import { Link } from "@tanstack/react-router";
import type { DeliveryInfo } from "@/lib/delivery-info";

/**
 * What a shopper is told about delivery and returns, drawn from `deliveryInfo`: the facts as a
 * short list, then the store's own words, then its policy pages to read in full. The product
 * page shows it, and the settings show the same thing to the merchant while they edit (with no
 * `slug`, the pages are named and not linked).
 */
export function DeliveryInfoDetails({ info, slug }: { info: DeliveryInfo; slug?: string }) {
  return (
    <div className="space-y-3 text-xs leading-relaxed">
      {info.facts.length > 0 && (
        <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-4 gap-y-2">
          {info.facts.map((fact) => (
            <Fragment key={fact.key}>
              <dt className="text-muted-foreground break-words" dir="auto">
                {fact.label}
              </dt>
              <dd className="font-medium text-foreground break-words" dir="auto">
                {fact.text}
              </dd>
            </Fragment>
          ))}
        </dl>
      )}
      {info.note && (
        <p
          className="whitespace-pre-line break-words border-t border-border pt-2.5 opacity-90 text-page-start"
          dir="auto"
        >
          {info.note}
        </p>
      )}
      {info.returnTerms && (
        <p
          className="whitespace-pre-line break-words border-t border-border pt-2.5 opacity-90 text-page-start"
          dir="auto"
        >
          {info.returnTerms}
        </p>
      )}
      {info.pages.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2.5">
          {info.pages.map((page) =>
            slug ? (
              <Link
                key={page.idx}
                to="/$slug/page/$idx"
                params={{ slug, idx: String(page.idx) }}
                className="font-medium text-primary underline underline-offset-2"
              >
                {page.title}
              </Link>
            ) : (
              <span
                key={page.idx}
                className="font-medium text-primary underline underline-offset-2"
              >
                {page.title}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
