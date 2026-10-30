/**
 * The colour a phone paints its status bar and browser chrome (`<meta name="theme-color">`): the
 * colour at the very top of the page, so the bar and the page read as one surface.
 *
 * The admin's phone bar is `--os-glass-strong` over the canvas; these are those colours flattened
 * (light and dark). The admin's theme is a class, not the OS setting, so the theme provider sets
 * the tag when the theme changes (`applyThemeColor`); the router keeps one tag per name, so a
 * light/dark pair of tags with `media` cannot be declared in a route's head. A store's pages use
 * its own header colour (`storefrontThemeColor`).
 */
export const ADMIN_THEME_COLOR = { light: "#fcfcfd", dark: "#1c1e28" } as const;

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** A store's status bar colour: its header's own colour, white when it has none (as the header). */
export function storefrontThemeColor(headerBg: string | null | undefined): string {
  const value = headerBg?.trim() ?? "";
  return HEX.test(value) ? value : "#ffffff";
}

/**
 * Points the page's theme-color tag at `color` and returns how to put the previous colour back.
 * The undo leaves a colour someone else wrote since (leaving the admin for a store: the router
 * writes the store's colour before the admin's cleanup runs). Does nothing where there is no
 * document or no tag.
 */
export function applyThemeColor(color: string): () => void {
  if (typeof document === "undefined") return () => undefined;
  const tag = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!tag) return () => undefined;
  const previous = tag.content;
  tag.content = color;
  return () => {
    if (tag.content === color) tag.content = previous;
  };
}
