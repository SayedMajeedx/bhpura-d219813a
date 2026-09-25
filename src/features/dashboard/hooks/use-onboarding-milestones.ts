import { useState } from "react";
import { toast } from "sonner";
import { getStorefrontUrl } from "@/lib/storefront-url";
import type { useBrand } from "@/lib/brand-context";

/**
 * The launch checklist's manual steps (store previewed or shared, first sale
 * recorded) and whether it is dismissed, kept per brand in localStorage.
 */
export function useOnboardingMilestones({
  brand,
  brandId,
  isAr,
}: {
  brand: ReturnType<typeof useBrand>;
  brandId: string;
  isAr: boolean;
}) {
  // Guided Onboarding Milestones State (Per-brand persistent tracking)
  const [isPreviewed, setIsPreviewed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(`boutq_onboarding_previewed_${brandId}`) === "true";
    } catch {
      return false;
    }
  });

  const [isManualSaleCompleted, setIsManualSaleCompleted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(`boutq_onboarding_sale_done_${brandId}`) === "true";
    } catch {
      return false;
    }
  });

  const [isOnboardingDismissed, setIsOnboardingDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(`boutq_onboarding_dismissed_${brandId}`) === "true";
    } catch {
      return false;
    }
  });

  const handleCopyStoreLink = async () => {
    const url = getStorefrontUrl(brand);
    try {
      await navigator.clipboard.writeText(url);
      if (!isPreviewed) {
        setIsPreviewed(true);
        try {
          localStorage.setItem(`boutq_onboarding_previewed_${brandId}`, "true");
        } catch {
          // localStorage can be unavailable (private mode, quota) — onboarding state just won't persist.
        }
      }
      toast.success(
        isAr
          ? "تم نسخ رابط المتجر بنجاح واكتمال خطوة المعاينة والمشاركة!"
          : "Store link copied! Sharing milestone completed.",
      );
    } catch {
      toast.error(isAr ? "تعذر نسخ الرابط" : "Failed to copy link");
    }
  };

  const handlePreviewStorefront = () => {
    if (!isPreviewed) {
      setIsPreviewed(true);
      try {
        localStorage.setItem(`boutq_onboarding_previewed_${brandId}`, "true");
      } catch {
        // localStorage can be unavailable (private mode, quota) — onboarding state just won't persist.
      }
    }
    toast.success(
      isAr
        ? "تم تسجيل معاينة المتجر واكتمال الخطوة بنجاح!"
        : "Storefront previewed! Milestone marked as completed.",
    );
  };

  const togglePreviewMilestone = (completed: boolean) => {
    setIsPreviewed(completed);
    try {
      localStorage.setItem(`boutq_onboarding_previewed_${brandId}`, String(completed));
    } catch {
      // localStorage can be unavailable (private mode, quota) — onboarding state just won't persist.
    }
    toast.success(
      completed
        ? isAr
          ? "تم تحديد معاينة المتجر كمكتملة!"
          : "Storefront preview marked as complete!"
        : isAr
          ? "تم التراجع عن إكمال الخطوة"
          : "Milestone marked as incomplete",
    );
  };

  const toggleSaleMilestone = (completed: boolean) => {
    setIsManualSaleCompleted(completed);
    try {
      localStorage.setItem(`boutq_onboarding_sale_done_${brandId}`, String(completed));
    } catch {
      // localStorage can be unavailable (private mode, quota) — onboarding state just won't persist.
    }
    toast.success(
      completed
        ? isAr
          ? "تم تحديد تسجيل أول عملية بيع كمكتملة!"
          : "First sale milestone marked as complete!"
        : isAr
          ? "تم التراجع عن إكمال الخطوة"
          : "Milestone marked as incomplete",
    );
  };

  const handleDismissOnboarding = () => {
    setIsOnboardingDismissed(true);
    try {
      localStorage.setItem(`boutq_onboarding_dismissed_${brandId}`, "true");
    } catch {
      // localStorage can be unavailable (private mode, quota) — onboarding state just won't persist.
    }
    toast.success(isAr ? "تم إخفاء لوحة الإطلاق بنجاح" : "Onboarding checklist dismissed");
  };

  const handleRestoreOnboarding = () => {
    setIsOnboardingDismissed(false);
    try {
      localStorage.removeItem(`boutq_onboarding_dismissed_${brandId}`);
    } catch {
      // localStorage can be unavailable (private mode, quota) — onboarding state just won't persist.
    }
  };

  return {
    isPreviewed,
    isManualSaleCompleted,
    isOnboardingDismissed,
    handleCopyStoreLink,
    handlePreviewStorefront,
    togglePreviewMilestone,
    toggleSaleMilestone,
    handleDismissOnboarding,
    handleRestoreOnboarding,
  };
}
