/**
 * A service's details beyond a product's (products.service_location and
 * products.service_includes, 20261001120000): where it happens and what it
 * includes. Pure rules for reading them from a row and saving them.
 */

export const SERVICE_LOCATIONS = ["customer", "venue", "both"] as const;

export type ServiceLocation = (typeof SERVICE_LOCATIONS)[number];

export type ServiceInclude = { ar: string; en: string };

export function serviceLocationFrom(raw: unknown): ServiceLocation | null {
  return (SERVICE_LOCATIONS as readonly string[]).includes(String(raw))
    ? (raw as ServiceLocation)
    : null;
}

/** The included lines a row holds, ignoring anything malformed. */
export function serviceIncludesFrom(raw: unknown): ServiceInclude[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((line): line is Record<string, unknown> => !!line && typeof line === "object")
    .map((line) => ({
      ar: typeof line.ar === "string" ? line.ar : "",
      en: typeof line.en === "string" ? line.en : "",
    }));
}

/** The lines to save: trimmed, empty ones dropped, at most 30 (the database's limit). */
export function serviceIncludesToSave(lines: readonly ServiceInclude[]): ServiceInclude[] {
  return lines
    .map((line) => ({ ar: line.ar.trim(), en: line.en.trim() }))
    .filter((line) => line.ar !== "" || line.en !== "")
    .slice(0, 30);
}
