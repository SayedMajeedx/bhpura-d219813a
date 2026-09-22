import {
  Coffee,
  Crown,
  Download,
  Gem,
  Gift,
  Printer,
  Puzzle,
  Ruler,
  Scissors,
  Shirt,
  Sparkles,
  UserCheck,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { AddonId } from "./addon-types";

/**
 * Store-surface artwork per add-on. Lives with the add-on subsystem so core
 * components never switch on vertical-specific add-on ids themselves.
 */
const ADDON_ICONS: Partial<Record<AddonId, LucideIcon>> = {
  "size-guides": Ruler,
  "fit-passport": UserCheck,
  "made-to-order": Scissors,
  "abaya-pack": Crown,
  "fashion-core": Shirt,
  "beauty-perfume": Sparkles,
  "coffee-roastery": Coffee,
  "food-beverage": UtensilsCrossed,
  "digital-products": Download,
  gifts: Gift,
  jewelry: Gem,
  "print-stamps": Printer,
};

export function addonIconFor(id: AddonId, fallback: LucideIcon = Puzzle): LucideIcon {
  return ADDON_ICONS[id] ?? fallback;
}

export function AddonIcon({
  id,
  className,
  fallback,
}: {
  id: AddonId;
  className?: string;
  fallback?: LucideIcon;
}) {
  const Icon = addonIconFor(id, fallback);
  return <Icon className={className} />;
}
