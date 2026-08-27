import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";

export type StaffProfile = {
  id: string;
  brand_id: string | null;
  full_name: string | null;
  name: string | null;
  role: string | null;
  status: string | null;
};

export type AccessibleBrand = { id: string; slug: string; name_ar: string | null; name_en: string };

type AuthContextValue = {
  session: Session | null;
  profile: StaffProfile | null;
  loading: boolean;
  error: string | null;
  brands: AccessibleBrand[];
  activeBrandId: string | null;
  setActiveBrandId: (brandId: string) => void;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brands, setBrands] = useState<AccessibleBrand[]>([]);
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null);

  const loadProfile = async (activeSession: Session | null) => {
    if (!activeSession) {
      setProfile(null);
      return;
    }
    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("id,brand_id,full_name,name,role,status")
      .eq("id", activeSession.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!data || data.status !== "active") throw new Error("الحساب غير مفعّل للإدارة");
    if (!["super_admin", "admin", "brand_admin", "staff", "courier"].includes(String(data.role))) {
      throw new Error("هذا الحساب غير مصرح له باستخدام تطبيق الإدارة");
    }
    setProfile(data as StaffProfile);
    if (data.brand_id) {
      const { data: brand } = await supabase
        .from("brands")
        .select("id,slug,name_ar,name_en")
        .eq("id", data.brand_id)
        .maybeSingle();
      const available = brand ? [brand as AccessibleBrand] : [];
      setBrands(available);
      setActiveBrandId(data.brand_id);
    } else if (data.role === "super_admin") {
      const { data: allBrands } = await supabase
        .from("brands")
        .select("id,slug,name_ar,name_en")
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      const available = (allBrands ?? []) as AccessibleBrand[];
      setBrands(available);
      setActiveBrandId((current) =>
        current && available.some((brand) => brand.id === current)
          ? current
          : (available[0]?.id ?? null),
      );
    }
  };

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
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      error,
      brands,
      activeBrandId,
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
        setProfile(null);
      },
    }),
    [session, profile, loading, error, brands, activeBrandId],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
