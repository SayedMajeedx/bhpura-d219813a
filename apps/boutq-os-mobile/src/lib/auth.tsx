import type { Session } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";

export type StaffProfile = {
  id: string;
  brand_id: string | null;
  full_name: string | null;
  name: string | null;
  email?: string | null;
  role: "super_admin" | "admin" | "brand_admin" | "staff" | "courier" | string;
  status: "active" | "inactive" | string;
  permissions?: string[] | null;
};

export type AccessibleBrand = {
  id: string;
  slug: string;
  name_ar: string | null;
  name_en: string;
  logo_url?: string | null;
  currency?: string;
};

type AuthContextValue = {
  session: Session | null;
  profile: StaffProfile | null;
  loading: boolean;
  error: string | null;
  brands: AccessibleBrand[];
  activeBrand: AccessibleBrand | null;
  activeBrandId: string | null;
  currency: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isCourier: boolean;
  canViewFinancials: boolean;
  hasPermission: (permission: string) => boolean;
  setActiveBrandId: (brandId: string) => void;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<void>;
};

const ACTIVE_BRAND_KEY = "boutq_mobile_active_brand_id";
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brands, setBrands] = useState<AccessibleBrand[]>([]);
  const [activeBrandId, setActiveBrandIdState] = useState<string | null>(null);
  const [brandCurrency, setBrandCurrency] = useState<string>("BHD");

  const loadBrandSettings = useCallback(async (brandId: string) => {
    try {
      const { data } = await supabase
        .from("business_settings")
        .select("currency")
        .eq("brand_id", brandId)
        .maybeSingle();
      if (data?.currency) {
        setBrandCurrency(data.currency.toUpperCase());
      } else {
        setBrandCurrency("BHD");
      }
    } catch {
      setBrandCurrency("BHD");
    }
  }, []);

  const loadProfile = useCallback(
    async (activeSession: Session | null) => {
      if (!activeSession) {
        setProfile(null);
        setBrands([]);
        setActiveBrandIdState(null);
        return;
      }
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("id,brand_id,full_name,name,role,status,permissions")
        .eq("id", activeSession.user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!data || data.status !== "active") throw new Error("الحساب غير مفعّل للإدارة");
      if (
        !["super_admin", "admin", "brand_admin", "staff", "courier"].includes(String(data.role))
      ) {
        throw new Error("هذا الحساب غير مصرح له باستخدام تطبيق الإدارة");
      }

      const loadedProfile: StaffProfile = {
        id: data.id,
        brand_id: data.brand_id,
        full_name: data.full_name,
        name: data.name,
        email: activeSession.user.email,
        role: data.role,
        status: data.status,
        permissions: Array.isArray(data.permissions) ? data.permissions : [],
      };
      setProfile(loadedProfile);

      if (data.brand_id) {
        const { data: brand } = await supabase
          .from("brands")
          .select("id,slug,name_ar,name_en,logo_url")
          .eq("id", data.brand_id)
          .maybeSingle();

        const available = brand ? [brand as AccessibleBrand] : [];
        setBrands(available);
        setActiveBrandIdState(data.brand_id);
        void loadBrandSettings(data.brand_id);
      } else if (data.role === "super_admin") {
        const { data: allBrands } = await supabase
          .from("brands")
          .select("id,slug,name_ar,name_en,logo_url")
          .eq("is_active", true)
          .order("created_at", { ascending: true });

        const available = (allBrands ?? []) as AccessibleBrand[];
        setBrands(available);

        const savedBrandId = await AsyncStorage.getItem(ACTIVE_BRAND_KEY);
        const matched = available.find((b) => b.id === savedBrandId);
        const selectedId = matched ? matched.id : (available[0]?.id ?? null);
        setActiveBrandIdState(selectedId);
        if (selectedId) void loadBrandSettings(selectedId);
      }
    },
    [loadBrandSettings],
  );

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      try {
        await loadProfile(data.session);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "تعذر تحميل الحساب");
      } finally {
        if (mounted) setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void loadProfile(nextSession).catch((cause) => {
        setProfile(null);
        setError(cause instanceof Error ? cause.message : "تعذر تحميل الحساب");
      });
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const setActiveBrandId = useCallback(
    (brandId: string) => {
      setActiveBrandIdState(brandId);
      void AsyncStorage.setItem(ACTIVE_BRAND_KEY, brandId);
      void loadBrandSettings(brandId);
    },
    [loadBrandSettings],
  );

  const activeBrand = useMemo(() => {
    if (!activeBrandId) return null;
    return brands.find((b) => b.id === activeBrandId) ?? null;
  }, [brands, activeBrandId]);

  const isAdmin = useMemo(() => {
    if (!profile) return false;
    return (
      profile.role === "admin" || profile.role === "super_admin" || profile.role === "brand_admin"
    );
  }, [profile]);

  const isSuperAdmin = useMemo(() => profile?.role === "super_admin", [profile]);
  const isCourier = useMemo(() => profile?.role === "courier", [profile]);

  const hasPermission = useCallback(
    (permission: string) => {
      if (!profile) return false;
      if (
        profile.role === "admin" ||
        profile.role === "super_admin" ||
        profile.role === "brand_admin"
      ) {
        return true;
      }
      const perms = profile.permissions ?? [];
      return perms.includes(permission) || perms.includes("all");
    },
    [profile],
  );

  const canViewFinancials = useMemo(() => {
    if (!profile) return false;
    if (isAdmin) return true;
    return hasPermission("view_financials");
  }, [profile, isAdmin, hasPermission]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      error,
      brands,
      activeBrand,
      activeBrandId,
      currency: brandCurrency,
      isAdmin,
      isSuperAdmin,
      isCourier,
      canViewFinancials,
      hasPermission,
      setActiveBrandId,
      signIn: async (email, password) => {
        setError(null);
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError(signInError.message);
          return false;
        }
        return true;
      },
      signOut: async () => {
        await supabase.auth.signOut();
        await AsyncStorage.removeItem(ACTIVE_BRAND_KEY);
        setProfile(null);
        setActiveBrandIdState(null);
        setBrands([]);
      },
      refreshAuth: async () => {
        const { data } = await supabase.auth.getSession();
        await loadProfile(data.session);
      },
    }),
    [
      session,
      profile,
      loading,
      error,
      brands,
      activeBrand,
      activeBrandId,
      brandCurrency,
      isAdmin,
      isSuperAdmin,
      isCourier,
      canViewFinancials,
      hasPermission,
      setActiveBrandId,
      loadProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
