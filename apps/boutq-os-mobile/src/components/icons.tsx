import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";

type IconProps = {
  size?: number;
  color?: string;
  style?: any;
};

// Map common names to valid Ionicons icon names
const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
  grid: "grid-outline",
  "grid-fill": "grid",
  receipt: "receipt-outline",
  "receipt-fill": "receipt",
  cube: "cube-outline",
  "cube-fill": "cube",
  people: "people-outline",
  "people-fill": "people",
  wallet: "wallet-outline",
  "wallet-fill": "wallet",
  "ellipsis-horizontal": "ellipsis-horizontal-circle-outline",
  search: "search-outline",
  close: "close",
  "close-circle": "close-circle",
  add: "add",
  remove: "remove",
  checkmark: "checkmark",
  "checkmark-circle": "checkmark-circle",
  call: "call-outline",
  "logo-whatsapp": "logo-whatsapp",
  copy: "copy-outline",
  globe: "globe-outline",
  "chevron-forward": "chevron-forward",
  "chevron-back": "chevron-back",
  "chevron-down": "chevron-down",
  "bar-chart": "bar-chart-outline",
  pricetag: "pricetag-outline",
  tag: "pricetag-outline",
  folder: "folder-outline",
  business: "business-outline",
  star: "star",
  "paper-plane": "paper-plane-outline",
  "document-text": "document-text-outline",
  storefront: "storefront-outline",
  "person-add": "person-add-outline",
  person: "person-outline",
  pencil: "pencil-outline",
  car: "car-outline",
  "shield-checkmark": "shield-checkmark-outline",
  card: "card-outline",
  "phone-portrait": "phone-portrait-outline",
  "alert-circle": "alert-circle-outline",
  megaphone: "megaphone-outline",
  calculator: "calculator-outline",
  menu: "menu-outline",
  settings: "settings-outline",
  "share-social": "share-social-outline",
  percent: "pricetag-outline",
  cash: "cash-outline",
  key: "key-outline",
  mail: "mail-outline",
};

export function AppIcon({
  name,
  size = 20,
  color = colors.text,
  style,
}: {
  name: string;
  size?: number;
  color?: string;
  style?: any;
}) {
  const glyph = (iconMap[name] || name) as keyof typeof Ionicons.glyphMap;
  return <Ionicons name={glyph} size={size} color={color} style={style} />;
}

export const Icons = {
  Dashboard: ({ size = 22, color = colors.text, style }: IconProps) => (
    <Ionicons name="grid-outline" size={size} color={color} style={style} />
  ),
  DashboardFilled: ({ size = 22, color = colors.brand, style }: IconProps) => (
    <Ionicons name="grid" size={size} color={color} style={style} />
  ),
  Orders: ({ size = 22, color = colors.text, style }: IconProps) => (
    <Ionicons name="receipt-outline" size={size} color={color} style={style} />
  ),
  OrdersFilled: ({ size = 22, color = colors.brand, style }: IconProps) => (
    <Ionicons name="receipt" size={size} color={color} style={style} />
  ),
  Inventory: ({ size = 22, color = colors.text, style }: IconProps) => (
    <Ionicons name="cube-outline" size={size} color={color} style={style} />
  ),
  InventoryFilled: ({ size = 22, color = colors.brand, style }: IconProps) => (
    <Ionicons name="cube" size={size} color={color} style={style} />
  ),
  Customers: ({ size = 22, color = colors.text, style }: IconProps) => (
    <Ionicons name="people-outline" size={size} color={color} style={style} />
  ),
  CustomersFilled: ({ size = 22, color = colors.brand, style }: IconProps) => (
    <Ionicons name="people" size={size} color={color} style={style} />
  ),
  Expenses: ({ size = 22, color = colors.text, style }: IconProps) => (
    <Ionicons name="wallet-outline" size={size} color={color} style={style} />
  ),
  ExpensesFilled: ({ size = 22, color = colors.brand, style }: IconProps) => (
    <Ionicons name="wallet" size={size} color={color} style={style} />
  ),
  More: ({ size = 22, color = colors.text, style }: IconProps) => (
    <Ionicons name="ellipsis-horizontal-circle-outline" size={size} color={color} style={style} />
  ),
  Search: ({ size = 20, color = colors.muted, style }: IconProps) => (
    <Ionicons name="search-outline" size={size} color={color} style={style} />
  ),
  Close: ({ size = 20, color = colors.text, style }: IconProps) => (
    <Ionicons name="close" size={size} color={color} style={style} />
  ),
  CloseCircle: ({ size = 18, color = colors.muted, style }: IconProps) => (
    <Ionicons name="close-circle" size={size} color={color} style={style} />
  ),
  Plus: ({ size = 20, color = "#fff", style }: IconProps) => (
    <Ionicons name="add" size={size} color={color} style={style} />
  ),
  Minus: ({ size = 20, color = "#fff", style }: IconProps) => (
    <Ionicons name="remove" size={size} color={color} style={style} />
  ),
  Check: ({ size = 20, color = colors.success, style }: IconProps) => (
    <Ionicons name="checkmark" size={size} color={color} style={style} />
  ),
  ChevronDown: ({ size = 18, color = colors.text, style }: IconProps) => (
    <Ionicons name="chevron-down" size={size} color={color} style={style} />
  ),
  ChevronLeft: ({ size = 18, color = colors.text, style }: IconProps) => (
    <Ionicons name="chevron-back" size={size} color={color} style={style} />
  ),
  ChevronRight: ({ size = 18, color = colors.text, style }: IconProps) => (
    <Ionicons name="chevron-forward" size={size} color={color} style={style} />
  ),
  Phone: ({ size = 18, color = colors.brand, style }: IconProps) => (
    <Ionicons name="call-outline" size={size} color={color} style={style} />
  ),
  WhatsApp: ({ size = 18, color = "#25D366", style }: IconProps) => (
    <Ionicons name="logo-whatsapp" size={size} color={color} style={style} />
  ),
  Copy: ({ size = 18, color = colors.brand, style }: IconProps) => (
    <Ionicons name="copy-outline" size={size} color={color} style={style} />
  ),
  AlertCircle: ({ size = 24, color = colors.warning, style }: IconProps) => (
    <Ionicons name="alert-circle-outline" size={size} color={color} style={style} />
  ),
};
