import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAddons } from "@/components/addons/AddonsProvider";
import { readinessChecksFrom } from "@/lib/addons/addon-registry";
import { businessSettingsQueries } from "@/lib/data/business-settings";
import { brandQueries } from "@/lib/data/brands";
import { returnsQueries, type ReturnPolicyRow } from "@/lib/data/returns";
import { catalogInsightQueries } from "@/lib/data/catalog";
import { ordersQueries } from "@/lib/data/orders";
import { bookingPoliciesQueries } from "@/lib/data/booking-policies";
import { storeContentQueries } from "@/lib/data/store-content";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { isServicesProfile } from "@/lib/store-profile";
import { getStorefrontUrl } from "@/lib/storefront-url";
import {
  evaluateStoreReadiness,
  type BusinessSettingsData,
} from "@/features/launch/lib/setup-steps";
import { goLiveSteps, type LaunchStep } from "@/features/launch/lib/launch-steps";
import { useLaunchMilestones } from "@/features/launch/hooks/use-launch-milestones";

/** Whether the policy has written terms in either language (counts as a policy page). */
const hasPolicyTerms = (policy: ReturnPolicyRow | null) =>
  Boolean(policy?.policy_terms_ar || policy?.policy_terms_en);

/**
 * The store's one launch checklist, as the dashboard and the Settings page both draw it: the
 * setup steps, the installed add-ons' own checks, then the two steps that take the store live.
 * `enabled` false reads nothing (a dashboard whose card was dismissed, or a store launched).
 */
