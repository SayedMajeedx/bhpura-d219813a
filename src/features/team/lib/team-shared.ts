import { getCurrentSession } from "@/lib/auth/session";
import type { Profile } from "@/lib/profile-context";

export type StaffMember = Profile;

export const USER_MANAGEMENT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-management`;
export const SUPABASE_PUBLIC_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

export async function callUserManagement(action: string, body?: any) {
  const session = await getCurrentSession();
  if (!session) throw new Error("No session");

  const url = new URL(USER_MANAGEMENT_URL);
  url.searchParams.set("action", action);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(SUPABASE_PUBLIC_KEY ? { apikey: SUPABASE_PUBLIC_KEY } : {}),
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
