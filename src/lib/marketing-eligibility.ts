export type MarketingEligibility = {
  eligible: boolean;
  reason?: string;
  reason_ar?: string;
};

export type MarketingCandidate = {
  id?: string;
  phone?: string | null;
  marketing_consent?: boolean | null;
  opted_out_at?: string | null;
  [key: string]: any;
};

/**
 * Reusable eligibility validator for marketing campaigns.
 * Enforces explicit consent, non-opted-out status, valid phone number, and prior purchase history.
 */
export function isMarketingEligible(
  customer: MarketingCandidate,
  totalOrders: number = 0,
): MarketingEligibility {
  if (!customer.phone || !customer.phone.trim()) {
    return {
      eligible: false,
      reason: "No phone number on file",
      reason_ar: "لا يوجد رقم هاتف مسجل",
    };
  }

  const rawPhone = customer.phone.replace(/[^\d]/g, "");
  if (!rawPhone || rawPhone.length < 7) {
    return {
      eligible: false,
      reason: "Invalid phone number",
      reason_ar: "رقم الهاتف غير صالح",
    };
  }

  if (customer.opted_out_at) {
    return {
      eligible: false,
      reason: "Customer opted out of marketing",
      reason_ar: "العميل قام بإلغاء الاشتراك التسويقي",
    };
  }

  if (customer.marketing_consent !== true) {
    return {
      eligible: false,
      reason: "No explicit marketing consent",
      reason_ar: "لا توجد موافقة تسويقية صريحة",
    };
  }

  if (totalOrders <= 0) {
    return {
      eligible: false,
      reason: "Customer has no prior orders",
      reason_ar: "العميل ليس لديه أي طلبات سابقة",
    };
  }

  return { eligible: true };
}

export function filterMarketingEligibleCustomers<T extends MarketingCandidate>(
  customers: T[],
  crmStats?: Map<string, { totalOrders?: number }>,
): T[] {
  return customers.filter((c) => {
    const orders = c.id && crmStats ? (crmStats.get(c.id)?.totalOrders ?? 0) : 0;
    return isMarketingEligible(c, orders).eligible;
  });
}