export function useLaunchChecklist({
  brandId,
  slug,
  lang,
  enabled = true,
  dashboard = false,
  logoUrl,
  brandPalette,
  storeVertical,
}: {
  brandId: string;
  slug: string;
  lang: "ar" | "en";
  enabled?: boolean;
  /**
   * The dashboard's card: it reads nothing once dismissed, or once the store finished every step
   * (remembered on this device), so a launched store's dashboard reads only what it shows.
   */
  dashboard?: boolean;
  /** The Settings form's values while they are being edited, ahead of the saved ones. */
  logoUrl?: string | null;
  brandPalette?: unknown;
  storeVertical?: string | null;
}) {
  const isAr = lang === "ar";
  const [launched, setLaunched] = React.useState(() => readLaunched(brandId));
  const milestones = useLaunchMilestones({
    storefrontUrl: getStorefrontUrl(slug),
    brandId,
    isAr,
  });
  const resting = dashboard && (milestones.isOnboardingDismissed || launched);
  const on = enabled && Boolean(brandId) && !resting;
  const productsQ = useQuery({ ...catalogInsightQueries.activeCount(brandId), enabled: on });
  const businessSettingsQ = useQuery({ ...businessSettingsQueries.detail(brandId), enabled: on });
  const returnPolicyQ = useQuery({
    ...returnsQueries.policy(brandId),
    select: hasPolicyTerms,
    enabled: on,
  });
  const brandQ = useQuery({ ...brandQueries.profile(brandId), enabled: on });
  const ordersQ = useQuery({ ...ordersQueries.count(brandId), enabled: on });

  const { profile } = useAdminStoreProfile(brandId);
  const services = isServicesProfile(profile.modules);
  const servicesOn = on && services;
  const bookingPolicyQ = useQuery({
    ...bookingPoliciesQueries.policy(brandId),
    enabled: servicesOn,
  });
  const faqQ = useQuery({ ...storeContentQueries.faq(brandId), enabled: servicesOn });
  const withoutPhotoQ = useQuery({
    ...catalogInsightQueries.withoutPhoto(brandId),
    enabled: servicesOn,
  });

  const { addons } = useAddons();
  const addonChecks = React.useMemo(() => readinessChecksFrom(addons), [addons]);
  const addonChecksQ = useQuery({
    queryKey: [
      "readiness-addon-checks",
      brandId,
      addons
        .map((a) => a.addon_id)
        .sort()
        .join(","),
    ],
    enabled: on && addonChecks.length > 0,
    queryFn: async () => {
      const results: Record<string, "ok" | "warn" | "missing"> = {};
      for (const check of addonChecks) {
        try {
          results[check.id] = await check.evaluate({ brandId, db: supabase });
        } catch (e) {
          console.error(`Error running readiness check ${check.id}:`, e);
          results[check.id] = "warn";
        }
      }
      return results;
    },
  });

  const storefrontUrl = getStorefrontUrl(brandQ.data ?? slug);

  const settings = businessSettingsQ.data;
  const setup = evaluateStoreReadiness({
    logoUrl,
    activeProductsCount: productsQ.data ?? 0,
    businessSettings: settings as BusinessSettingsData | undefined,
    brandLogoUrl: brandQ.data?.logo_url,
    brandPalette: brandPalette ?? settings?.brand_palette,
    storeVertical: storeVertical ?? settings?.store_vertical,
    lang,
    hasReturnPolicy: Boolean(returnPolicyQ.data),
    services,
    servicesFacts: services
      ? {
          whatsappNumber: settings?.whatsapp_number,
          phone: settings?.phone,
          policy: bookingPolicyQ.data ?? null,
          faqCount: faqQ.data?.length ?? 0,
          withoutPhoto: withoutPhotoQ.data ?? 0,
        }
      : undefined,
  });

  const setupSteps: LaunchStep[] = setup.items.map((item) => {
    if (item.id === "products") return { ...item, page: "inventory" };
    if (item.id === "policies") return { ...item, page: "pages" };
    return item;
  });
  const addonSteps: LaunchStep[] = addonChecks.map((check) => ({
    id: `addon_${check.id}`,
    icon: Sparkles,
    title: isAr ? check.label.ar : check.label.en,
    description: isAr ? check.description.ar : check.description.en,
    isComplete: (addonChecksQ.data?.[check.id] ?? "warn") === "ok",
    actionType: "link",
    href: check.actionTo ? check.actionTo.replace("$slug", slug) : undefined,
    actionLabel: isAr ? "إكمال الإعداد" : "Complete Setup",
    editLabel: isAr ? "تعديل" : "Edit",
  }));
  const steps: LaunchStep[] = [
    ...setupSteps,
    ...addonSteps,
    ...goLiveSteps({
      lang,
      services: profile.modules.bookings,
      previewed: milestones.isPreviewed,
      saleMarked: milestones.isManualSaleCompleted,
      orders: ordersQ.data ?? 0,
      storefrontUrl,
    }),
  ].map((step) =>
    step.page && !step.href ? { ...step, href: `/admin/b/${slug}/${step.page}` } : step,
  );

  const completed = steps.filter((step) => step.isComplete).length;
  // Waits for what it counts, so a card does not open and fold as the reads arrive.
  const ready =
    on &&
    !productsQ.isPending &&
    !businessSettingsQ.isPending &&
    !ordersQ.isPending &&
    !brandQ.isPending;

  const allDone = ready && completed === steps.length;
  React.useEffect(() => {
    if (!dashboard || !allDone) return;
    try {
      localStorage.setItem(launchedKey(brandId), "true");
    } catch {
      // storage unavailable: the card simply reads again next time
    }
    setLaunched(true);
  }, [dashboard, allDone, brandId]);

  return {
    steps,
    completed,
    total: steps.length,
    ready,
    milestones,
    storefrontUrl,
    /** The dashboard's card rests: dismissed, or every step done on an earlier visit. */
    resting,
  };
}

const launchedKey = (brandId: string) => `boutq_launch_done_${brandId}`;

function readLaunched(brandId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(launchedKey(brandId)) === "true";
  } catch {
    return false;
  }
}

export type LaunchChecklist = ReturnType<typeof useLaunchChecklist>;
