import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import writeXlsxFile from "write-excel-file/node";

type ExportParams = {
  reportType: "sales" | "products" | "customers";
  from: string;
  to: string;
  tz: string;
  format: "csv" | "xlsx";
};

// Function to sanitize data to prevent CSV/Excel injection
const sanitizeData = (data: any[]) => {
  return data.map((row) => {
    const sanitizedRow: any = {};
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "string") {
        // Strip PII and prevent formula injection
        if (key.toLowerCase().includes("email") || key.toLowerCase().includes("phone")) {
          continue; // Strip PII completely
        }

        // Prevent formula injection in Excel/CSV
        if (
          value.startsWith("=") ||
          value.startsWith("+") ||
          value.startsWith("-") ||
          value.startsWith("@")
        ) {
          sanitizedRow[key] = "'" + value;
        } else {
          sanitizedRow[key] = value;
        }
      } else {
        sanitizedRow[key] = value;
      }
    }
    return sanitizedRow;
  });
};

export const generateExportData = createServerFn({ method: "POST" })
  .validator((params: ExportParams) => params)
  .handler(async ({ data: params }) => {
    const { reportType, from, to, tz, format } = params;

    // Fetch data from Supabase using the secured RPC
    const { data: rawData, error } = await (supabase as any).rpc("rpc_reporting_export", {
      p_report_type: reportType,
      p_start_date: from,
      p_end_date: to,
      p_tz: tz,
    });

    if (error) {
      throw new Error(`Failed to generate export: ${error.message}`);
    }

    if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
      throw new Error("No data available for export.");
    }

    // Limit to 10,000 rows for XLSX to avoid massive memory consumption and timeouts
    let safeData = rawData;
    if (format === "xlsx" && safeData.length > 10000) {
      safeData = safeData.slice(0, 10000);
    } else if (format === "csv" && safeData.length > 50000) {
      // CSV can be larger, limit to 50k as per rules
      safeData = safeData.slice(0, 50000);
    }

    // Sanitize the data
    const sanitizedData = sanitizeData(safeData);

    if (format === "csv") {
      const csvContent = toCsv(sanitizedData);
      return {
        content: csvContent,
        mimeType: "text/csv",
        extension: "csv",
        isBase64: false,
      };
    } else {
      const buffer = await writeXlsxFile(toSheetData(sanitizedData), {
        sheet: "Export",
        stickyRowsCount: 1,
      }).toBuffer();
      return {
        content: buffer.toString("base64"),
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        extension: "xlsx",
        isBase64: true,
      };
    }
  });

function toSheetData(rows: Record<string, unknown>[]) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return [
    headers.map((value) => ({ value, fontWeight: "bold" as const })),
    ...rows.map((row) => headers.map((header) => toCellValue(row[header]))),
  ];
}

function toCellValue(value: unknown): string | number | boolean | Date | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) return value;
  return JSON.stringify(value);
}

function toCsv(rows: Record<string, unknown>[]): string {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escape = (value: unknown) => {
    const text = toCellValue(value)?.toString() ?? "";
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [headers.map(escape), ...rows.map((row) => headers.map((header) => escape(row[header])))]
    .map((row) => row.join(","))
    .join("\r\n");
}
