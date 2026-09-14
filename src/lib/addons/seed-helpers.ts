/**
 * Add-on Seed Helpers
 *
 * Provides shared utilities for idempotent, schema-safe seed execution:
 * 1. resolveBrandOwnerUserId: safely resolves user ID for auth.users foreign key.
 * 2. withThrowOnError: wraps Supabase client/query-builder so errors are never swallowed.
 */

export async function resolveBrandOwnerUserId(db: any, brandId: string): Promise<string | null> {
  if (!db || !brandId) return null;

  try {
    // 1. Primary: brands.created_by
    const { data: brand, error: brandErr } = await db
      .from("brands")
      .select("created_by")
      .eq("id", brandId)
      .maybeSingle();

    if (!brandErr && brand?.created_by) {
      return brand.created_by;
    }

    // 2. Fallback: business_settings.user_id
    const { data: bs, error: bsErr } = await db
      .from("business_settings")
      .select("user_id")
      .eq("brand_id", brandId)
      .maybeSingle();

    if (!bsErr && bs?.user_id) {
      return bs.user_id;
    }
  } catch (err) {
    console.warn(`[resolveBrandOwnerUserId] Failed to resolve owner for brand ${brandId}:`, err);
  }

  // Never return zero UUID; return null so the seed can gracefully skip user-owned rows
  return null;
}

/**
 * Wraps a Supabase client or query builder so that any query execution with an `error`
 * automatically throws an Error, eliminating silent failures in seed scripts.
 */
export function withThrowOnError<T = any>(clientOrBuilder: T): T {
  if (!clientOrBuilder || typeof clientOrBuilder !== "object") {
    return clientOrBuilder;
  }

  return new Proxy(clientOrBuilder as any, {
    get(target, prop, receiver) {
      if (prop === "then") {
        return function (resolve?: (val: any) => any, reject?: (reason: any) => any) {
          return target.then((res: any) => {
            if (res && res.error) {
              const err =
                res.error instanceof Error
                  ? res.error
                  : new Error(res.error.message || String(res.error));
              if (reject) {
                return reject(err);
              }
              throw err;
            }
            return resolve ? resolve(res) : res;
          }, reject);
        };
      }

      const orig = Reflect.get(target, prop, receiver);
      if (typeof orig === "function") {
        return function (...args: any[]) {
          const res = orig.apply(target, args);
          if (res && typeof res === "object") {
            return withThrowOnError(res);
          }
          return res;
        };
      }
      return orig;
    },
  });
}
