import { createContext, useContext, type ReactNode } from "react";

export type Brand = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string | null;
  logo_url: string | null;
  favicon_url?: string | null;
  is_active: boolean;
};

const BrandContext = createContext<Brand | null>(null);

export function BrandProvider({ brand, children }: { brand: Brand; children: ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand(): Brand {
  const b = useContext(BrandContext);
  if (!b) throw new Error("useBrand must be used within a BrandProvider (inside /b/$slug/*)");
  return b;
}

export function useBrandOptional(): Brand | null {
  return useContext(BrandContext);
}
