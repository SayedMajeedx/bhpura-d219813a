import type { StoreVertical } from "@/lib/store-profile";
import { UNIVERSAL_SIZING_PRESETS } from "@/lib/variant-sku-utils";
import { listAddons, type SizingPreset } from "./addon-registry";

/**
 * Returns sizing presets tailored for the current store vertical.
 * Merges installed add-on presets, manifest-contributed presets for this vertical,
 * and universal presets (filtering apparel presets out of non-apparel verticals).
 */
export function getVerticalSizingPresets(
  vertical: StoreVertical | string,
  fromAddons: SizingPreset[],
  order: string[] = [],
): SizingPreset[] {
  const currentVertical = (vertical as StoreVertical) || "general";

  // Manifest presets contributed by add-ons associated with this vertical
  const manifestPresets = listAddons()
    .filter((m) => m.activities.includes(currentVertical))
    .flatMap((m) => m.contributions?.sizingPresets || []);

  const existingIds = new Set(fromAddons.map((p) => p.id));
  const verticalAdditions = manifestPresets.filter((p) => !existingIds.has(p.id));

  // Apparel verticals keep universal apparel presets.
  // Non-apparel verticals exclude fashion-specific presets so UI stays clean and focused.
  const isApparel = currentVertical === "abayas" || currentVertical === "fashion";
  const universalFiltered = isApparel
    ? UNIVERSAL_SIZING_PRESETS
    : UNIVERSAL_SIZING_PRESETS.filter(
        (p) => !["abayas_standard", "shoes_eu", "womens_alpha", "mens_alpha"].includes(p.id),
      );

  const combined = [...fromAddons, ...verticalAdditions, ...universalFiltered];
  if (order.length === 0) return combined;

  return combined.sort((a, b) => {
    const idxA = order.indexOf(a.id);
    const idxB = order.indexOf(b.id);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return 0;
  });
}

/**
 * Vertical-appropriate example prompt for the AI variant generator.
 */
export function getVerticalAiPromptPlaceholder(
  vertical: StoreVertical | string,
  isAr: boolean,
): string {
  switch (vertical) {
    case "food":
      return isAr
        ? "مثال: وجبة برجر دجاج، الأحجام عادي وكبير، السعر 2.5 د.ب والتخفيض 2.0 د.ب، المخزون 50 لكل حجم"
        : "Example: Chicken burger meal, sizes Regular and Large, price 2.5 BHD, sale 2.0 BHD, stock 50 per size";
    case "print":
      return isAr
        ? "مثال: ختم شخصي دائري، المقاسات 25mm و 30mm، حبر أزرق وأسود، السعر 4.5 د.ب، المخزون 10"
        : "Example: Round personal stamp, sizes 25mm and 30mm, ink Blue and Black, price 4.5 BHD, stock 10";
    case "gifts":
      return isAr
        ? "مثال: بوكس ورد فاخر، الأحجام صغير ووسط و VIP، السعر 15 د.ب، المخزون 5 لكل حجم"
        : "Example: Luxury gift box, sizes Small, Medium, VIP, price 15 BHD, stock 5 each";
    case "beauty":
      return isAr
        ? "مثال: عطر مسك، الأحجام 50ml و 100ml، السعر 20 د.ب، المخزون 15 لكل حجم"
        : "Example: Musk perfume, sizes 50ml and 100ml, price 20 BHD, stock 15 each";
    case "coffee":
      return isAr
        ? "مثال: محصول إثيوبيا شلشلي مجفف، الأوزان 250g و 1kg، خيارات الطحن (حبوب كاملة، فلتر V60، إسبريسو)، السعر 6.5 د.ب، المخزون 20 لكل وزن"
        : "Example: Ethiopia Chelchele natural coffee beans, sizes 250g and 1kg, grinds (Whole Beans, Filter V60, Espresso), price 6.5 BHD, stock 20 each";
    case "abayas":
      return isAr
        ? "مثال: كود AB10، الألوان أسود وكحلي، مقاسات 52 إلى 58، السعر 35 د.ب، المخزون 3 لكل مقاس"
        : "Example: code AB10, colors Black and Navy, sizes 52 to 58, price 35 BHD, stock 3 per size";
    default:
      return isAr
        ? "مثال: كود NP24، الألوان كحلي وعنابي وبيج، المقاسات من S إلى XL، السعر 25 د.ب والتخفيض 19 د.ب، المخزون 5 لكل خيار"
        : "Example: code DRS-01, colors Black, Olive and Burgundy, sizes S to XL, price 25 BHD, sale 19, stock 5 per variant";
  }
}

/**
 * Vertical-appropriate input placeholders for variant axes.
 */
export function getVerticalAxisPlaceholders(
  vertical: StoreVertical | string,
  isAr: boolean,
): { sizePlaceholder: string; colorPlaceholder: string } {
  let sizePlaceholder = isAr ? "S, M, L, XL" : "S, M, L, XL";
  let colorPlaceholder = isAr ? "كحلي, عنابي, بيج" : "Black, Navy, Olive";

  switch (vertical) {
    case "coffee":
      sizePlaceholder = isAr ? "250g, 500g, 1kg, بوكس أظرف" : "250g, 500g, 1kg, Drip Box";
      colorPlaceholder = isAr
        ? "حبوب كاملة, طحنة فلتر V60, طحنة إسبريسو"
        : "Whole Beans, Filter V60, Espresso";
      break;
    case "food":
      sizePlaceholder = isAr ? "صغير, وسط, كبير" : "Small, Medium, Large";
      colorPlaceholder = isAr
        ? "عادي, حار, صوص خاص (النوع أو النكهة)"
        : "Regular, Spicy, Special (Flavor/Option)";
      break;
    case "print":
      sizePlaceholder = isAr ? "A4, A3, 25mm, 30mm" : "A4, A3, 25mm, 30mm";
      colorPlaceholder = isAr ? "أزرق, أسود, أحمر (لون الحبر أو الخامة)" : "Blue, Black, Red";
      break;
    case "gifts":
      sizePlaceholder = isAr ? "صغير, متوسط, كبير, VIP" : "Small, Medium, Large, VIP";
      break;
    case "beauty":
      sizePlaceholder = isAr ? "30ml, 50ml, 100ml" : "30ml, 50ml, 100ml";
      colorPlaceholder = isAr ? "ذهبي, شفاف, ميني" : "Gold, Clear, Mini";
      break;
    case "abayas":
      sizePlaceholder = isAr ? "52, 54, 56, 58, 60" : "52, 54, 56, 58, 60";
      break;
  }

  return { sizePlaceholder, colorPlaceholder };
}
