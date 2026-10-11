/**
 * Whether a stored product picture is still used by anything in the store.
 *
 * A picture file can be referenced from more than one place: a product's main picture, its
 * gallery (a picture or a video's poster), and a variant's own picture. A duplicated product
 * shares its original's files, and a product's first variant was once given the product's first
 * picture. Deleting a file while any of these still points at it leaves a broken image on the
 * storefront, so every delete of a product picture asks this first.
 *
 * A lookup that fails counts as "in use": keeping a file nobody needs costs a little storage,
 * deleting one somebody needs breaks a page.
 */

type Result = { data: unknown; error: unknown };
type Query = PromiseLike<Result> & {
  select: (columns: string) => Query;
  eq: (column: string, value: unknown) => Query;
  contains: (column: string, value: unknown) => Query;
  limit: (count: number) => Query;
};
export type PictureUseClient = { from: (table: string) => unknown };

export async function productPictureInUse(
  client: PictureUseClient,
  brandId: string,
  url: string,
): Promise<boolean> {
  try {
    const rows = (table: string) =>
      (client.from(table) as Query).select("id").eq("brand_id", brandId);
    const results = await Promise.all([
      rows("product_variants").eq("image_url", url).limit(1),
      rows("products").eq("image_url", url).limit(1),
      rows("products").contains("media", [{ url }]).limit(1),
      rows("products")
        .contains("media", [{ poster_url: url }])
        .limit(1),
    ]);
    return results.some(
      (result) => Boolean(result.error) || (Array.isArray(result.data) && result.data.length > 0),
    );
  } catch {
    return true;
  }
}

/** A product picture's storage key: `brands/<brand>/product/<file>`. */
export function isProductPictureKey(key: string): boolean {
  return /^brands\/[^/]+\/product\//.test(key);
}
