import "@testing-library/jest-dom";
import { vi } from "vitest";

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

// jsdom does not implement window.open and logs "Not implemented" for every
// call (e.g. WhatsApp share buttons). Behave like a blocked popup instead.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "open", {
    writable: true,
    configurable: true,
    value: vi.fn(() => null),
  });
}
