import React, { createContext, useContext, useMemo } from "react";
import type { AddonId, BrandAddonRow } from "@/lib/addons/addon-types";
import { isInstalled as checkIsInstalled } from "@/lib/addons/addon-registry";

export interface AddonsContextValue {
  addons: BrandAddonRow[];
  isInstalled: (id: AddonId) => boolean;
  isLoading?: boolean;
}

const AddonsContext = createContext<AddonsContextValue | null>(null);

export function AddonsProvider({
  addons,
  isLoading = false,
  children,
}: {
  addons: BrandAddonRow[];
  isLoading?: boolean;
  children: React.ReactNode;
}) {
  const value = useMemo<AddonsContextValue>(() => {
    return {
      addons: addons || [],
      isInstalled: (id: AddonId) => checkIsInstalled(addons, id),
      isLoading,
    };
  }, [addons, isLoading]);

  return <AddonsContext.Provider value={value}>{children}</AddonsContext.Provider>;
}

export function useAddons(): AddonsContextValue {
  const context = useContext(AddonsContext);
  if (!context) {
    // Return safe fallback if not wrapped in provider
    return {
      addons: [],
      isInstalled: () => false,
      isLoading: false,
    };
  }
  return context;
}
