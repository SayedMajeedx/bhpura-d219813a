/**
 * The TikTok and Snapchat pixels' loaders, as each platform's official snippet sets them up: a
 * queue the page can call at once (`ttq`, `snaptr`), replayed by the platform's script once it has
 * loaded. Loaded only while the shopper allowed marketing (`StorefrontAnalytics`), and only once a
 * page. Browser only.
 */

type Queue = unknown[] & Record<string, unknown>;
type W = Window & { ttq?: Queue; TiktokAnalyticsObject?: string; snaptr?: unknown };

const TIKTOK_METHODS = [
  "page",
  "track",
  "identify",
  "instances",
  "debug",
  "on",
  "off",
  "once",
  "ready",
  "alias",
  "group",
  "enableCookie",
  "disableCookie",
  "holdConsent",
  "revokeConsent",
  "grantConsent",
];

function addScript(id: string, src: string) {
  if (document.getElementById(id)) return;
  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

/** TikTok's pixel for the store's pixel code (its official stub, written out). */
export function loadTiktokPixel(pixelId: string) {
  const w = window as W;
  if (!w.ttq) {
    const ttq = [] as unknown as Queue;
    const defer = (target: Queue, method: string) => {
      target[method] = (...args: unknown[]) => {
        target.push([method, ...args]);
      };
    };
    for (const method of TIKTOK_METHODS) defer(ttq, method);
    ttq.methods = TIKTOK_METHODS;
    ttq.setAndDefer = defer;
    ttq.instance = (id: string) => {
      const instances = (ttq._i as Record<string, Queue> | undefined) ?? {};
      const instance = instances[id] ?? ([] as unknown as Queue);
      for (const method of TIKTOK_METHODS) defer(instance, method);
      return instance;
    };
    ttq.load = (id: string, options?: Record<string, unknown>) => {
      const src = "https://analytics.tiktok.com/i18n/pixel/events.js";
      const instances = ((ttq._i as Record<string, Queue> | undefined) ??= {});
      const loaded = [] as unknown as Queue;
      loaded._u = src;
      instances[id] = loaded;
      ttq._i = instances;
      ttq._t = { ...((ttq._t as object | undefined) ?? {}), [id]: Date.now() };
      ttq._o = { ...((ttq._o as object | undefined) ?? {}), [id]: options ?? {} };
      addScript("boutq-tiktok-pixel", `${src}?sdkid=${encodeURIComponent(id)}&lib=ttq`);
    };
    w.TiktokAnalyticsObject = "ttq";
    w.ttq = ttq;
  }
  const ttq = w.ttq as Queue & { load: (id: string) => void };
  const loadedIds = (ttq._i as Record<string, unknown> | undefined) ?? {};
  if (!loadedIds[pixelId]) ttq.load(pixelId);
}

/** Snapchat's pixel for the store's pixel id (its official stub, written out). */
export function loadSnapPixel(pixelId: string) {
  const w = window as W;
  if (!w.snaptr) {
    const snaptr = ((...args: unknown[]) => {
      const self = snaptr as unknown as {
        handleRequest?: (...a: unknown[]) => void;
        queue: unknown[];
      };
      if (self.handleRequest) self.handleRequest(...args);
      else self.queue.push(args);
    }) as unknown as { queue: unknown[] };
    snaptr.queue = [];
    w.snaptr = snaptr;
    addScript("boutq-snap-pixel", "https://sc-static.net/scevent.min.js");
  }
  const inited = ((w as unknown as { boutqSnapInit?: string[] }).boutqSnapInit ??= []);
  if (!inited.includes(pixelId)) {
    inited.push(pixelId);
    (w.snaptr as (...args: unknown[]) => void)("init", pixelId, {});
  }
}
