import { countOf } from "@/lib/arabic-count";
import type { StoreRow, StoreView } from "./stores";
import { storeName } from "./stores";

/**
 * What needs the super admin today, in one list, the most pressing first: receipts to check,
 * store requests, new responses on a platform page, services that failed or went silent,
 * subscriptions that ended or end soon, stores asking to change plan, and stores with no order
 * for 30 days. Each line says how many and where to act; a line with nothing is left out.
 */

export type NeedsYouTarget =
  | { kind: "receipts" }
  | { kind: "requests" }
  | { kind: "responses"; pageId: string }
  | { kind: "health" }
  | { kind: "stores"; view: StoreView };

export type NeedsYouLine = {
  key: string;
  tone: "urgent" | "warning" | "info";
  title: string;
  detail: string | null;
  target: NeedsYouTarget;
};

export type NeedsYouInput = {
  rows: readonly StoreRow[];
  tenantRequests: number;
  newResponses: ReadonlyArray<{ pageId: string; slug: string; count: number }>;
  /** Runs that went wrong in the last 24 hours, and services whose newest record is too old. */
  health: { failed: number; silent: number } | null;
};

const names = (rows: readonly StoreRow[], lang: "ar" | "en") => {
  const shown = rows.slice(0, 3).map((row) => storeName(row.store, lang));
  const more = rows.length - shown.length;
  const list = shown.join(lang === "ar" ? "، " : ", ");
  if (more <= 0) return list;
  return lang === "ar" ? `${list} و${more} غيرها` : `${list} and ${more} more`;
};

export function needsYou(input: NeedsYouInput, lang: "ar" | "en"): NeedsYouLine[] {
  const ar = lang === "ar";
  const lines: NeedsYouLine[] = [];
  const { rows } = input;

  const receipts = rows.filter((row) => row.state === "pending");
  if (receipts.length) {
    lines.push({
      key: "receipts",
      tone: "urgent",
      title: ar
        ? `إيصالات اشتراك للمراجعة: ${countOf(receipts.length, "store", lang)}`
        : `Subscription receipts to check: ${countOf(receipts.length, "store", lang)}`,
      detail: names(receipts, lang),
      target: { kind: "receipts" },
    });
  }

  if (input.tenantRequests > 0) {
    lines.push({
      key: "requests",
      tone: "urgent",
      title: ar
        ? `طلبات فتح متجر جديدة: ${input.tenantRequests}`
        : `New store requests: ${input.tenantRequests}`,
      detail: null,
      target: { kind: "requests" },
    });
  }

  for (const page of input.newResponses) {
    lines.push({
      key: `responses-${page.pageId}`,
      tone: "warning",
      title: ar
        ? `ردود جديدة على /${page.slug}: ${countOf(page.count, "response", lang)}`
        : `New responses on /${page.slug}: ${countOf(page.count, "response", lang)}`,
      detail: null,
      target: { kind: "responses", pageId: page.pageId },
    });
  }

  if (input.health && (input.health.failed > 0 || input.health.silent > 0)) {
    const parts = [
      input.health.failed > 0
        ? ar
          ? `تشغيلات متعثرة في آخر 24 ساعة: ${input.health.failed}`
          : `Failed runs in 24 hours: ${input.health.failed}`
        : null,
      input.health.silent > 0
        ? ar
          ? `خدمات متوقفة عن التسجيل: ${input.health.silent}`
          : `Silent services: ${input.health.silent}`
        : null,
    ].filter(Boolean);
    lines.push({
      key: "health",
      tone: input.health.failed > 0 ? "urgent" : "warning",
      title: ar ? "صحة النظام تحتاج نظرة" : "System health needs a look",
      detail: parts.join(ar ? "، " : ", "),
      target: { kind: "health" },
    });
  }

  const expired = rows.filter((row) => row.state === "expired");
  if (expired.length) {
    lines.push({
      key: "expired",
      tone: "warning",
      title: ar
        ? `اشتراكات منتهية: ${countOf(expired.length, "store", lang)}`
        : `Ended subscriptions: ${countOf(expired.length, "store", lang)}`,
      detail: names(expired, lang),
      target: { kind: "stores", view: "expired" },
    });
  }

  const ending = rows
    .filter((row) => row.endingSoon)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
  if (ending.length) {
    lines.push({
      key: "ending",
      tone: "warning",
      title: ar
        ? `تنتهي خلال 14 يوماً: ${countOf(ending.length, "store", lang)}`
        : `Ending within 14 days: ${countOf(ending.length, "store", lang)}`,
      detail: names(ending, lang),
      target: { kind: "stores", view: "ending" },
    });
  }

  const changing = rows.filter(
    (row) =>
      row.state !== "deleted" &&
      (row.store.renewal_intent === "upgrade" ||
        row.store.renewal_intent === "downgrade" ||
        row.store.renewal_intent === "cancel"),
  );
  if (changing.length) {
    lines.push({
      key: "intents",
      tone: "info",
      title: ar
        ? `متاجر طلبت تغيير باقتها أو لن تجدد: ${countOf(changing.length, "store", lang)}`
        : `Stores changing plan or not renewing: ${countOf(changing.length, "store", lang)}`,
      detail: names(changing, lang),
      target: { kind: "stores", view: "all" },
    });
  }

  const quiet = rows.filter((row) => row.quiet);
  if (quiet.length) {
    lines.push({
      key: "quiet",
      tone: "info",
      title: ar
        ? `بلا طلبات منذ 30 يوماً: ${countOf(quiet.length, "store", lang)}`
        : `No orders in 30 days: ${countOf(quiet.length, "store", lang)}`,
      detail: names(quiet, lang),
      target: { kind: "stores", view: "quiet" },
    });
  }

  return lines;
}
