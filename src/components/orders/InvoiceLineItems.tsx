import { resolveAllVariantAxes } from "@/lib/addons/addon-registry";
import { isDefaultSize } from "@/lib/default-variant";
import { customFieldLabel, customFieldValue } from "@/lib/order-custom-fields";
import { orderLineName, serviceLengthLabel } from "@/lib/order-line-name";

/**
 * The customer invoice's lines. From `sm` (and on paper) a table; on a phone each line is a card
 * with its total beside its name: the table was 440px wide in a 327px box, so the line's total sat
 * off the side of the screen with nothing to say it was there.
 */

type Labels = { desc: string; qty: string; unit: string; total: string };

type Props = {
  items: any[];
  lang: "ar" | "en";
  addonDefaults: Parameters<typeof resolveAllVariantAxes>[0]["addonDefaults"];
  money: (n: number) => string;
  labels: Labels;
  textColor: string;
  dividerColor: string;
  headerBg: string;
  headerFg: string;
};

/** Unit price with any extras, and the struck price before a discount. */
function unitPrices(it: any) {
  const extras = Number(it.customization_total ?? 0);
  const unit = Number(it.unit_price ?? 0) + extras;
  const was =
    Number(it.original_price ?? 0) > Number(it.unit_price)
      ? Number(it.original_price) + extras
      : null;
  return { unit, was };
}

/** A line's name, its options in the store's words, extras and the customer's answers. */
function ItemDetails({
  it,
  lang,
  addonDefaults,
  money,
  textColor,
}: Pick<Props, "lang" | "addonDefaults" | "money" | "textColor"> & { it: any }) {
  // The name in the invoice's language (a product's own, or the line's: a booking's add-on).
  const lines = String(orderLineName(it, lang) || "—")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const axes = resolveAllVariantAxes({ product: it.products, addonDefaults, lang });
  const parts = (lines[0] || "—")
    .split(/\s+[-–—]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const title = parts.length > 1 ? parts[0] : lines[0] || "—";
  const inline =
    parts.length > 1
      ? parts
          .slice(1)
          .map((p) => (/^\d+$/.test(p) ? `${axes.size.label} ${p}` : p))
          .join(" · ")
      : null;
  // Each option from the variant chosen at checkout, else the catalogue's variant.
  const pick = (key: "color" | "size" | "fabric") =>
    it.selected_variant?.[key] || it.product_variants?.[key];
  const color = pick("color");
  // A booked service's length in the invoice's language ("3 ساعات"), not its variant's text.
  const size = serviceLengthLabel(it.product_variants, lang) || pick("size");
  const fabric = pick("fabric");
  const options = [
    color && axes.color.visible ? [axes.color.label, color] : null,
    size && !isDefaultSize(size) && axes.size.visible ? [axes.size.label, size] : null,
    fabric && axes.fabric.visible ? [axes.fabric.label, fabric] : null,
  ].filter(Boolean) as Array<[string, string]>;
  const muted = { color: textColor, opacity: 0.75 };

  return (
    <div className="min-w-0 space-y-0.5">
      <p
        className="font-semibold break-words text-page-start"
        dir="auto"
        style={{ color: textColor }}
      >
        {title}
      </p>
      {inline && (
        <p className="text-xs" style={muted}>
          {inline}
        </p>
      )}
      {lines.slice(1).map((l, i) => (
        <p key={i} className="text-xs" style={muted}>
          {l}
        </p>
      ))}
      {options.map(([label, value]) => (
        <p key={label} className="text-xs" style={muted}>
          {label}: <span className="font-medium">{value}</span>
        </p>
      ))}
      {(it.customizations ?? []).map((c: any, i: number) => (
        <p key={`c${i}`} className="text-xs" style={muted}>
          + {c.name} ({money(c.price_delta)})
        </p>
      ))}
      {(it.custom_field_values ?? []).map((field: any, i: number) => (
        <p key={`f${i}`} className="text-xs" style={muted}>
          {customFieldLabel(field, lang)}: {customFieldValue(field, lang)}
        </p>
      ))}
    </div>
  );
}

export function InvoiceLineItems(props: Props) {
  const { items, labels, money, textColor, dividerColor, headerBg, headerFg } = props;
  return (
    <>
      <table className="pdf-line-items hidden w-full text-sm mb-6 sm:table print:table">
        <thead>
          <tr
            style={{
              backgroundColor: headerBg,
              color: headerFg,
              borderBottom: `1px solid ${dividerColor}`,
            }}
          >
            <th className="text-start p-3" style={{ color: headerFg }}>
              {labels.desc}
            </th>
            <th className="text-end p-3 w-16" style={{ color: headerFg }}>
              {labels.qty}
            </th>
            <th className="text-end p-3 w-28" style={{ color: headerFg }}>
              {labels.unit}
            </th>
            <th className="text-end p-3 w-28" style={{ color: headerFg }}>
              {labels.total}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            const { unit, was } = unitPrices(it);
            return (
              <tr
                key={i}
                className="border-b align-top break-inside-avoid"
                style={{ borderBottomColor: dividerColor }}
              >
                <td className="p-3">
                  <ItemDetails it={it} {...props} />
                </td>
                <td className="p-3 text-end" style={{ color: textColor }}>
                  {it.quantity}
                </td>
                <td className="p-3 text-end whitespace-nowrap" style={{ color: textColor }}>
                  {was !== null && (
                    <span className="block text-xs line-through" style={{ opacity: 0.6 }}>
                      {money(was)}
                    </span>
                  )}
                  {money(unit)}
                </td>
                <td
                  className="p-3 text-end whitespace-nowrap font-semibold"
                  style={{ color: textColor }}
                >
                  {money(it.line_total)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* A phone: one card per line, its total beside its name. */}
      <ul
        className="mb-6 sm:hidden print:hidden"
        aria-label={labels.desc}
        style={{ borderTop: `1px solid ${dividerColor}` }}
      >
        {items.map((it, i) => {
          const { unit, was } = unitPrices(it);
          return (
            <li
              key={i}
              className="flex items-start justify-between gap-3 py-3"
              style={{ borderBottom: `1px solid ${dividerColor}` }}
            >
              <div className="min-w-0 flex-1">
                <ItemDetails it={it} {...props} />
                <p className="mt-1 text-xs" style={{ color: textColor, opacity: 0.75 }}>
                  {it.quantity} × {money(unit)}
                  {was !== null && (
                    <span className="ms-1.5 line-through" style={{ opacity: 0.7 }}>
                      {money(was)}
                    </span>
                  )}
                </p>
              </div>
              <p className="shrink-0 font-semibold whitespace-nowrap" style={{ color: textColor }}>
                {money(it.line_total)}
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}
