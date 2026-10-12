/**
 * What a hand-made fake client answers a list read with: the rows, whatever filters, order and
 * range the reader goes on to ask for. A reader that reads its list to the end (`readAll`) adds
 * an order and a range to the query; a fake that answers with a bare promise has no such methods.
 */
export function listReply<T>(data: T[] | null, error: unknown = null) {
  const reply = { data, error };
  const chain: Record<string, unknown> = {
    then: (resolve: (value: typeof reply) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(reply).then(resolve, reject),
  };
  for (const method of ["eq", "in", "not", "gt", "gte", "lt", "lte", "order", "range"]) {
    chain[method] = () => chain;
  }
  return chain;
}
