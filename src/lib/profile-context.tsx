import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { signOut } from "@/lib/auth/session";
import { useNavigate } from "@tanstack/react-router";
import { keepIfSame, profileAuthAction } from "@/lib/profile-refresh";

export type UserRole = "super_admin" | "admin" | "brand_admin" | "staff" | "courier";
export type UserStatus = "active" | "inactive";

export const SUPER_ADMIN_EMAIL = "majeed@hotmail.it";

export type BrandSummary = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string | null;
  logo_url: string | null;
  is_active: boolean;
};

export type Profile = {
  id: string;
  email: string;
  name: string | null;
  phone?: string | null;
  role: UserRole;
  status: UserStatus;
  brand_id: string | null;
  brand?: BrandSummary | null;
  permissions?: string[] | null;
  must_change_password?: boolean | null;
  /** Null until the owner proves they own the email (the instant trial only); see owner-email.ts. */
  email_verified_at?: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileContextType = {
  profile: Profile | null;
  isLoading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isBrandAdmin: boolean;
  isCourier: boolean;
  isActive: boolean;
  profileError: boolean;
  canViewFinancials: boolean;
  hasPermission: (permission: string) => boolean;
  refreshProfile: () => Promise<void>;
  signOutAndRedirect: () => Promise<void>;
};

const ProfileContext = createContext<ProfileContextType | null>(null);

// SECURITY: there is intentionally no "fallback" profile anymore. A user
// without a resolvable profile row gets `profile = null`, which the rest of
// this context (and AppShell) treats as "no access" rather than "admin".
// Failing open here previously meant any hiccup in profile creation silently
// granted platform-wide admin rights.

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const mountedRef = useRef(false);
  // Whose profile is held or being read, and the read in flight: the first load and the
  // `INITIAL_SESSION` event share one request.
  const knownUserRef = useRef<string | null>(null);
  const inflightRef = useRef<{ userId: string; read: Promise<Profile | null> } | null>(null);
  const navigate = useNavigate();

  // Admin identities must be provisioned explicitly by an authorized admin.
  // Storefront customers share the Supabase Auth project, so auto-creating a
  // dashboard profile here would incorrectly turn any customer who visits an
  // /admin URL into an active staff identity.
  const ensureProfile = useCallback(
    async (userId: string, email: string): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, brand:brands(id, slug, name_en, name_ar, logo_url, is_active)")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error("[ProfileContext] Error fetching profile:", error);
        if (mountedRef.current) setProfileError(true);
        return null;
      }

      if (data) {
        return data as Profile;
      }

      console.warn(
        `[ProfileContext] Authenticated account ${email || userId} has no dashboard profile`,
      );
      if (mountedRef.current) setProfileError(true);
      return null;
    },
    [],
  );

  const fetchProfile = useCallback(
    async (userId: string): Promise<Profile | null> => {
      const { data: authData } = await supabase.auth.getUser();
      const email = authData.user?.email || "";
      return ensureProfile(userId, email);
    },
    [ensureProfile],
  );

  const loadProfileFor = useCallback(
    (userId: string, email: string): Promise<Profile | null> => {
      if (inflightRef.current?.userId === userId) return inflightRef.current.read;
      knownUserRef.current = userId;
      const read = ensureProfile(userId, email).finally(() => {
        if (inflightRef.current?.read === read) inflightRef.current = null;
      });
      inflightRef.current = { userId, read };
      return read;
    },
    [ensureProfile],
  );

  const signOutAndRedirect = useCallback(async () => {
    await signOut();
    navigate({ to: "/auth" });
  }, [navigate]);

  const refreshProfile = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setProfile(null);
      return;
    }
    const p = await fetchProfile(user.id);
    setProfile((held) => keepIfSame(held, p));
  }, [fetchProfile]);

  useEffect(() => {
    let mounted = true;
    mountedRef.current = true;

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!user) {
        setIsLoading(false);
        return;
      }

      const p = await loadProfileFor(user.id, user.email || "");
      if (!mounted) return;
      if (knownUserRef.current === user.id) setProfile((held) => keepIfSame(held, p));
      setIsLoading(false);
    };

    init();

    // Listen for auth state changes (deferred via setTimeout to ensure state updates execute post-mount)
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      window.setTimeout(() => {
        if (!mounted) return;
        (async () => {
          const action = profileAuthAction(event, session?.user.id, knownUserRef.current);
          if (action === "keep") return;
          if (action === "clear" || !session) {
            knownUserRef.current = null;
            setProfile(null);
            return;
          }
          const p = await loadProfileFor(session.user.id, session.user.email || "");
          // A read for someone who has since signed out or changed is dropped.
          if (mounted && knownUserRef.current === session.user.id) {
            setProfile((held) => keepIfSame(held, p));
          }
        })();
      }, 0);
    });

    return () => {
      mounted = false;
      mountedRef.current = false;
      sub.subscription.unsubscribe();
    };
  }, [fetchProfile, loadProfileFor]);

  // Defensive: the fixed super admin is always treated as such client-side too.
  const emailIsSuperAdmin = profile?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
  // SECURITY: all of these now require a resolved profile row with status
  // "active". A null profile (couldn't be found or created) grants nothing.
  const isActive = profile?.status === "active";
  const isSuperAdmin = isActive && (profile?.role === "super_admin" || emailIsSuperAdmin);
  const isBrandAdmin = isActive && profile?.role === "brand_admin";
  const isCourier = isActive && profile?.role === "courier";
  const isAdmin = isActive && (profile?.role === "admin" || isBrandAdmin || isSuperAdmin);

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!isActive) return false;
      if (
        profile?.role === "admin" ||
        profile?.role === "brand_admin" ||
        profile?.role === "super_admin" ||
        emailIsSuperAdmin
      ) {
        return true; // Admins automatically possess all permissions.
      }
      const permissions = (profile?.permissions as string[]) || [];
      return permissions.includes(permission);
    },
    [isActive, profile, emailIsSuperAdmin],
  );

  // Only authorized roles or users with explicit financials permission can view financial data
  const canViewFinancials = isActive && (isAdmin || hasPermission("view_financials"));

  const value = useMemo(
    () => ({
      profile,
      isLoading,
      isAdmin,
      isSuperAdmin,
      isBrandAdmin,
      isCourier,
      isActive,
      profileError,
      canViewFinancials,
      hasPermission,
      refreshProfile,
      signOutAndRedirect,
    }),
    [
      profile,
      isLoading,
      isAdmin,
      isSuperAdmin,
      isBrandAdmin,
      isCourier,
      isActive,
      profileError,
      canViewFinancials,
      hasPermission,
      refreshProfile,
      signOutAndRedirect,
    ],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

/**
 * The profile when there is one (a part that also renders outside the admin's provider, such as
 * an order's documents in a preview, reads null and leaves out what needs the signed-in person).
 */
export function useProfileOptional() {
  return useContext(ProfileContext);
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }
  return ctx;
}
