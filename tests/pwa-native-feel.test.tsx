import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { appBadgeFor } from "../src/lib/app-badge";
import { readShortcut, shortcutTarget, SHORTCUTS } from "../src/lib/app-shortcuts";
import { captureInstallPrompt, installState } from "../src/lib/install-prompt";
import adminManifestText from "../public/admin-app/manifest.webmanifest?raw";
import offlinePage from "../public/admin-app/offline.html?raw";
import { runAdminWorker } from "./helpers/admin-worker";

// The PWA review of 2026-11-05, second part: the installed admin opens with no connection on a
// page of its own, marks its icon for new orders, has shortcuts on its icon, offers to be
// installed from inside, and opens in the window it has.

vi.mock("../src/lib/i18n", () => ({ useI18n: () => ({ lang: "en" }) }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ lang: "en" }) }));

const manifest = JSON.parse(adminManifestText) as {
  shortcuts: Array<{ name: string; url: string }>;
  launch_handler: { client_mode: string[] };
};

describe("opening with no connection", () => {
  const navigate = (path: string) => ({
    request: { mode: "navigate", method: "GET", url: `https://boutq.store${path}` },
    preloadResponse: Promise.resolve(undefined),
  });

  it("keeps the offline page on install, and answers with it when the network fails", async () => {
    let online = true;
    const worker = runAdminWorker({
      fetch: async () => {
        if (!online) throw new TypeError("Failed to fetch");
        return new Response("<html>offline</html>", { headers: { "content-type": "text/html" } });
      },
    });
    await worker.fire("install", {});
    expect(worker.stored.has("/admin-app/offline.html")).toBe(true);
    await worker.fire("activate", {});
    expect(worker.caches.delete).toHaveBeenCalledWith("boutq-admin-offline-v0");
    online = false;
    const answer = (await worker.fire("fetch", navigate("/admin/b/pura/orders"))) as Response;
    expect(await answer.text()).toBe("<html>offline</html>");
  });

  it("goes to the network as always while online, and leaves every other request alone", async () => {
    const worker = runAdminWorker();
    expect(await worker.fire("fetch", navigate("/admin"))).toEqual({ online: true });
    // A file, an API call or a store's page never passes through the worker.
    expect(
      await worker.fire("fetch", {
        request: { mode: "cors", method: "GET", url: "https://boutq.store/assets/a.js" },
      }),
    ).toBeUndefined();
    expect(await worker.fire("fetch", navigate("/pura"))).toBeUndefined();
  });

  it("is a page of its own, in both languages, that needs nothing from the network", () => {
    expect(offlinePage).toContain("You're offline");
    expect(offlinePage).toContain("لا يوجد اتصال بالإنترنت");
    expect(offlinePage).not.toMatch(/src="\/|href="\//);
    expect(offlinePage).toContain('addEventListener("online"');
  });
});

describe("the app's icon", () => {
  it("is marked by the worker for a new order, a booking or a gift card sold, not for others", async () => {
    const worker = runAdminWorker();
    await worker.fire("push", {
      data: { json: () => ({ title: "New order", tag: "order_new-42" }) },
    });
    expect(worker.setAppBadge).toHaveBeenCalledTimes(1);
    await worker.fire("push", {
      data: { json: () => ({ title: "Low stock", tag: "low_stock-7" }) },
    });
    expect(worker.setAppBadge).toHaveBeenCalledTimes(1);
  });

  it("counts what arrived while the app was open, and clears on the orders page", () => {
    expect(appBadgeFor(3, false)).toBe(3);
    expect(appBadgeFor(3, true)).toBe("clear");
    // Nothing new while open: the worker's mark stays until the orders are seen.
    expect(appBadgeFor(0, false)).toBeNull();
  });
});

describe("the icon's shortcuts", () => {
  it("each go to a known page of the person's own store", () => {
    expect(manifest.shortcuts).toHaveLength(SHORTCUTS.length);
    for (const shortcut of manifest.shortcuts) {
      const go = new URL(shortcut.url, "https://boutq.store").searchParams.get("go");
      expect(readShortcut(go)).toBeDefined();
    }
    expect(shortcutTarget("pura", "new-order", false)).toEqual({
      to: "/admin/b/$slug/orders/$id",
      params: { slug: "pura", id: "new" },
    });
    expect(shortcutTarget("pura", "products", false).to).toBe("/admin/b/$slug/inventory");
    expect(shortcutTarget("pura", undefined, false).to).toBe("/admin/b/$slug/dashboard");
    expect(readShortcut("settings")).toBeUndefined();
  });

  it("take a courier to their deliveries only", () => {
    expect(shortcutTarget("pura", "products", true).to).toBe("/admin/b/$slug/orders");
  });
});

describe("one window", () => {
  it("opens in the app's window when it is already open", () => {
    expect(manifest.launch_handler.client_mode[0]).toBe("navigate-existing");
  });
});

describe("installing the app from inside it", () => {
  it("offers what this device can do", () => {
    const base = { standalone: false, installedNow: false, canPrompt: false, ios: false };
    expect(installState({ ...base, standalone: true })).toBe("installed");
    expect(installState({ ...base, canPrompt: true })).toBe("prompt");
    expect(installState({ ...base, ios: true })).toBe("ios");
    expect(installState(base)).toBe("browser-menu");
  });

  it("asks the browser's own question with one tap, and then says it is installed", async () => {
    const { InstallAppCard } = await import("../src/features/settings/tabs/account/InstallAppCard");
    captureInstallPrompt();
    render(<InstallAppCard />);
    expect(screen.queryByRole("button", { name: "Install Boutq" })).toBeNull();

    const prompt = vi.fn(async () => undefined);
    const offer = Object.assign(new Event("beforeinstallprompt"), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    act(() => {
      window.dispatchEvent(offer);
    });
    fireEvent.click(await screen.findByRole("button", { name: "Install Boutq" }));
    expect(prompt).toHaveBeenCalled();
    expect(await screen.findByText(/Boutq is installed on this device/)).toBeInTheDocument();
  });
});
