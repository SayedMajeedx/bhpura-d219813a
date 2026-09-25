import * as React from "react";
import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import { diffObjects } from "./diff";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { businessSettingsQueries } from "@/lib/data/business-settings";

type BusinessSettingsRow = Database["public"]["Tables"]["business_settings"]["Row"];
type BrandRow = Database["public"]["Tables"]["brands"]["Row"];

export type BeforeSaveHook = () => Promise<boolean | void> | boolean | void;
export type AfterSaveHook = () => Promise<void> | void;

export type SetRowFn<T> = {
  <K extends keyof T>(key: K, value: T[K]): void;
  (patch: Partial<T>): void;
};

export interface BrandSettingsFormState {
  brandId: string;
  bs: Partial<BusinessSettingsRow>;
  brand: Partial<BrandRow>;
  initialBs: Partial<BusinessSettingsRow>;
  initialBrand: Partial<BrandRow>;
  isLoading: boolean;
  isSaving: boolean;
  isDirty: boolean;
  dirtyCount: number;
  diffBs: Partial<BusinessSettingsRow>;
  diffBrand: Partial<BrandRow>;
  error: Error | null;
  isError: boolean;
  setBs: SetRowFn<BusinessSettingsRow>;
  patchBs: (patch: Partial<BusinessSettingsRow>) => void;
  setBrand: SetRowFn<BrandRow>;
  patchBrand: (patch: Partial<BrandRow>) => void;
  registerBeforeSave: (hook: BeforeSaveHook) => () => void;
  registerAfterSave: (hook: AfterSaveHook) => () => void;
  save: () => Promise<boolean>;
  reset: () => void;
  refetch: () => Promise<void>;
  form: BrandSettingsFormState;
}

const BrandSettingsFormContext = createContext<BrandSettingsFormState | null>(null);

