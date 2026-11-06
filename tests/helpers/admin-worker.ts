import { vi } from "vitest";
import workerSource from "../../public/admin-sw.js?raw";

/**
 * The installed admin's worker (`public/admin-sw.js`), run with a stand-in for the browser's
 * `self`, `caches` and `fetch`, so its events can be fired and what it does read back.
 */
export function runAdminWorker(options: { fetch?: (request: unknown) => Promise<unknown> } = {}) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const shown: Array<{ title: string; options: Record<string, unknown> }> = [];
  const posted: unknown[] = [];
  const subscribe = vi.fn(async () => ({}));
  const setAppBadge = vi.fn(async () => undefined);
  const stored = new Map<string, unknown>();
  const caches = {
    open: async () => ({
      put: async (url: string, response: unknown) => {
        stored.set(new URL(url, "https://boutq.store").pathname, response);
      },
    }),
    keys: async () => ["boutq-admin-offline-v0", "boutq-admin-offline-v1"],
    delete: vi.fn(async () => true),
    match: async (url: string) => stored.get(url),
  };
  const self = {
    addEventListener: (type: string, fn: (event: unknown) => void) => (handlers[type] = fn),
    skipWaiting: vi.fn(async () => undefined),
    location: { origin: "https://boutq.store" },
    navigator: { setAppBadge },
    registration: {
      showNotification: async (title: string, opts: Record<string, unknown>) => {
        shown.push({ title, options: opts });
      },
      pushManager: { subscribe },
      navigationPreload: { enable: vi.fn(async () => undefined) },
    },
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: async () => [{ postMessage: (m: unknown) => posted.push(m) }],
      openWindow: vi.fn(),
    },
  };
  const fetchImpl = options.fetch ?? (async () => ({ online: true }));
  const RequestStub = class {
    url: string;
    constructor(url: string) {
      this.url = url;
    }
  };
  new Function("self", "caches", "fetch", "Request", "Response", workerSource)(
    self,
    caches,
    fetchImpl,
    RequestStub,
    Response,
  );

  /** Fires an event; resolves with what the worker answered (`respondWith`), if anything. */
  const fire = async (type: string, event: Record<string, unknown>) => {
    let work: Promise<unknown> = Promise.resolve();
    let answer: Promise<unknown> | undefined;
    handlers[type]({
      ...event,
      waitUntil: (p: Promise<unknown>) => (work = p),
      respondWith: (p: Promise<unknown>) => (answer = p),
    });
    await work;
    return answer ? await answer : undefined;
  };
  return { fire, shown, posted, subscribe, setAppBadge, caches, stored };
}
