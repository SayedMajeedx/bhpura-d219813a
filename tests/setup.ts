import "@testing-library/jest-dom";
import { vi } from "vitest";

// No unit test may reach a real server: the app's Supabase client points at
// production. A test that forgets a mock (vi.mock needs the relative path as
// well as the `@/` alias) must fail on its own data, not query the live
// database. Assigned directly (not vi.stubGlobal) so a test's
// vi.unstubAllGlobals() restores this blocker, not the real network.
const blockedRequests: string[] = [];
globalThis.fetch = ((input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  blockedRequests.push(url);
  return Promise.reject(new Error(`Network access is blocked in unit tests: ${url}`));
}) as typeof fetch;
if (typeof globalThis.WebSocket !== "undefined") {
  globalThis.WebSocket = class BlockedWebSocket {
    constructor(url: string | URL) {
      throw new Error(`WebSocket connections are blocked in unit tests: ${String(url)}`);
    }
  } as unknown as typeof WebSocket;
}
/** Requests a test tried to make (for tests that assert none happened). */
(globalThis as { __blockedRequests?: string[] }).__blockedRequests = blockedRequests;

// jsdom does not implement scrollIntoView (used by tab rails to centre the active tab).
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// Mock matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// jsdom has no pointer capture; Radix Select calls it when it opens.
if (typeof Element !== "undefined" && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
}

// jsdom has no ResizeObserver; Radix controls (Switch, Slider) measure with it.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom does not implement media playback: play() returns nothing and load()
// logs "Not implemented". Behave like a browser that resolves playback.
if (typeof HTMLMediaElement !== "undefined") {
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  HTMLMediaElement.prototype.pause = vi.fn();
  HTMLMediaElement.prototype.load = vi.fn();
}

// jsdom does not implement window.open and logs "Not implemented" for every
// call (e.g. WhatsApp share buttons). Behave like a blocked popup instead.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "open", {
    writable: true,
    configurable: true,
    value: vi.fn(() => null),
  });
}
