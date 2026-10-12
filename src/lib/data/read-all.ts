/**
 * Reads a whole list, however long it is.
 *
 * The API answers a list with at most its row limit (1,000 rows unless the project says
 * otherwise) and does not say that it stopped: a store's 1,001st variant, customer or order was
 * simply not there, so a total was short, a cost read as zero, an export lost its tail. A reader
 * whose caller treats the result as the complete list goes through here.
 *
 * The page function asks for one range of the list, in a fixed order that ends on a unique
 * column (so a row cannot sit on two pages), and asks for the exact count:
 *
 *   readAll((from, to) =>
 *     supabase.from("customers").select("*", { count: "exact" })
 *       .eq("brand_id", brandId).order("created_at").order("id").range(from, to));
 *
 * A list that fits in one answer costs one request, as before. A longer one is read to its end:
 * the count says how much is left, and the rest is asked for at once. Without a count (an old
 * caller, a test double) a page shorter than what was asked for is taken as the end.
 */

/** Rows asked for per request. The server may answer with fewer (its own limit). */
export const LIST_PAGE = 1000;

/** Past this many requests the list is not a list a screen should hold: say so, never cut it. */
const MAX_PAGES = 200;

type PageReply<T> = { data: T[] | null; error: unknown; count?: number | null };
type ReadPage<T> = (from: number, to: number) => PromiseLike<PageReply<T>>;

export class ListTooLongError extends Error {
  constructor(public readonly rows: number) {
    super(`LIST_TOO_LONG: ${rows} rows`);
    this.name = "ListTooLongError";
  }
}

/** PostgREST's "requested range not satisfiable": the range starts after the last row. */
const isPastTheEnd = (error: unknown) => (error as { code?: string } | null)?.code === "PGRST103";

export async function readAll<T>(page: ReadPage<T>, pageSize: number = LIST_PAGE): Promise<T[]> {
  const first = await page(0, pageSize - 1);
  if (first.error) throw first.error;
  const rows = [...(first.data ?? [])];
  const total = typeof first.count === "number" ? first.count : null;

  if (total === null) {
    // No count: a full page may have more behind it, a short one is the end.
    let last = rows.length;
    for (let pages = 1; last >= pageSize; pages += 1) {
      if (pages >= MAX_PAGES) throw new ListTooLongError(rows.length);
      const next = await page(rows.length, rows.length + pageSize - 1);
      if (next.error) throw next.error;
      last = (next.data ?? []).length;
      rows.push(...(next.data ?? []));
    }
    return rows;
  }

  if (rows.length >= total || rows.length === 0) return rows;

  // The server answered with fewer rows than exist: its own limit is the size of a page.
  const size = rows.length;
  const pages = Math.ceil(total / size);
  if (pages > MAX_PAGES) throw new ListTooLongError(total);
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) => {
      const from = (index + 1) * size;
      return page(from, from + size - 1);
    }),
  );
  for (const reply of rest) {
    // Rows removed while the list was being read can leave a later page past the new end: the
    // API calls that an unsatisfiable range, and it only means there is nothing more there.
    if (reply.error && !isPastTheEnd(reply.error)) throw reply.error;
    rows.push(...(reply.data ?? []));
  }
  return rows;
}
