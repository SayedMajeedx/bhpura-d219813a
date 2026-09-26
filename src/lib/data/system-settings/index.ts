import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * The platform's own settings row (`system_settings`, id 1) as the browser
 * reads it: how merchants pay Boutq (price, BenefitPay QR, account name,
 * IBAN) and which billing intervals the plans offer. Writes go through the
 * super admin's server functions.
 */

export const systemSettingsKeys = {
  all: () => ["system-settings"] as const,
  billingDetails: () => [...systemSettingsKeys.all(), "billing-details"] as const,
  billingIntervalMode: () => [...systemSettingsKeys.all(), "billing-interval-mode"] as const,
  mobileAppReleases: () => [...systemSettingsKeys.all(), "mobile-app-releases"] as const,
};

/** The published builds of Boutq's own mobile apps, newest first. */
export async function fetchMobileAppReleases() {
  const { data, error } = await supabase
    .from("mobile_app_releases_public")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * How merchants pay the subscription, or null when unreadable: screens show
 * their defaults then.
 */
export async function fetchBillingDetails() {
  const { data } = await supabase
    .from("system_settings")
    .select(
      "base_price_bhd, discount_price_bhd, benefit_pay_qr_url, merchant_account_name, subscription_iban",
    )
    .eq("id", 1)
    .maybeSingle();
  return data;
}

/** Which billing intervals the plans offer, or null when unreadable. */
export async function fetchBillingIntervalMode() {
  const { data } = await supabase
    .from("system_settings")
    .select("billing_interval_mode")
    .eq("id", 1)
    .maybeSingle();
  return data;
}

export const systemSettingsQueries = {
  mobileAppReleases: () =>
    queryOptions({
      queryKey: systemSettingsKeys.mobileAppReleases(),
      queryFn: fetchMobileAppReleases,
      staleTime: 60_000,
    }),
  billingDetails: () =>
    queryOptions({ queryKey: systemSettingsKeys.billingDetails(), queryFn: fetchBillingDetails }),
  billingIntervalMode: () =>
    queryOptions({
      queryKey: systemSettingsKeys.billingIntervalMode(),
      queryFn: fetchBillingIntervalMode,
    }),
};
