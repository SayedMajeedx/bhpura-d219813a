import type { AddonId, PlatformAddonPolicy } from "./addon-types";
import type { StoreVertical } from "@/lib/store-profile";
import { getVerticalDefinition } from "@/lib/verticals/registry";

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

  // Otherwise the vertical's own pack (see the vertical registry).
  const { required, suggested } = getVerticalDefinition(activity).starterPack;
  return { required: [...required], suggested: [...suggested] };
}
