import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_THEME_COLOR, applyThemeColor, storefrontThemeColor } from "../src/lib/theme-color";
import { ThemeProvider, useTheme } from "../src/lib/theme-context";
import { storefrontHead } from "../src/features/storefront-shell/lib/storefront-head";

// The phone's status bar takes the colour at the top of the page: the admin's bar, in its theme,
// or a store's own header. There was no theme-color tag at all.

let tag: HTMLMetaElement;

beforeEach(() => {
  tag = document.createElement("meta");
  tag.name = "theme-color";
  tag.content = ADMIN_THEME_COLOR.light;
  document.head.appendChild(tag);
});

afterEach(() => {
  tag.remove();
  localStorage.clear();
});

describe("a store's status bar colour", () => {
  it("is its header's colour, white when it has none or it is not a colour", () => {
    expect(storefrontThemeColor("#3f121a")).toBe("#3f121a");
    expect(storefrontThemeColor(" #FFF ")).toBe("#FFF");
    expect(storefrontThemeColor(null)).toBe("#ffffff");
    expect(storefrontThemeColor("red; x")).toBe("#ffffff");
  });

  it("is written in the store's head", () => {
    const head = storefrontHead({
      brand: { id: "b1", slug: "pura", name_en: "Pura" },
      settings: { header_bg: "#876262" },
      initialLang: "ar",
    }) as { meta: Array<Record<string, string>> };
    expect(head.meta).toContainEqual({ name: "theme-color", content: "#876262" });
  });
});

describe("the admin's status bar colour", () => {
  it("is set and put back, leaving a colour someone else wrote since", () => {
    const undo = applyThemeColor(ADMIN_THEME_COLOR.dark);
    expect(tag.content).toBe(ADMIN_THEME_COLOR.dark);
    undo();
    expect(tag.content).toBe(ADMIN_THEME_COLOR.light);

    const undoAgain = applyThemeColor(ADMIN_THEME_COLOR.dark);
    tag.content = "#876262"; // the router wrote a store's colour on the way out
    undoAgain();
    expect(tag.content).toBe("#876262");
  });

  it("follows the admin's theme, which is a class and not only the OS setting", () => {
    localStorage.setItem("boutq_theme", "dark");
    let setTheme: (t: "light" | "dark") => void = () => undefined;
    function Switch() {
      setTheme = useTheme().setTheme;
      return null;
    }
    const view = render(
      <ThemeProvider>
        <Switch />
      </ThemeProvider>,
    );
    expect(tag.content).toBe(ADMIN_THEME_COLOR.dark);
    act(() => setTheme("light"));
    expect(tag.content).toBe(ADMIN_THEME_COLOR.light);
    act(() => setTheme("dark"));
    view.unmount();
    expect(tag.content).toBe(ADMIN_THEME_COLOR.light);
  });
});
