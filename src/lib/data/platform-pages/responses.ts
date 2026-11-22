import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { readAll } from "../read-all";
import { platformPagesKeys } from "./index";
import {
  isResponseStatus,
  type PageResponse,
  type ResponseStatus,
} from "@/features/platform-pages/lib/responses";

/**
 * A platform page's responses, for the super admin's inbox (row security: a super admin only;
 * migration 20261218100000). Read to the end, newest first.
 */

export const platformPageResponsesKeys = {
  page: (pageId: string) => [...platformPagesKeys.all, "responses", pageId] as const,
};

type Row = {
  id: string;
  status: string;
  answers: unknown;
  admin_notes: string | null;
  created_at: string;
};

const responseOf = (row: Row): PageResponse => ({
  id: row.id,
  status: isResponseStatus(row.status) ? row.status : "new",
  answers:
    row.answers && typeof row.answers === "object" && !Array.isArray(row.answers)
      ? (row.answers as Record<string, unknown>)
      : {},
  notes: row.admin_notes,
  createdAt: row.created_at,
});

export async function fetchPageResponses(pageId: string): Promise<PageResponse[]> {
  const rows = await readAll((from, to) =>
    supabase
      .from("platform_page_responses")
      .select("id, status, answers, admin_notes, created_at", { count: "exact" })
      .eq("page_id", pageId)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  return (rows as Row[]).map(responseOf);
}

export async function updatePageResponse(
  id: string,
  patch: { status?: ResponseStatus; notes?: string | null },
): Promise<void> {
  const { data, error } = await supabase
    .from("platform_page_responses")
    .update({
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.notes !== undefined ? { admin_notes: patch.notes?.trim() || null } : {}),
    })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("RESPONSE_NOT_SAVED");
}

export async function deletePageResponse(id: string): Promise<void> {
  const { error } = await supabase.from("platform_page_responses").delete().eq("id", id);
  if (error) throw error;
}

export const platformPageResponsesQueries = {
  page: (pageId: string) =>
    queryOptions({
      queryKey: platformPageResponsesKeys.page(pageId),
      queryFn: () => fetchPageResponses(pageId),
    }),
};
