import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { customersKeys } from "./keys";

export * from "./keys";
export * from "./mutations";
export * from "./own";

/**
 * A brand's customers and their saved delivery addresses, as the admin
 * customers list and profile, the order editor and the dashboard read them.
 * Before this, the customers list and the order editor filled the same key
 * with different orders (newest first vs by name, one throwing and one
 * swallowing errors), and the saved-addresses key took a brand id in some
 * screens and a customer id in others.
 */

export type CustomerRow = Tables<"customers">;
export type CustomerAddressRow = Tables<"customer_addresses">;

/** The brand's customers, newest first. */
export async function fetchCustomers(brandId: string): Promise<CustomerRow[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Id, name and phone of every customer of the brand. */
export async function fetchCustomerContacts(brandId: string) {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone")
    .eq("brand_id", brandId);
  if (error) throw error;
  return data ?? [];
}

/** Phone and email of every customer, to catch duplicates before a save. */
export async function fetchCustomerIdentities(brandId: string) {
  const { data, error } = await supabase
    .from("customers")
    .select("id, phone, email")
    .eq("brand_id", brandId);
  if (error) throw error;
  return data ?? [];
}

/** One customer's profile, or null when it is not a customer of the brand. */
export async function fetchCustomer(brandId: string, customerId: string) {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, email, notes")
    .eq("brand_id", brandId)
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
export type CustomerProfile = NonNullable<Awaited<ReturnType<typeof fetchCustomer>>>;

/** Every saved address of the brand's customers. */
export async function fetchBrandAddresses(brandId: string): Promise<CustomerAddressRow[]> {
  const { data, error } = await supabase
    .from("customer_addresses")
    .select("*")
    .eq("brand_id", brandId);
  if (error) throw error;
  return data ?? [];
}

/** One customer's saved addresses: the default first, then oldest first. */
export async function fetchCustomerAddresses(
  brandId: string,
  customerId: string,
): Promise<CustomerAddressRow[]> {
  const { data, error } = await supabase
    .from("customer_addresses")
    .select("*")
    .eq("brand_id", brandId)
    .eq("customer_id", customerId)
    .order("is_default", { ascending: false })
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

/** Id, name and contact of up to `limit` customers of the brand, by name (pickers). */
export async function fetchCustomerDirectory(brandId: string, limit: number) {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, email")
    .eq("brand_id", brandId)
    .order("name")
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Every customer of the brand with their marketing consent, by name. */
export async function fetchCustomerAudience(brandId: string) {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, marketing_consent, opted_out_at")
    .eq("brand_id", brandId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/**
 * The columns the data export and backup write, newest first. A failure is
 * logged and reads as no customers, so the other exports still work.
 */
export async function fetchCustomersForExport(brandId: string) {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, email, notes, created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to query customers for export:", error);
    return [];
  }
  return data ?? [];
}

/** Up to six customers whose name, phone or email contains `query` (command palette). */
export async function searchCustomers(brandId: string, query: string) {
  const term = `%${query}%`;
  const { data } = await supabase
    .from("customers")
    .select("id, name, phone, email")
    .eq("brand_id", brandId)
    .or(`name.ilike.${term},phone.ilike.${term},email.ilike.${term}`)
    .limit(6);
  return data ?? [];
}

/** Admin screens edit customers while others read them; 30s avoids refetch storms. */
const CUSTOMERS_CACHE = { staleTime: 30_000 } as const;

export const customersQueries = {
  list: (brandId: string) =>
    queryOptions({
      queryKey: customersKeys.list(brandId),
      queryFn: () => fetchCustomers(brandId),
      enabled: Boolean(brandId),
      ...CUSTOMERS_CACHE,
    }),
  contacts: (brandId: string) =>
    queryOptions({
      queryKey: customersKeys.contacts(brandId),
      queryFn: () => fetchCustomerContacts(brandId),
      enabled: Boolean(brandId),
      staleTime: 60_000,
    }),
  detail: (brandId: string, customerId: string) =>
    queryOptions({
      queryKey: customersKeys.detail(brandId, customerId),
      queryFn: () => fetchCustomer(brandId, customerId),
      enabled: Boolean(brandId && customerId),
    }),
  addresses: (brandId: string) =>
    queryOptions({
      queryKey: customersKeys.addresses(brandId),
      queryFn: () => fetchBrandAddresses(brandId),
      enabled: Boolean(brandId),
      ...CUSTOMERS_CACHE,
    }),
  customerAddresses: (brandId: string, customerId: string) =>
    queryOptions({
      queryKey: customersKeys.customerAddresses(brandId, customerId),
      queryFn: () => fetchCustomerAddresses(brandId, customerId),
      enabled: Boolean(brandId && customerId),
    }),
  directory: (brandId: string, limit: number) =>
    queryOptions({
      queryKey: customersKeys.directory(brandId, limit),
      queryFn: () => fetchCustomerDirectory(brandId, limit),
      enabled: Boolean(brandId),
    }),
  audience: (brandId: string) =>
    queryOptions({
      queryKey: customersKeys.audience(brandId),
      queryFn: () => fetchCustomerAudience(brandId),
      enabled: Boolean(brandId),
    }),
  exportRows: (brandId: string) =>
    queryOptions({
      queryKey: customersKeys.exportRows(brandId),
      queryFn: () => fetchCustomersForExport(brandId),
      enabled: Boolean(brandId),
    }),
};
