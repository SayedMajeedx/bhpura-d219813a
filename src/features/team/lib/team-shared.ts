import { getCurrentSession } from "@/lib/auth/session";
import type { Profile } from "@/lib/profile-context";
import { edgeFunctionUrl, supabasePublicKey } from "@/lib/supabase-project";

export type StaffMember = Profile;

export async function callUserManagement(action: string, body?: any) {
  const session = await getCurrentSession();
  if (!session) throw new Error("No session");

  const endpoint = edgeFunctionUrl("user-management");
  if (!endpoint) throw new Error("This build has no Supabase address (VITE_SUPABASE_URL).");
  const url = new URL(endpoint);
  url.searchParams.set("action", action);
  const publicKey = supabasePublicKey();

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(publicKey ? { apikey: publicKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseText = await response.text();
  let result: any = {};
  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    result = { error: responseText || `Request failed (${response.status})` };
  }
  if (!response.ok) {
    throw new Error(result.error || `Request failed (${response.status})`);
  }
  return result;
}

export const AVAILABLE_PERMISSIONS = [
  { id: "manage_inventory", labelEn: "Manage Inventory", labelAr: "إدارة المخزون" },
  { id: "manage_orders", labelEn: "Manage Orders", labelAr: "إدارة الطلبات" },
  { id: "manage_customers", labelEn: "Manage Customers", labelAr: "إدارة العملاء" },
  { id: "view_financials", labelEn: "View Financials", labelAr: "عرض البيانات المالية" },
  { id: "manage_settings", labelEn: "Manage Settings", labelAr: "إدارة الإعدادات" },
];

export const PERMISSION_PRESETS = [
  {
    id: "all",
    labelEn: "Full Operational",
    labelAr: "كامل الصلاحيات",
    permissions: [
      "manage_inventory",
      "manage_orders",
      "manage_customers",
      "view_financials",
      "manage_settings",
    ],
  },
  {
    id: "sales_orders",
    labelEn: "Sales & Orders",
    labelAr: "مبيعات وطلبات",
    permissions: ["manage_orders", "manage_customers"],
  },
  {
    id: "inventory",
    labelEn: "Inventory & Stock",
    labelAr: "مخزون ومنتجات",
    permissions: ["manage_inventory", "manage_orders"],
  },
  {
    id: "finance",
    labelEn: "Finance & Accounts",
    labelAr: "محاسب مالي",
    permissions: ["view_financials", "manage_orders"],
  },
];
