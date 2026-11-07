import { afterEach, describe, expect, it, vi } from "vitest";
import { alertSyncStep, type AlertDevice } from "../src/lib/alert-device";
import {
  isStaleBuildError,
  reloadForNewBuild,
  shouldReloadForNewBuild,
} from "../src/lib/stale-chunk";
import { runAdminWorker as runWorker } from "./helpers/admin-worker";
// @ts-expect-error a plain script, with no types of its own
import { unguardedImports } from "../scripts/check-client-bundle.mjs";

// The PWA review of 2026-11-05: alerts stopped with nothing said when a browser renewed its push
// subscription; an installed admin left open across a release showed "Something went wrong" on
// its next page; and Android drew the alerts' badge as a white square.

const device: AlertDevice = {
  brandId: "b1",
  endpoint: "https://fcm.googleapis.com/a",
  userId: "u1",
};
const base = {
  permission: "granted" as NotificationPermission,
  endpoint: device.endpoint,
  remembered: device,
  known: true,
  userId: "u1",
};

describe("keeping a device's alerts alive", () => {
  it("does nothing while all is as the store knows it", () => {
    expect(alertSyncStep(base)).toEqual({ kind: "none" });
  });

  it("gives the store a renewed subscription, for the store chosen, in place of the old", () => {
    expect(alertSyncStep({ ...base, endpoint: "https://fcm.googleapis.com/b" })).toEqual({
      kind: "register",
      brandId: "b1",
      oldEndpoint: device.endpoint,
    });
    // The platform forgot it (a push was refused): given again.
    expect(alertSyncStep({ ...base, known: false })).toEqual({
      kind: "register",
      brandId: "b1",
      oldEndpoint: null,
    });
  });

  it("subscribes again when the browser dropped the subscription", () => {
    expect(alertSyncStep({ ...base, endpoint: null })).toEqual({
      kind: "resubscribe",
      brandId: "b1",
      oldEndpoint: device.endpoint,
    });
  });

  it("never takes over another person's device, nor acts without permission or a note", () => {
    expect(alertSyncStep({ ...base, userId: "u2", known: false })).toEqual({ kind: "none" });
    expect(alertSyncStep({ ...base, permission: "denied", endpoint: null })).toEqual({
      kind: "none",
    });
    expect(alertSyncStep({ ...base, remembered: null, known: false })).toEqual({ kind: "none" });
  });
});

describe("a page left open across a release", () => {
  afterEach(() => vi.restoreAllMocks());

  it("knows the error of a file of its build that is gone", () => {
    expect(
      isStaleBuildError(new TypeError("Failed to fetch dynamically imported module: /a.js")),
    ).toBe(true);
    expect(isStaleBuildError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isStaleBuildError({ name: "ChunkLoadError", message: "x" })).toBe(true);
    expect(isStaleBuildError(new Error("NOT_AUTHORIZED"))).toBe(false);
    expect(isStaleBuildError(null)).toBe(false);
  });

  it("reloads once onto the new build, never in a loop", () => {
    expect(shouldReloadForNewBuild(100_000, null)).toBe(true);
    expect(shouldReloadForNewBuild(100_000, 90_000)).toBe(false);
    expect(shouldReloadForNewBuild(200_000, 90_000)).toBe(true);
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      reload,
    } as Location);
    window.sessionStorage.removeItem("boutq:stale-build-reload");
    expect(reloadForNewBuild(1_000_000)).toBe(true);
    expect(reloadForNewBuild(1_000_500)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("a dynamic import that failed", () => {
  const preloadError = (payload: unknown) => {
    const event = new Event("vite:preloadError", { cancelable: true });
    (event as Event & { payload?: unknown }).payload = payload;
    window.dispatchEvent(event);
    return event;
  };

  it("reloads only when a file of the build is missing", async () => {
    // A fresh copy: the module remembers a reload it has already begun.
    vi.resetModules();
    const { installStaleBuildReload } = await import("../src/lib/stale-chunk");
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      reload,
    } as Location);
    window.sessionStorage.removeItem("boutq:stale-build-reload");
    const stop = installStaleBuildReload();

    // A server-only module asked for in the browser: nothing to do with a release. Reloading on it
    // took the first click on a product and opened every admin page twice.
    const unrelated = preloadError(
      new TypeError("Failed to resolve module specifier 'vinxi/http'"),
    );
    expect(unrelated.defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("boutq:stale-build-reload")).toBeNull();

    // The file of an old build, gone with a release.
    const stale = preloadError(new TypeError("Failed to fetch dynamically imported module: x.js"));
    expect(stale.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe("the check on the client bundle", () => {
  it("passes a server-only import behind a server check, and fails a bare one", () => {
    expect(
      unguardedImports("new TextEncoder,typeof window>`u`&&r(()=>import(`vinxi/http`),[])"),
    ).toEqual([]);
    expect(unguardedImports("var i=`vinxi/http`;r(()=>import(i),[]).catch(()=>{});")).toHaveLength(
      1,
    );
    expect(unguardedImports("const unrelated = 1;")).toEqual([]);
  });
});

describe("the admin's worker", () => {
  it("shows an alert with a one-colour badge Android can draw", async () => {
    const worker = runWorker();
    await worker.fire("push", {
      data: {
        json: () => ({ title: "New order", body: "PL-01042", url: "/admin/b/pura/orders/1" }),
      },
    });
    expect(worker.shown[0].title).toBe("New order");
    expect(worker.shown[0].options.badge).toBe("/admin-app/badge-96.png");
  });

  it("takes a new subscription when the browser renews one, and tells the open admin", async () => {
    const worker = runWorker();
    const key = new Uint8Array([1, 2, 3]);
    await worker.fire("pushsubscriptionchange", {
      oldSubscription: { options: { applicationServerKey: key } },
    });
    expect(worker.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
    expect(worker.posted).toEqual([{ type: "boutq:push-subscription-changed" }]);

    // The browser already made the new one: only the admin is told.
    const again = runWorker();
    await again.fire("pushsubscriptionchange", { newSubscription: {} });
    expect(again.subscribe).not.toHaveBeenCalled();
    expect(again.posted).toHaveLength(1);
  });
});
