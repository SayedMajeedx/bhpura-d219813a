import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import {
  getInstalledAddons,
  installAddon,
  disableAddon,
  enableAddon,
  removeAddon,
  updateAddonSettings,
} from "@/lib/addons/addons.functions";
import type { AddonId, BrandAddonRow } from "@/lib/addons/addon-types";
import { isInstalled as checkIsInstalled } from "@/lib/addons/addon-registry";
import { modulesFromAddons } from "@/lib/addons/addon-compat";
import type { StoreModules } from "@/lib/store-profile";

export function useBrandAddons(brandId?: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.addons.all(brandId || ""),
    queryFn: async () => {
      if (!brandId) return [];
      return (await getInstalledAddons({ data: { brandId } })) as BrandAddonRow[];
    },
    enabled: Boolean(brandId),
    staleTime: 1000 * 60 * 5,
  });

  const invalidate = () => {
    if (brandId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.addons.all(brandId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.brand.storeProfile(brandId) });
    }
  };

  const installMut = useMutation({
    mutationFn: async ({
      addonId,
      source,
    }: {
      addonId: AddonId;
      source?: "onboarding" | "manual" | "super_admin";
    }) => {
      if (!brandId) throw new Error("No brand selected");
      return await installAddon({ data: { brandId, addonId, source } });
    },
    onSuccess: invalidate,
  });

  const disableMut = useMutation({
    mutationFn: async ({ addonId }: { addonId: AddonId }) => {
      if (!brandId) throw new Error("No brand selected");
      return await disableAddon({ data: { brandId, addonId } });
    },
    onSuccess: invalidate,
  });

  const enableMut = useMutation({
    mutationFn: async ({ addonId }: { addonId: AddonId }) => {
      if (!brandId) throw new Error("No brand selected");
      return await enableAddon({ data: { brandId, addonId } });
    },
    onSuccess: invalidate,
  });

  const removeMut = useMutation({
    mutationFn: async ({ addonId }: { addonId: AddonId }) => {
      if (!brandId) throw new Error("No brand selected");
      return await removeAddon({ data: { brandId, addonId } });
    },
    onSuccess: invalidate,
  });

  const updateSettingsMut = useMutation({
    mutationFn: async ({
      addonId,
      settings,
    }: {
      addonId: AddonId;
      settings: Record<string, unknown>;
    }) => {
      if (!brandId) throw new Error("No brand selected");
      return await updateAddonSettings({ data: { brandId, addonId, settings } });
    },
    onSuccess: invalidate,
  });

  const addons = query.data || [];

  const isInstalled = (addonId: AddonId): boolean => {
    return checkIsInstalled(addons, addonId);
  };

  const getSettings = (addonId: AddonId): Record<string, unknown> => {
    const row = addons.find((r) => r.addon_id === addonId);
    return row?.settings || {};
  };

  const getPublicSettings = (addonId: AddonId): Record<string, unknown> => {
    const row = addons.find((r) => r.addon_id === addonId);
    return row?.public_settings || {};
  };

  const modules: StoreModules = modulesFromAddons(addons);

  return {
    addons,
    modules,
    isInstalled,
    getSettings,
    getPublicSettings,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    installAddon: installMut.mutateAsync,
    disableAddon: disableMut.mutateAsync,
    enableAddon: enableMut.mutateAsync,
    removeAddon: removeMut.mutateAsync,
    updateSettings: updateSettingsMut.mutateAsync,
    isMutating:
      installMut.isPending ||
      disableMut.isPending ||
      enableMut.isPending ||
      removeMut.isPending ||
      updateSettingsMut.isPending,
  };
}
