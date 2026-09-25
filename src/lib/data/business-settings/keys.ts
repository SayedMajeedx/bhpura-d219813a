/** Query keys of a brand's `business_settings` row. */
export const businessSettingsKeys = {
  detail: (brandId: string) => ["business-settings", brandId] as const,
  /** The store profile (vertical, modules, fit profiles) read by `useStoreProfile`. */
  storeProfile: (brandId: string) => ["store-profile", brandId] as const,
};
