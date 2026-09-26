import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

/**
 * The import and export history: `import_runs` (written by the import server
 * functions, one row per batch) and `export_runs` (logged by the browser after
 * each download, mirrored in localStorage so the history shows even when the
 * log write or read fails).
 */

export const importExportKeys = {
  all: (brandId: string) => ["import-export", brandId] as const,
  importRuns: (brandId: string) => [...importExportKeys.all(brandId), "import-runs"] as const,
  productImportRuns: (brandId: string) =>
    [...importExportKeys.all(brandId), "import-runs", "products"] as const,
  exportRuns: (brandId: string) => [...importExportKeys.all(brandId), "export-runs"] as const,
};

/** The brand's latest 30 import batches, any entity. A failed read shows no history. */
export async function fetchImportRuns(brandId: string) {
  const { data, error } = await supabase
    .from("import_runs")
    .select(
      "id,brand_id,session_id,source,entity_type,status,total_count,success_count,skipped_count,failed_count,created_at",
    )
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return [];
  return data ?? [];
}

/** The brand's latest 30 product import batches (the importer merges them by session). */
export async function fetchProductImportRuns(brandId: string) {
  const { data, error } = await supabase
    .from("import_runs")
    .select(
      "id,session_id,source,status,total_count,success_count,skipped_count,failed_count,created_at",
    )
    .eq("brand_id", brandId)
    .eq("entity_type", "products")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return data ?? [];
}

const localExportRunsKey = (brandId: string) => `boutq_export_runs_${brandId}`;

/**
 * The brand's latest 20 exports from the log, or the copy kept in this
 * browser when the log is empty or unreadable.
 */
export async function fetchExportRuns(brandId: string): Promise<ExportRunSummary[]> {
  try {
    const { data, error } = await supabase
      .from("export_runs")
      .select("id, preset, entity_type, file_format, record_count, file_name, created_at")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error && data && data.length > 0) return data;
  } catch {
    // Fall back to local storage
  }
  const local = localStorage.getItem(localExportRunsKey(brandId));
  return local ? JSON.parse(local) : [];
}
export type ExportRunSummary = {
  id: string;
  preset: string;
  entity_type: string;
  file_format: string;
  record_count: number;
  file_name: string;
  created_at: string;
};

export const importExportQueries = {
  importRuns: (brandId: string) =>
    queryOptions({
      queryKey: importExportKeys.importRuns(brandId),
      queryFn: () => fetchImportRuns(brandId),
      enabled: Boolean(brandId),
    }),
  productImportRuns: (brandId: string) =>
    queryOptions({
      queryKey: importExportKeys.productImportRuns(brandId),
      queryFn: () => fetchProductImportRuns(brandId),
      enabled: Boolean(brandId),
    }),
  exportRuns: (brandId: string) =>
    queryOptions({
      queryKey: importExportKeys.exportRuns(brandId),
      queryFn: () => fetchExportRuns(brandId),
      enabled: Boolean(brandId),
    }),
};

/** Logs one export (throws on error; the exporter treats the log as best-effort). */
export async function recordExportRun(run: TablesInsert<"export_runs">) {
  const { error } = await supabase.from("export_runs").insert(run);
  if (error) throw error;
}
