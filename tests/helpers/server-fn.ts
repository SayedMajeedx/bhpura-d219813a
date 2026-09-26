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

/**
 * A Supabase client whose reads return `rows[table]` and whose RPCs return
 * `rpc[name]`. Updates and inserts are recorded in `writes`.
 */
export function fakeSupabase(config: {
  rows?: Record<string, unknown>;
  rpc?: Record<string, unknown>;
}) {
  const writes: Write[] = [];
  const from = (table: string) => {
    const write: Write = { table, values: undefined, filters: [] };
    const result = () => ({ data: config.rows?.[table] ?? null, error: null });
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => (write.filters.push([column, value]), chain),
      neq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      update: (values: unknown) => ((write.values = values), writes.push(write), chain),
      insert: (values: unknown) => ((write.values = values), writes.push(write), chain),
      maybeSingle: async () => result(),
      single: async () => result(),
      then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
        resolve({ data: null, error: null }),
    };
    return chain;
  };
  const rpc = vi.fn(async (name: string) => ({ data: config.rpc?.[name] ?? null, error: null }));
  return { supabase: { from, rpc }, writes };
}
