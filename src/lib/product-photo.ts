/**
 * A product's photo on the storefront, one reading for every surface: its main picture, else the
 * first picture of its gallery, else a size's own picture. A product with none is still sold and
 * listed, but the home page's rails and the product page's recommendations leave it out: a rail
 * is the store's shop window, and a grey box in it ("no image") sold nothing (Pura's "ربطة" sat in
 * three of them). The shopping feed leaves such a product out for the same reason.
 */
type PhotoSource = {
  image_url?: string | null;
  media?: unknown;
  /** A size's own picture, when it has one (the selects that carry it). */
  product_variants?: ReadonlyArray<unknown> | null;
};

const filled = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

export function productCover(product: PhotoSource | null | undefined): string | null {
  if (!product) return null;
  if (filled(product.image_url)) return product.image_url;
  const media = Array.isArray(product.media) ? product.media : [];
  const picture = media.find(
    (entry) => entry && filled(entry.url) && (entry.type === "image" || !entry.type),
  );
  if (picture) return picture.url as string;
  for (const variant of product.product_variants ?? []) {
    const picture = (variant as { image_url?: unknown } | null)?.image_url;
    if (filled(picture)) return picture;
  }
  return null;
}

export function hasProductPhoto(product: PhotoSource | null | undefined): boolean {
  return productCover(product) !== null;
}

/** Keeps two Arabic letters apart: joined, "بيورا لاين"'s initials read as the word "بل" ("but"). */
const THIN_SPACE = " ";

/** The letters a store's placeholder shows when it has no logo: "Pura Line" gives "PL". */
export function storeInitials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => Array.from(word)[0] ?? "");
  const joining = letters.some((letter) => /\p{Script=Arabic}/u.test(letter));
  return letters.join(joining ? THIN_SPACE : "").toUpperCase();
}
