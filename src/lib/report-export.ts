/**
 * What a report export may hold: no contact details (a column named for an email or a phone is
 * left out), and no cell a spreadsheet would run as a formula (`=`, `+`, `-`, `@` is quoted).
 * The Reports export page writes its file from these rows. A server copy of the same rule was
 * never called and is gone; its security test now runs here.
 */
export function sanitizeReportRows(rows: Record<string, unknown>[]) {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).flatMap(([key, value]) => {
        if (/email|phone/i.test(key)) return [];
        if (typeof value === "string" && /^[=+\-@]/.test(value)) return [[key, `'${value}`]];
        return [[key, value]];
      }),
    ),
  );
}
