import * as React from "react";

export function commandShortcutLabel(platform = ""): "⌘K" | "Ctrl+K" {
  return /mac|iphone|ipad|ipod/i.test(platform) ? "⌘K" : "Ctrl+K";
}

export function useCommandShortcutLabel(): "⌘K" | "Ctrl+K" {
  const [label, setLabel] = React.useState<"⌘K" | "Ctrl+K">("Ctrl+K");

  React.useEffect(() => {
    setLabel(commandShortcutLabel(window.navigator.platform));
  }, []);

  return label;
}

/**
 * The shortcut written after a search's placeholder (" (⌘K)"), or nothing on a device with no
 * mouse or trackpad: a phone has no keys to press, and the hint cut the placeholder itself
 * ("Search product name, SKU, or barcode... (Ctrl+K)" in a 222px field).
 */
export function shortcutHint(label: string, hasFinePointer: boolean): string {
  return hasFinePointer ? ` (${label})` : "";
}

export function useShortcutHint(): string {
  const label = useCommandShortcutLabel();
  const [fine, setFine] = React.useState(true);

  React.useEffect(() => {
    setFine(window.matchMedia?.("(any-pointer: fine)").matches ?? true);
  }, []);

  return shortcutHint(label, fine);
}
