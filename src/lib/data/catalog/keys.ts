/** Query keys of the admin catalog. Lists start with the table name and the brand. */
export const catalogKeys = {
  products: (brandId: string) => ["products", brandId] as const,
  /** The products with their variants for the data export (refreshed with the product list). */
  productExportRows: (brandId: string) => ["products", brandId, "export"] as const,
  variants: (brandId: string) => ["variants", brandId] as const,
  bomItems: (brandId: string) => ["product-bom-items-all", brandId] as const,
  /** Every product's own BOM of the brand (prefix of `productBom`). */
  productBoms: (brandId: string) => ["product-bom-items", brandId] as const,
  productBom: (brandId: string, productId: string) =>
    [...catalogKeys.productBoms(brandId), productId] as const,
  packagingMaterials: (brandId: string) => ["packaging-materials", brandId] as const,
  /** Paid add-ons (customization options), shared by the inventory tab and the order editor. */
  customizations: (brandId: string) => ["customizations", brandId] as const,
};
