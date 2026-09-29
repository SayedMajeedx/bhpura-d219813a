import {
  Coffee,
  FileCode,
  Flower2,
  Gem,
  Gift,
  Home,
  Printer,
  Shirt,
  Smartphone,
  Sparkles,
  Store,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import type { StoreVertical } from "@/lib/store-profile";
import { getVerticalDefinition } from "@/lib/verticals/registry";

/** The icons the vertical registry names; an unknown name shows the store icon. */
const ICONS: Record<string, LucideIcon> = {
  Coffee,
  FileCode,
  Flower2,
  Gem,
  Gift,
  Home,
  Printer,
  Shirt,
  Smartphone,
  Sparkles,
  Store,
  Utensils,
};

export function verticalIcon(vertical: StoreVertical): LucideIcon {
  return ICONS[getVerticalDefinition(vertical).icon] ?? Store;
}

/** A vertical's icon, as the vertical registry names it. */
export function VerticalIcon({
  vertical,
  className,
}: {
  vertical: StoreVertical;
  className?: string;
}) {
  const Icon = verticalIcon(vertical);
  return <Icon className={className} aria-hidden="true" />;
}
