import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfileNames } from "@/lib/data/profiles";
import { ordersKeys } from "./keys";
import type { Json } from "@/integrations/supabase/types";
import type { LineRevision } from "@/features/orders/lib/line-revisions";
import type { AlterationChange } from "@/features/orders/lib/alterations";

/**
 * Changing a custom order after it was placed (migration `20261119100000`): the order's line
 * revisions come with the order itself (`line_revisions` in `ORDER_DETAIL_SELECT`), and the two
 * steps go through the database's functions, which check the caller and keep the record.
 */

type Row = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" ? value : "");
const textOrNull = (value: unknown) => (typeof value === "string" && value ? value : null);

function changesOf(value: unknown): AlterationChange[] {
  return (Array.isArray(value) ? (value as Row[]) : []).map((c) => ({
    key: text(c.key) || undefined,
    label_ar: text(c.label_ar) || undefined,
    label_en: text(c.label_en) || undefined,
    from: text(c.from),
    to: text(c.to),
  }));
}

/** The order's revisions as the screens read them (rows the database wrote). */
export function toLineRevisions(data: unknown): LineRevision[] {
  return (Array.isArray(data) ? (data as Row[]) : [])
    .map((row) => ({
      id: text(row.id),
      order_item_id: text(row.order_item_id),
      revision: Number(row.revision) || 0,
      changes: changesOf(row.changes),
      note: textOrNull(row.note),
      changed_by: textOrNull(row.changed_by),
      changed_at: text(row.changed_at),
      told_supplier_at: textOrNull(row.told_supplier_at),
    }))
    .filter((r) => r.id && r.order_item_id && r.revision > 1);
}

export type AmendResult = {
  revision: number;
  changes: AlterationChange[];
  withSupplier: boolean;
  supplierBehind: boolean;
};

/**
 * "Change measurements": the changed answers of a made-to-order piece, with a note. The database
 * refuses what may not change (a cancelled order, a piece already made, an unknown answer) and
 * writes one press once.
 */
export async function amendOrderLineDetails(args: {
  itemId: string;
  values: Array<{ key: string; value: string }>;
  note: string | null;
  requestId: string;
}): Promise<AmendResult> {
  const { data, error } = await supabase.rpc("amend_order_line_details", {
    p_item_id: args.itemId,
    p_values: args.values as unknown as Json,
    p_note: args.note ?? undefined,
    p_request_id: args.requestId,
  });
  if (error) throw error;
  const row = (data ?? {}) as Row;
  return {
    revision: Number(row.revision) || 1,
    changes: changesOf(row.changes),
    withSupplier: row.with_supplier === true,
    supplierBehind: row.supplier_behind === true,
  };
}

/** The supplier holding the piece was given its latest sheet (printed, or the message opened). */
export async function markOrderLineSupplierTold(
  itemId: string,
): Promise<{ revision: number; told: boolean }> {
  const { data, error } = await supabase.rpc("mark_order_line_supplier_told", {
    p_item_id: itemId,
  });
  if (error) throw error;
  const row = (data ?? {}) as Row;
  return { revision: Number(row.revision) || 1, told: row.told === true };
}

export const lineRevisionKeys = {
  authors: (brandId: string, ids: readonly string[]) =>
    [...ordersKeys.all(brandId), "revision-authors", [...ids].sort().join(",")] as const,
};

export const lineRevisionQueries = {
  /** Who changed the order's lines, by name (a person not found reads as no one). */
  authors: (brandId: string, ids: readonly string[]) =>
    queryOptions({
      queryKey: lineRevisionKeys.authors(brandId, ids),
      queryFn: async () =>
        Object.fromEntries(
          (await fetchProfileNames([...ids])).map((p) => [p.id, p.full_name || p.email || ""]),
        ) as Record<string, string>,
      enabled: Boolean(brandId) && ids.length > 0,
    }),
};