export function useBrandSettingsForm(brandId: string): BrandSettingsFormState {
  const queryClient = useQueryClient();

  // 1. Fetch business_settings
  const {
    data: bsData,
    isLoading: isBsLoading,
    error: bsError,
    refetch: refetchBsQuery,
  } = useQuery(businessSettingsQueries.detail(brandId));

  // 2. Fetch brand profile
  const {
    data: brandData,
    isLoading: isBrandLoading,
    error: brandError,
    refetch: refetchBrandQuery,
  } = useQuery({
    queryKey: queryKeys.brand.profile(brandId),
    queryFn: async () => {
      if (!brandId) return null;
      const { data, error } = await supabase
        .from("brands")
        .select(
          "id, slug, name_en, name_ar, hero_media, about_ar, about_en, meta_title, meta_description, logo_url, custom_domain, support_access_enabled, primary_color, plan_type, trial_ends_at",
        )
        .eq("id", brandId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(brandId),
  });

  const [bs, setBsState] = useState<Partial<BusinessSettingsRow>>({});
  const [brand, setBrandState] = useState<Partial<BrandRow>>({});
  const [initialBs, setInitialBs] = useState<Partial<BusinessSettingsRow>>({});
  const [initialBrand, setInitialBrand] = useState<Partial<BrandRow>>({});
  const [isSaving, setIsSaving] = useState(false);

  const beforeSaveHooksRef = useRef<Set<BeforeSaveHook>>(new Set());
  const afterSaveHooksRef = useRef<Set<AfterSaveHook>>(new Set());

  // Initialize form state when query data is loaded
  useEffect(() => {
    if (bsData) {
      setBsState(bsData);
      setInitialBs(bsData);
    }
  }, [bsData]);

  useEffect(() => {
    if (brandData) {
      setBrandState(brandData);
      setInitialBrand(brandData);
    }
  }, [brandData]);

  const setBs = useCallback((patchOrKey: any, maybeValue?: any) => {
    if (typeof patchOrKey === "string") {
      setBsState((prev) => ({ ...prev, [patchOrKey]: maybeValue }));
    } else if (patchOrKey && typeof patchOrKey === "object") {
      setBsState((prev) => ({ ...prev, ...patchOrKey }));
    }
  }, []) as SetRowFn<BusinessSettingsRow>;

  const patchBs = useCallback((patch: Partial<BusinessSettingsRow>) => {
    setBsState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setBrand = useCallback((patchOrKey: any, maybeValue?: any) => {
    if (typeof patchOrKey === "string") {
      setBrandState((prev) => ({ ...prev, [patchOrKey]: maybeValue }));
    } else if (patchOrKey && typeof patchOrKey === "object") {
      setBrandState((prev) => ({ ...prev, ...patchOrKey }));
    }
  }, []) as SetRowFn<BrandRow>;

  const patchBrand = useCallback((patch: Partial<BrandRow>) => {
    setBrandState((prev) => ({ ...prev, ...patch }));
  }, []);

  const registerBeforeSave = useCallback((hook: BeforeSaveHook) => {
    beforeSaveHooksRef.current.add(hook);
    return () => {
      beforeSaveHooksRef.current.delete(hook);
    };
  }, []);

  const registerAfterSave = useCallback((hook: AfterSaveHook) => {
    afterSaveHooksRef.current.add(hook);
    return () => {
      afterSaveHooksRef.current.delete(hook);
    };
  }, []);

  const diffBs = diffObjects(initialBs, bs);
  const diffBrand = diffObjects(initialBrand, brand);
  const dirtyCount = Object.keys(diffBs).length + Object.keys(diffBrand).length;
  const isDirty = dirtyCount > 0;

  const reset = useCallback(() => {
    setBsState(initialBs);
    setBrandState(initialBrand);
  }, [initialBs, initialBrand]);

  const refetch = useCallback(async () => {
    await Promise.all([refetchBsQuery(), refetchBrandQuery()]);
  }, [refetchBsQuery, refetchBrandQuery]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!brandId) return false;

    // Run beforeSave hooks
    for (const hook of beforeSaveHooksRef.current) {
      try {
        const res = await hook();
        if (res === false) return false;
      } catch (err: any) {
        toast.error(err?.message || "فشل التحقق قبل الحفظ");
        return false;
      }
    }

    const currentDiffBs = diffObjects(initialBs, bs);
    const currentDiffBrand = diffObjects(initialBrand, brand);

    // Omit primary_color from brand diff because it is kept in sync via DB trigger
    if ("primary_color" in currentDiffBrand) {
      delete currentDiffBrand.primary_color;
    }

    if (Object.keys(currentDiffBs).length === 0 && Object.keys(currentDiffBrand).length === 0) {
      toast.info("لا توجد تعديلات جديدة للحفظ");
      return true;
    }

    setIsSaving(true);
    try {
      if (Object.keys(currentDiffBs).length > 0) {
        const { error: bsErr } = await (supabase.from("business_settings") as any).upsert(
          { ...currentDiffBs, brand_id: brandId },
          { onConflict: "brand_id" },
        );
        if (bsErr) throw bsErr;
      }

      if (Object.keys(currentDiffBrand).length > 0) {
        const { error: bErr } = await (supabase.from("brands") as any)
          .update(currentDiffBrand)
          .eq("id", brandId);
        if (bErr) throw bErr;
      }

      // Invalidate relevant queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.brand.businessSettings(brandId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.brand.storeProfile(brandId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.brand.profile(brandId) }),
        queryClient.invalidateQueries({ queryKey: ["business-settings-theme", brandId] }),
        queryClient.invalidateQueries({ queryKey: ["brand-hero", brandId] }),
        queryClient.invalidateQueries({ queryKey: ["brands"] }),
      ]);

      // Update snapshot
      setInitialBs((prev) => ({ ...prev, ...currentDiffBs }));
      setInitialBrand((prev) => ({ ...prev, ...currentDiffBrand }));

      // Run afterSave hooks
      for (const hook of afterSaveHooksRef.current) {
        try {
          await hook();
        } catch (err) {
          console.warn("After save hook error:", err);
        }
      }

      toast.success("تم حفظ الإعدادات بنجاح");
      return true;
    } catch (err: any) {
      console.error("Save settings error:", err);
      toast.error(err?.message || "حدث خطأ أثناء حفظ الإعدادات");
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [brandId, initialBs, bs, initialBrand, brand, queryClient]);

  const state: BrandSettingsFormState = {
    brandId,
    bs,
    brand,
    initialBs,
    initialBrand,
    isLoading: isBsLoading || isBrandLoading,
    isSaving,
    isDirty,
    dirtyCount,
    diffBs,
    diffBrand,
    error: (bsError as Error) || (brandError as Error) || null,
    isError: Boolean(bsError || brandError),
    setBs,
    patchBs,
    setBrand,
    patchBrand,
    registerBeforeSave,
    registerAfterSave,
    save,
    reset,
    refetch,
    form: null as any,
  };
  state.form = state;
  return state;
}

export function BrandSettingsFormProvider({
  brandId,
  form: providedForm,
  children,
}: {
  brandId?: string;
  form?: BrandSettingsFormState;
  children: React.ReactNode;
}) {
  const localForm = useBrandSettingsForm(brandId || "");
  const form = providedForm ?? localForm;
  return (
    <BrandSettingsFormContext.Provider value={form}>{children}</BrandSettingsFormContext.Provider>
  );
}

export function useBrandSettingsFormContext(): BrandSettingsFormState {
  const ctx = useContext(BrandSettingsFormContext);
  if (!ctx) {
    throw new Error("useBrandSettingsFormContext must be used within a BrandSettingsFormProvider");
  }
  return ctx;
}
