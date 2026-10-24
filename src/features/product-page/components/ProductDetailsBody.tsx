import { Fragment } from "react";
import { AlertTriangle } from "lucide-react";
import { useStorefront } from "@/lib/storefront-context";
import type { DetailLine, detailGroups } from "@/features/product-page/lib/product-details";

/**
 * What the product details section holds, drawn for the store's kind (`detailGroups`): a
 * perfume's notes as its pyramid, top to base; a food's allergens as a note of their own; the
 * rest as a table, a list's items as chips; then the store's care text.
 */
export function ProductDetailsBody({
  groups,
  care,
}: {
  groups: ReturnType<typeof detailGroups>;
  care: string | null;
}) {
  const { t } = useStorefront();
  return (
    <div className="space-y-3 text-xs leading-relaxed">
      {groups.allergens && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <span>
            <span className="font-semibold">{groups.allergens.label}: </span>
            {groups.allergens.value}
          </span>
        </p>
      )}

      {groups.notes.length > 0 && (
        <ol className="space-y-2" aria-label={t("هرم النفحات", "The scent's notes")}>
          {groups.notes.map((line, i) => (
            <li key={line.key} className="flex flex-col gap-1">
              <span className="flex items-center gap-2 text-muted-foreground">
                {/* Narrow at the top, wide at the base, as the notes unfold. */}
                <span
                  aria-hidden="true"
                  className="h-1 rounded-full bg-primary/40"
                  style={{ width: `${1 + i * 0.75}rem` }}
                />
                {line.label}
              </span>
              <Chips items={line.items ?? [line.value]} />
            </li>
          ))}
        </ol>
      )}

      {groups.rest.length > 0 && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
          {groups.rest.map((line: DetailLine) => (
            <Fragment key={line.key}>
              <dt className="text-muted-foreground">{line.label}</dt>
              <dd dir="auto" className="text-page-start min-w-0 break-words font-medium">
                {line.items && line.items.length > 1 ? <Chips items={line.items} /> : line.value}
              </dd>
            </Fragment>
          ))}
        </dl>
      )}

      {care && <p className="whitespace-pre-line opacity-90">{care}</p>}
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li
          key={item}
          dir="auto"
          className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 font-medium"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
