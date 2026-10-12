import type { CustomerAddressRow } from "@/lib/data/customers";
export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  region: string | null;
  block: string | null;
  road: string | null;
  house: string | null;
  flat: string | null;
};

/** The edit dialog lists a customer's addresses oldest first; the shared list puts the default first. */
export const oldestFirst = (addresses: CustomerAddressRow[]) =>
  [...addresses].sort((a, b) => a.created_at.localeCompare(b.created_at));

export type Address = {
  id: string;
  customer_id: string;
  label: string | null;
  region: string | null;
  block: string | null;
  road: string | null;
  house: string | null;
  flat: string | null;
  is_default: boolean;
};
