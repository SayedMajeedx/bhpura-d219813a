/**
 * The services a store can save credentials for on the Integrations page. Only what the
 * platform really calls is offered: Aramex, Posta Plus and Stripe were offered and saved, and
 * nothing ever used them (no shipment, label or charge), so a merchant who "connected" a courier
 * waited for labels that never came. They are hidden, with any row already saved; the rows stay
 * in the database for when a real integration is built.
 */
export const PROVIDER_PRESETS = [
  { value: "tap", label: "Tap Payments" },
  { value: "benefit", label: "Benefit Pay" },
  { value: "gemini", label: "Gemini AI translation & copywriting" },
  { value: "resend_customer_email", label: "Resend Customer Email" },
  { value: "sendpulse_admin", label: "SendPulse Admin Notifications" },
  { value: "custom", label: "Custom" },
] as const;

/** Saved before they were hidden; not shown and not offered. */
export const HIDDEN_PROVIDERS: ReadonlySet<string> = new Set(["aramex", "posta_plus", "stripe"]);

export function shownIntegration(row: { provider: string }): boolean {
  return !HIDDEN_PROVIDERS.has(row.provider);
}

export const PAYMENT_PROVIDERS: ReadonlySet<string> = new Set(["tap", "benefit"]);
export const EMAIL_AI_PROVIDERS: ReadonlySet<string> = new Set([
  "resend_customer_email",
  "sendpulse_admin",
  "gemini",
]);
