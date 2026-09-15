import type { AddonId, PlatformAddonPolicy } from "./addon-types";
import type { StoreVertical } from "@/lib/store-profile";

export function starterPackFor(
  activity: StoreVertical,
  policies?: PlatformAddonPolicy[] | null,
): {
  required: AddonId[];
  suggested: AddonId[];
} {
  // If policies are provided, allow platform_addon_policies to configure/override starter pack defaults
  if (policies && policies.length > 0) {
    const policyRequired: AddonId[] = [];
    for (const policy of policies) {
      if (
        policy.default_for_activities &&
        Array.isArray(policy.default_for_activities) &&
        (policy.default_for_activities as string[]).includes(activity)
      ) {
        policyRequired.push(policy.addon_id);
      }
    }

    if (policyRequired.length > 0) {
      return {
        required: policyRequired,
        suggested: [],
      };
    }
  }

  // Fallback to static starter pack mapping for each vertical
  switch (activity) {
    case "abayas":
      return {
        required: ["fashion-core", "size-guides", "fit-passport", "made-to-order", "abaya-pack"],
        suggested: [],
      };
    case "fashion":
      return {
        required: ["fashion-core", "size-guides", "fit-passport", "made-to-order"],
        suggested: [],
      };
    case "beauty":
      return {
        required: ["beauty-perfume"],
        suggested: [],
      };
    case "food":
      return {
        required: ["food-beverage"],
        suggested: ["made-to-order"],
      };
    case "digital":
      return {
        required: ["digital-products"],
        suggested: [],
      };
    case "gifts":
      return {
        required: ["gifts"],
        suggested: [],
      };
    case "print":
      return {
        required: ["made-to-order", "print-stamps"],
        suggested: [],
      };
    case "jewelry":
      return {
        required: ["size-guides", "made-to-order", "jewelry"],
        suggested: [],
      };
    case "home":
    case "electronics":
    case "general":
    default:
      return {
        required: [],
        suggested: [],
      };
  }
}
