import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { readParts, textOf } from "@/lib/platform-pages/page";
import type { PageDraft, PageStatus } from "@/features/platform-pages/lib/editor";
import { storedParts } from "@/features/platform-pages/lib/editor";
import { platformPagesKeys } from "./index";

/**
 * Platform pages as the super admin makes them (row security: a super admin only; migration
 * 20261218100000). A page's blocks, form and settings are read with `readParts`, the visitor's own
 * reading, so the editor shows what a visitor will.
 */

export const platformPagesAdminKeys = {
  list: () => [...platformPagesKeys.all, "admin", "list"] as const,
  page: (id: string) => [...platformPagesKeys.all, "admin", "page", id] as const,
};

const PAGE_COLUMNS = "id, slug, status, content, form, settings, created_at, updated_at";

export type AdminPage = PageDraft & {
  id: string;
  slug: string;
  status: PageStatus;
  createdAt: string;
  updatedAt: string;
};

export type AdminPageSummary = {
  id: string;
  slug: string;
  status: PageStatus;
  title: string;
  updatedAt: string;
  responses: number;
};

type Row = {
  id: string;
  slug: string;
  status: string;
  content: Json;
  form: Json;
  settings: Json;
  created_at: string;
  updated_at: string;
};

const statusOf = (value: string): PageStatus =>
  value === "published" || value === "closed" ? value : "draft";

function pageOf(row: Row): AdminPage {
  return {
    id: row.id,
    slug: row.slug,
    status: statusOf(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // The editor keeps a half-written piece, which a visitor's page leaves out.
    ...readParts(row, true),
  };
}

/** The draft as the table's columns. */
function columnsOf(draft: PageDraft): { content: Json; form: Json; settings: Json } {
  const parts = storedParts(draft);
  return {
    content: parts.content as unknown as Json,
    form: parts.form as unknown as Json,
    settings: parts.settings as unknown as Json,
  };
}

/** Every platform page, newest change first, each with its title and how many responses it has. */
export async function fetchAdminPages(): Promise<AdminPageSummary[]> {
  const { data, error } = await supabase
    .from("platform_pages")
    .select(PAGE_COLUMNS)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  const counts = await Promise.all(
    rows.map(async (row) => {
      const { count, error: countError } = await supabase
        .from("platform_page_responses")
        .select("id", { count: "exact", head: true })
        .eq("page_id", row.id);
      if (countError) throw countError;
      return count ?? 0;
    }),
  );
  return rows.map((row, i) => {
    const page = pageOf(row);
    const hero = page.blocks.find((b) => b.kind === "hero");
    return {
      id: row.id,
      slug: row.slug,
      status: page.status,
      title: (hero && textOf(hero.title, "ar")) || row.slug,
      updatedAt: row.updated_at,
      responses: counts[i],
    };
  });
}

export async function fetchAdminPage(id: string): Promise<AdminPage | null> {
  const { data, error } = await supabase
    .from("platform_pages")
    .select(PAGE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? pageOf(data as Row) : null;
}

/** A new draft page at this address. */
export async function createPage(slug: string, draft: PageDraft): Promise<string> {
  const { data, error } = await supabase
    .from("platform_pages")
    .insert({ slug, status: "draft", ...columnsOf(draft) })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function savePage(id: string, draft: PageDraft): Promise<void> {
  const { data, error } = await supabase
    .from("platform_pages")
    .update(columnsOf(draft))
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("PAGE_NOT_SAVED");
}

export async function setPageStatus(id: string, status: PageStatus): Promise<void> {
  const { data, error } = await supabase
    .from("platform_pages")
    .update({ status })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("PAGE_NOT_SAVED");
}

export async function setPageSlug(id: string, slug: string): Promise<void> {
  const { data, error } = await supabase
    .from("platform_pages")
    .update({ slug })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("PAGE_NOT_SAVED");
}

/** A page and its responses, gone for good (the responses go with it). */
export async function deletePage(id: string): Promise<void> {
  const { error } = await supabase.from("platform_pages").delete().eq("id", id);
  if (error) throw error;
}

export const platformPagesAdminQueries = {
  list: () => queryOptions({ queryKey: platformPagesAdminKeys.list(), queryFn: fetchAdminPages }),
  page: (id: string) =>
    queryOptions({
      queryKey: platformPagesAdminKeys.page(id),
      queryFn: () => fetchAdminPage(id),
    }),
};

/** A slug the database refused as taken. */
export function slugTaken(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === "23505" || /duplicate key/i.test(e?.message ?? "");
}
