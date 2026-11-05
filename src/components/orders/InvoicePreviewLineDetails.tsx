import { Paperclip } from "lucide-react";
import { LineNotes } from "@/components/orders/LineNotes";
import { resolveAllVariantAxes } from "@/lib/addons/addon-registry";
import { lineFields, lineSizeText } from "@/lib/made-to-measure";
import {
  customFieldLabel,
  customFieldValue,
  withoutRepeatedOptions,
  type OrderCustomField,
} from "@/lib/order-custom-fields";
import { translateOptionValue } from "@/lib/variant-i18n";

type Line = Parameters<typeof lineSizeText>[0] & {
  selected_variant?: { color?: string | null; fabric?: string | null } | null;
  custom_field_values?: OrderCustomField[] | null;
  products?: unknown;
  product?: unknown;
};

/** A line's options, the customer's answers and the notes for the workshop, on the store's preview. */
export function InvoicePreviewLineDetails({
  it,
  lang,
  addonDefaults,
}: {
  it: Line;
  lang: "ar" | "en";
  addonDefaults: Parameters<typeof resolveAllVariantAxes>[0]["addonDefaults"];
}) {
  const axes = resolveAllVariantAxes({
    product: (it.products || it.product) as Parameters<typeof resolveAllVariantAxes>[0]["product"],
    addonDefaults,
    lang,
  });
  const variant = it.selected_variant;
  const size = lineSizeText(it, lang);
  const word = (value: string) => translateOptionValue(value, lang) || value;
  const parts = variant
    ? [
        variant.color && axes.color.visible && `${axes.color.label}: ${word(variant.color)}`,
        size && axes.size.visible && `${axes.size.label}: ${size}`,
        variant.fabric && axes.fabric.visible && `${axes.fabric.label}: ${word(variant.fabric)}`,
      ].filter(Boolean)
    : [];
  const { rows: answers, notes } = lineFields(it.custom_field_values);
  const rows = withoutRepeatedOptions(
    answers,
    { color: variant?.color, size, fabric: variant?.fabric },
    axes,
    lang,
  );

  return (
    <>
      {parts.length > 0 && (
        <p className="mt-1 text-xs" style={{ opacity: 0.75 }}>
          {parts.join(" · ")}
        </p>
      )}
      {rows.length > 0 && (
        <ul className="mt-1 text-xs space-y-0.5" style={{ opacity: 0.75 }}>
          {rows.map((cf, ci) => (
            <li key={ci}>
              {customFieldLabel(cf, lang)}:{" "}
              {String(cf.value).startsWith("http") ? (
                <a
                  href={String(cf.value)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline font-semibold inline-flex items-center gap-1"
                >
                  <Paperclip className="h-3 w-3" aria-hidden="true" />
                  {lang === "ar" ? "تحميل/عرض الملف" : "View File"}
                </a>
              ) : (
                customFieldValue(cf, lang)
              )}
            </li>
          ))}
        </ul>
      )}
      <LineNotes notes={notes} lang={lang} />
    </>
  );
}
