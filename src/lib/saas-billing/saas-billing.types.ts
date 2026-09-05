// ==============================================================================
// BOUTQ OS: SAAS BILLING, PLANS, ENTITLEMENTS & USAGE TYPES
// ==============================================================================

export type SaaSPlanCode =
  | "starter"
  | "growth"
  | "pro"
  | "enterprise"
  | "trial"
  | "lifetime_founder"
  | (string & {});

export type BillingIntervalMode = "both" | "monthly_only" | "annual_only";

export type SaaSPlan = {
  id: string;
  code: SaaSPlanCode;
  name_en: string;
  name_ar: string;
  description_en: string | null;
  description_ar: string | null;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;
  trial_days: number;
  badge_color: string | null;
  billing_interval_mode?: BillingIntervalMode;
  created_at: string;
  updated_at: string;
};

export type SaaSPlanVersion = {
  id: string;
  plan_id: string;
  version_number: number;
  currency: string;
  price_monthly: number;
  price_annual: number;
  effective_from: string;
  effective_until: string | null;
  is_current: boolean;
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
};

export type FeatureCategory =
  | "catalog_sales"
  | "operations"
  | "marketing_loyalty"
  | "developer_api"
  | "infrastructure"
  | "finance"
  | "storefront";

export type FeatureValueType = "boolean" | "numeric_limit";

export type SaaSFeatureKey =
  | "products.limit"
  | "orders.monthly_limit"
  | "team.members_limit"
  | "storage.bytes_limit"
  | "returns.enabled"
  | "returns.monthly_limit"
  | "loyalty.enabled"
  | "abandoned_carts.enabled"
  | "abandoned_carts.monthly_messages"
  | "api.enabled"
  | "api.keys_limit"
  | "api.monthly_requests"
  | "webhooks.enabled"
  | "webhooks.endpoints_limit"
  | "custom_domain.enabled"
  | "white_label.enabled"
  | "mobile_factory.enabled"
  | "accounting.enabled"
  | "incubators.enabled"
  | "import_center.enabled"
  | (string & {});

export type SaaSFeature = {
  key: SaaSFeatureKey;
  name_en: string;
  name_ar: string;
  category: FeatureCategory;
  value_type: FeatureValueType;
  unit: string | null;
  description_en: string | null;
  description_ar: string | null;
  sort_order: number;
  created_at: string;
};

export type SaaSPlanFeature = {
  id: string;
  plan_version_id: string;
  feature_key: SaaSFeatureKey;
  boolean_value: boolean | null;
  numeric_value: number | null; // -1 = unlimited, >=0 = limit
  created_at: string;
};

export type SaaSAddon = {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  description_en: string | null;
  description_ar: string | null;
  currency: string;
  price_monthly: number;
  price_annual: number;
  is_active: boolean;
  target_feature_key: SaaSFeatureKey;
  grant_type: "boolean_unlock" | "numeric_increment";
  grant_numeric_amount: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "grace_period"
  | "paused"
  | "cancelled"
  | "expired";

export type BillingInterval = "monthly" | "annual" | "lifetime" | "trial";

export type BrandSubscription = {
  id: string;
  brand_id: string;
  plan_id: string;
  plan_version_id: string;
  billing_interval: BillingInterval;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  trial_ends_at: string | null;
  grace_period_ends_at: string | null;
  cancelled_at: string | null;
  cancel_at_period_end: boolean;
  paused_at: string | null;
  renewal_intent: "renew" | "cancel" | "upgrade" | "downgrade" | null;
  renewal_target_plan_id: string | null;
  created_at: string;
  updated_at: string;
};

export type BrandSubscriptionAddon = {
  id: string;
  brand_id: string;
  subscription_id: string;
  addon_id: string;
  quantity: number;
  status: "active" | "cancelled";
  created_at: string;
  updated_at: string;
};

export type BrandEntitlementOverride = {
  id: string;
  brand_id: string;
  feature_key: SaaSFeatureKey;
  override_type: "set_boolean" | "set_limit" | "increment_limit";
  boolean_value: boolean | null;
  numeric_value: number | null;
  reason: string;
  created_by: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SaaSUsageSnapshot = {
  id: string;
  brand_id: string;
  metric_key: string;
  period_start: string;
  period_end: string;
  current_usage: number;
  last_consumed_at: string;
  warning_80_sent_at: string | null;
  limit_100_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SaaSAuditLog = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: "plan" | "version" | "brand" | "override" | "addon" | "subscription";
  target_id: string;
  brand_id: string | null;
  changes: Record<string, any>;
  created_at: string;
};

export type EffectiveEntitlement = {
  enabled: boolean;
  limit_value: number; // -1 = unlimited
  is_unlimited: boolean;
  source: "lifetime_founder" | "plan_version" | "addon" | "override";
};

export type EntitlementEvaluationMap = Record<SaaSFeatureKey, EffectiveEntitlement>;

export type EntitlementCheckResult = {
  allowed: boolean;
  reason?: "feature_disabled" | "limit_reached" | "subscription_inactive" | "brand_not_found";
  feature_key: SaaSFeatureKey;
  limit_value: number;
  is_unlimited: boolean;
  current_usage?: number;
  remaining?: number;
  source?: string;
};

export type ConsumeUsageResult = {
  success: boolean;
  current_usage: number;
  metric_key: string;
  warning_triggered: "warning_80_reached" | "limit_100_reached" | null;
  idempotent_replay?: boolean;
};

export type PlanOverview = {
  plan: SaaSPlan;
  currentVersion: SaaSPlanVersion;
  features: Array<{
    feature: SaaSFeature;
    boolean_value: boolean | null;
    numeric_value: number | null;
  }>;
  subscribersCount: number;
};
