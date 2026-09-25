/**
 * Query keys of a brand's customers. Everything sits under
 * `["customers", brandId]`, so one `invalidateCustomers` refreshes the list,
 * the profiles and the saved addresses together.
 */
export const customersKeys = {
  all: (brandId: string) => ["customers", brandId] as const,
  /** Every customer row, newest first. */
  list: (brandId: string) => [...customersKeys.all(brandId), "list"] as const,
  /** Id, name and phone of every customer (dashboard). */
  contacts: (brandId: string) => [...customersKeys.all(brandId), "contacts"] as const,
  /** One customer's profile. */
  detail: (brandId: string, customerId: string) =>
    [...customersKeys.all(brandId), "detail", customerId] as const,
  /** Every saved address of the brand (prefix of `customerAddresses`). */
  addresses: (brandId: string) => [...customersKeys.all(brandId), "addresses"] as const,
  /** One customer's saved addresses, default first. */
  customerAddresses: (brandId: string, customerId: string) =>
    [...customersKeys.addresses(brandId), customerId] as const,
};
