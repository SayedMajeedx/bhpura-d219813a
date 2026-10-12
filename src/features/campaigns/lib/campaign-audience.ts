import { isMarketingEligible } from "@/lib/marketing-eligibility";
import type { CampaignSegment, Customer } from "@/features/campaigns/lib/campaign-shared";

/**
 * Who a campaign reaches and what each of them is sent. Pure: the page's hook holds the state and
 * asks these.
 */

/** What the rules read of a customer's history (`buildCustomerCrmStats`). */
type CrmStats = ReadonlyMap<string, { badge?: string | null; totalOrders?: number }>;

/** The customers of a segment whose name or phone holds the search text. */
export function filterAudience<T extends Customer>(
  customers: readonly T[],
  stats: CrmStats,
  view: { search: string; segment: CampaignSegment },
): T[] {
  const q = view.search.trim().toLowerCase();

  const segmentFiltered = customers.filter((c) => {
    if (view.segment === "All") return true;
    const badge = stats.get(c.id)?.badge ?? null;
    return badge === view.segment;
  });

  if (!q) return segmentFiltered;
  return segmentFiltered.filter(
    (c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q),
  );
}

/** How many customers each segment holds. */
export function segmentCountsOf(
  customers: readonly Customer[],
  stats: CrmStats,
): Record<CampaignSegment, number> {
  let vip = 0;
  let churn = 0;
  let newBuyer = 0;

  customers.forEach((c) => {
    const badge = stats.get(c.id)?.badge;
    if (badge === "VIP") vip++;
    else if (badge === "Churn Risk") churn++;
    else if (badge === "New Buyer") newBuyer++;
  });

  return {
    All: customers.length,
    VIP: vip,
    "Churn Risk": churn,
    "New Buyer": newBuyer,
  };
}

/** Whether a customer may be sent marketing, with the reason when not. */
export function eligibilityOf(customer: Customer, stats: CrmStats) {
  return isMarketingEligible(customer, stats.get(customer.id)?.totalOrders ?? 0);
}

/** The customers who may be sent marketing. */
export function eligibleAmong<T extends Customer>(customers: readonly T[], stats: CrmStats): T[] {
  return customers.filter((c) => eligibilityOf(c, stats).eligible);
}

/** The ticked customers who may be sent marketing: the ones a bulk run or an export takes. */
export function selectedRecipients<T extends Customer>(
  customers: readonly T[],
  selectedIds: readonly string[],
  stats: CrmStats,
): T[] {
  return customers.filter((c) => selectedIds.includes(c.id) && eligibilityOf(c, stats).eligible);
}

/** The message as one customer reads it: the placeholders filled in. */
export function campaignMessage(template: string, customerName: string, businessName: string) {
  return template
    .replace(/\{\{customer_name\}\}/g, customerName || "")
    .replace(/\{\{business_name\}\}/g, businessName || "");
}

/** A customer's phone as WhatsApp takes it: digits only. */
export function whatsappDigits(phone: string | null | undefined): string {
  return phone?.replace(/[^\d]/g, "") || "";
}

/** The link that opens a customer's WhatsApp chat with the message typed; null with no phone. */
export function whatsappChatUrl(customer: Customer, text: string): string | null {
  const phone = whatsappDigits(customer.phone);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/**
 * The recipients as a file for a bulk-sender tool: phone, name and the message each one gets.
 * It starts with a byte order mark so Excel reads the Arabic.
 */
export function campaignCsv(
  recipients: readonly Customer[],
  messageFor: (customerName: string) => string,
): string {
  const headers = ["Phone", "Name", "Message"];
  const rows = recipients.map((c) => {
    const phone = whatsappDigits(c.phone);
    const name = c.name || "";
    const msg = messageFor(name).replace(/"/g, '""');
    return `"${phone}","${name}","${msg}"`;
  });
  return "﻿" + [headers.join(","), ...rows].join("\n");
}
