export function maskPhoneForList(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return "••••";

  const countryCode = raw.startsWith("+") && digits.length > 7 ? `+${digits.slice(0, 3)} ` : "";
  return `${countryCode}•••• ${digits.slice(-4)}`;
}
