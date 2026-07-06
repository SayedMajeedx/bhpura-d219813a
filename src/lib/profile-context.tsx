import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";

export type UserRole = "admin" | "staff";
export type UserStatus = "active" | "inactive";

export type Profile = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
};

type ProfileContextType = {
  profile: Profile | null;
  isLoading: boolean;
  isAdmin: boolean;
  isActive: boolean;
  canViewFinancials: boolean;
  refreshProfile: () => Promise<void>;
  signOutAndRedirect: () => Promise<void>;
};

const ProfileContext = createContext<ProfileContextType | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error("[ProfileContext] Error fetching profile:", error);
      return null;
    }
    return data as Profile | null;
  }, []);

  const signOutAndRedirect = useCallback(async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }, [navigate]);

  const refreshProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setProfile(null);
      return;
    }
    const p = await fetchProfile(user.id);
    setProfile(p);
  }, [fetchProfile]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!user) {
        setIsLoading(false);
        return;
      }

      const p = await fetchProfile(user.id);
      if (!mounted) return;
      setProfile(p);
      setIsLoading(false);
    };

    init();

    // Listen for auth state changes
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      (async () => {
        if (event === "SIGNED_OUT" || !session) {
          setProfile(null);
          return;
        }
        const p = await fetchProfile(session.user.id);
        if (mounted) setProfile(p);
      })();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const isAdmin = profile?.role === "admin";
  const isActive = profile?.status === "active";
  // Only admins can view financial data (profits, margins, expenses totals)
  const canViewFinancials = isAdmin && isActive;

  return (
    <ProfileContext.Provider
      value={{
        profile,
        isLoading,
        isAdmin,
        isActive,
        canViewFinancials,
        refreshProfile,
        signOutAndRedirect,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }
  return ctx;
}
