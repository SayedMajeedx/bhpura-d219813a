import { vi } from "vitest";

/**
 * Stand-ins for TanStack Start server functions and the Supabase client, so a
 * test can check a server function's middleware and run its handler.
 *
 *   vi.mock("@tanstack/react-start", async () =>
 *     (await import("./helpers/server-fn")).serverFnModule());
 *   const fns = await vi.importActual("../src/lib/x.functions");
 *   await fns.doThing({ data, context: { supabase, userId } });
 */

export type ServerFn = ((args: { data?: unknown; context: unknown }) => Promise<unknown>) & {
  middleware: unknown[];
};

/** A `createServerFn` that keeps its middleware and runs validator + handler when called. */
export function serverFnModule() {
  return {
    // Middleware keeps its server function so a test can run it.
    createMiddleware: () => ({ server: (run: unknown) => ({ run }) }),
    createServerFn: () => {
      const fn: { middleware: unknown[]; validate: (raw: unknown) => unknown } = {
        middleware: [],
        validate: (raw) => raw,
      };
      const builder = {
        middleware: (middleware: unknown[]) => ((fn.middleware = middleware), builder),
        validator: (validate: (raw: unknown) => unknown) => ((fn.validate = validate), builder),
        handler: (run: (args: { data: unknown; context: unknown }) => unknown) =>
          Object.assign(
            async (args: { data?: unknown; context: unknown }) =>
              run({ data: fn.validate(args.data), context: args.context }),
            fn,
          ),
      };
      return builder;
    },
  };
}

type Write = { table: string; values: unknown; filters: Array<[string, unknown]> };
type Rows = unknown | ((filters: Array<[string, unknown]>) => unknown);

/**
 * A Supabase client whose reads return `rows[table]` (or `rows[table](filters)`)
 * and whose RPCs return `rpc[name]`. Every query is recorded in `queries` and
 * every update, insert, upsert and delete in `writes`, with their filters.
 */
export function fakeSupabase(config: {
  rows?: Record<string, Rows>;
  rpc?: Record<string, unknown>;
}) {
  const writes: Write[] = [];
  const queries: Write[] = [];
  const from = (table: string) => {
    const write: Write = { table, values: undefined, filters: [] };
    queries.push(write);
    const result = () => {
      const rows = config.rows?.[table];
      return {
        data: (typeof rows === "function" ? rows(write.filters) : rows) ?? null,
        error: null,
      };
    };
    const filter = (column: string, value: unknown) => (write.filters.push([column, value]), chain);
    const record = (values: unknown) => ((write.values = values), writes.push(write), chain);
    const chain = {
      select: () => chain,
      eq: filter,
      neq: () => chain,
      in: filter,
      lte: () => chain,
      gte: () => chain,
      lt: () => chain,
      gt: () => chain,
      or: () => chain,
      is: () => chain,
      not: () => chain,
      order: () => chain,
      limit: () => chain,
      update: record,
      insert: record,
      upsert: (values: unknown, options?: unknown) =>
        record(options ? { values, options } : values),
      delete: () => record("DELETE"),
      maybeSingle: async () => result(),
      single: async () => result(),
      // Awaiting a read returns its rows; awaiting a write returns nothing.
      then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
        resolve(write.values === undefined ? result() : { data: null, error: null }),
    };
    return chain;
  };
  const rpc = vi.fn(async (name: string) => ({ data: config.rpc?.[name] ?? null, error: null }));
  return { supabase: { from, rpc }, writes, queries };
}
