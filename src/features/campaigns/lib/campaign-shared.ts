/** The customer segments a campaign can start from (the page's `segment` search parameter). */
export type CampaignSegment = "All" | "VIP" | "Churn Risk" | "New Buyer";

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  marketing_consent?: boolean | null;
  opted_out_at?: string | null;
};
export type BulkStatus = "queued" | "sending" | "sent" | "skipped";

export function isMobileBrowser() {
  return (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    window.matchMedia?.("(pointer: coarse)").matches === true
  );
}

export const CHANNEL = "whatsapp";
export const DEFAULT_EN =
  "Hi {{customer_name}}, this is {{business_name}}. We have exciting news for you!";
export const DEFAULT_AR = "مرحبًا {{customer_name}}، معكم {{business_name}}. لدينا عرض مميز لك!";
