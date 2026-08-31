import { describe, expect, it } from "vitest";
import { maskPhoneForList } from "../src/lib/privacy";
import { commandShortcutLabel } from "../src/lib/platform-shortcut";

describe("admin list privacy", () => {
  it("keeps the country code and last four digits for an international phone", () => {
    expect(maskPhoneForList("+973 3333 1234")).toBe("+973 •••• 1234");
  });

  it("masks local phone numbers without inventing a country code", () => {
    expect(maskPhoneForList("33331234")).toBe("•••• 1234");
    expect(maskPhoneForList(null)).toBe("");
  });
});

describe("admin search shortcut label", () => {
  it("uses the native label for Apple devices", () => {
    expect(commandShortcutLabel("MacIntel")).toBe("⌘K");
    expect(commandShortcutLabel("iPhone")).toBe("⌘K");
  });

  it("uses Ctrl on Windows and other platforms", () => {
    expect(commandShortcutLabel("Win32")).toBe("Ctrl+K");
    expect(commandShortcutLabel("Linux x86_64")).toBe("Ctrl+K");
  });
});
