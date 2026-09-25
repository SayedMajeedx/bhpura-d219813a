import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { moveOrdersToAddress } from "@/lib/data/orders/mutations";
import { customersKeys } from "./keys";

/**
 * Admin customer writes. Every write is scoped by `brand_id` on top of RLS,
 * typed against the generated schema, and throws on error. After a write, call
 * `invalidateCustomers`: it refreshes the list, the profiles and the saved
 * addresses of the brand.
 */

export type NewCustomer = TablesInsert<"customers">;
export type CustomerPatch = TablesUpdate<"customers">;
export type NewCustomerAddress = TablesInsert<"customer_addresses">;
export type CustomerAddressPatch = TablesUpdate<"customer_addresses">;

/** Everything cached about the brand's customers is stale after a write. */
export function invalidateCustomers(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: customersKeys.all(brandId) });
}

// ── Customers ───────────────────────────────────────────────────────────────

/** Creates a customer of the brand. */
export async function createCustomer(brandId: string, values: NewCustomer) {
  const { data, error } = await supabase
    .from("customers")
    .insert({ ...values, brand_id: brandId })
    .select("id, name")
    .single();
  if (error) throw error;
  return data;
}

/** Changes columns of one customer of the brand. */
export async function updateCustomer(brandId: string, customerId: string, patch: CustomerPatch) {
  const { error } = await supabase
    .from("customers")
    .update(patch)
    .eq("brand_id", brandId)
    .eq("id", customerId);
  if (error) throw error;
}

/** Deletes customers of the brand (the server function checks the brand). */
export async function deleteCustomers(brandId: string, customerIds: string[]) {
  const { error } = await supabase.rpc("delete_brand_customers", {
    p_brand_id: brandId,
    p_customer_ids: customerIds,
  });
  if (error) throw error;
}

// ── Saved addresses ─────────────────────────────────────────────────────────

/** Saves a new address for a customer of the brand and returns its id. */
export async function createCustomerAddress(
  brandId: string,
  values: Omit<NewCustomerAddress, "brand_id">,
): Promise<string> {
  const { data, error } = await supabase
    .from("customer_addresses")
    .insert({ ...values, brand_id: brandId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Changes one of a customer's saved addresses. */
export async function updateCustomerAddress(
  brandId: string,
  customerId: string,
  addressId: string,
  patch: CustomerAddressPatch,
) {
  const { error } = await supabase
    .from("customer_addresses")
    .update(patch)
    .eq("id", addressId)
    .eq("customer_id", customerId)
    .eq("brand_id", brandId);
  if (error) throw error;
}

/** Deletes one of a customer's saved addresses. */
export async function deleteCustomerAddress(
  brandId: string,
  customerId: string,
  addressId: string,
) {
  const { error } = await supabase
    .from("customer_addresses")
    .delete()
    .eq("id", addressId)
    .eq("customer_id", customerId)
    .eq("brand_id", brandId);
  if (error) throw error;
}

/**
 * Makes one address the customer's default. Clearing the old default ignores
 * its error, as it always has (bug backlog #17); setting the new one throws.
 */
export async function setDefaultCustomerAddress(
  brandId: string,
  customerId: string,
  addressId: string,
) {
  await supabase
    .from("customer_addresses")
    .update({ is_default: false })
    .eq("customer_id", customerId)
    .eq("brand_id", brandId);
  await updateCustomerAddress(brandId, customerId, addressId, { is_default: true });
}

/**
 * Folds a duplicate address into the one kept: the orders shipping to the
 * duplicate move to the kept address, then the duplicate is deleted. When the
 * orders cannot be moved the duplicate is kept, so no order is left pointing
 * at a deleted address.
 */
export async function mergeDuplicateAddress(
  brandId: string,
  customerId: string,
  keptAddressId: string,
  duplicateAddressId: string,
) {
  await moveOrdersToAddress(brandId, duplicateAddressId, keptAddressId);
  await deleteCustomerAddress(brandId, customerId, duplicateAddressId);
}
