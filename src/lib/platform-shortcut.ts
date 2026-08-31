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
