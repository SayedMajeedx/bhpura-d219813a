/**
 * The Worker's environment (its secrets and bindings) for the request being answered.
 *
 * `src/server.ts` binds it to `globalThis.__CLOUDFLARE_ENV__` at the start of every request and
 * every scheduled run. Readers once asked `vinxi/http`'s `getEvent()` for it first: that package
 * is not installed, so the import always failed and they fell back to this (bug #52).
 * Undefined in the browser, in tests and in the dev server, where `process.env` is read instead.
 */
export function workerEnv(): Record<string, unknown> | undefined {
  const env = (globalThis as { __CLOUDFLARE_ENV__?: unknown }).__CLOUDFLARE_ENV__;
  return env && typeof env === "object" ? (env as Record<string, unknown>) : undefined;
}
