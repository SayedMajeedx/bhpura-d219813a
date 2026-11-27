-- Two platform tables a visitor did not need to read whole (the final status report of 2026-11-27).
--
-- 1. system_settings: merchants and the onboarding page read how to pay Boutq (prices, the
--    BenefitPay QR, the account name, the IBAN) and the billing intervals; the impersonation
--    policy (superadmin_impersonation_mutation_allowed) is read only by the server, with the
--    service role. A table-level REVOKE also takes every column grant away (the outage of
--    2026-11-21), so the columns the browser reads are granted again here, in the same file.
REVOKE SELECT ON public.system_settings FROM anon, authenticated;
GRANT SELECT (
  id,
  base_price_bhd,
  discount_price_bhd,
  platform_icon_url,
  benefit_pay_qr_url,
  merchant_account_name,
  whatsapp_support_number,
  subscription_iban,
  billing_interval_mode,
  updated_at
) ON public.system_settings TO anon, authenticated;

-- 2. platform_addon_policies: which stores may install a private add-on is read by signed-in
--    staff and the super admin (install, the add-ons page, a vertical change), never by a
--    visitor. Its visitor policy goes and the anonymous role loses the read.
DROP POLICY IF EXISTS "Public can view platform addon policies" ON public.platform_addon_policies;
REVOKE SELECT ON public.platform_addon_policies FROM anon;
