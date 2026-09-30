import React from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isEmbeddedWindow,
  type EmbeddableWindow,
} from "../src/features/storefront-shell/lib/embedded";

// Bug #35: the WhatsApp button read `window` while rendering, so inside the
// onboarding page's preview (an iframe / ?preview=1) the client rendered
// nothing where the server had rendered the button, and hydration failed.

const storefront = {
  useStorefront: () => ({
    settings: { whatsapp_enabled: true, whatsapp_number: "39990016" },
    lang: "en",
    brand: { name_en: "Pura", name_ar: "بورا" },
  }),
};
vi.mock("../src/lib/storefront-context", () => storefront);
vi.mock("@/lib/storefront-context", () => storefront);
vi.mock("@tanstack/react-router", () => ({ useLocation: () => ({ pathname: "/pura" }) }));

const { WhatsAppFab } = await import("../src/features/storefront-shell/components/WhatsAppFab");

afterEach(() => {
  window.history.replaceState(null, "", "/");
  document.body.innerHTML = "";
});

describe("the WhatsApp button in an embedded preview (#35)", () => {
  it("hydrates the server's HTML without a mismatch, then hides itself", async () => {
    // The server renders the button (it has no window to look at).
    const html = renderToString(<WhatsAppFab />);
    expect(html).toContain("wa.me/39990016");

    // The preview loads the storefront with ?preview=1.
    window.history.replaceState(null, "", "/pura?preview=1");
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    const recoverable = vi.fn();
    await act(async () => {
      hydrateRoot(container, <WhatsAppFab />, { onRecoverableError: recoverable });
    });

    expect(recoverable).not.toHaveBeenCalled();
    expect(container.querySelector("a")).toBeNull();
  });

  it("stays on a normal storefront page", async () => {
    const html = renderToString(<WhatsAppFab />);
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const recoverable = vi.fn();
    await act(async () => {
      hydrateRoot(container, <WhatsAppFab />, { onRecoverableError: recoverable });
    });
    expect(recoverable).not.toHaveBeenCalled();
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("Contact us on WhatsApp");
  });
});

describe("isEmbeddedWindow", () => {
  const win = (overrides: Partial<EmbeddableWindow>): EmbeddableWindow => ({
    self: 1,
    top: 1,
    location: { search: "" },
    ...overrides,
  });

  it("knows a framed page, a preview address, and a normal page", () => {
    expect(isEmbeddedWindow(win({ top: 2 }))).toBe(true);
    expect(isEmbeddedWindow(win({ location: { search: "?preview=1" } }))).toBe(true);
    expect(isEmbeddedWindow(win({}))).toBe(false);
    expect(isEmbeddedWindow(window)).toBe(false);
    expect(isEmbeddedWindow(undefined)).toBe(false);
  });

  it("counts a cross-origin parent it cannot read as framed", () => {
    const crossOrigin: EmbeddableWindow = {
      self: 1,
      location: { search: "" },
      get top(): unknown {
        throw new Error("SecurityError");
      },
    };
    expect(isEmbeddedWindow(crossOrigin)).toBe(true);
  });
});
