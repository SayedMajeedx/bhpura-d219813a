import { getEnvVariable } from "@/lib/runtime-env";

const NABDA_API_BASE = "https://api.nabdaotp.com";
const REQUEST_TIMEOUT_MS = 10_000;

type NabdaAction = "send" | "verify" | "status";

export type NabdaOtpRequest = {
  action: NabdaAction;
  phone?: string;
  code?: string;
};

export type NabdaOtpResult = {
  ok: boolean;
  enabled: boolean;
  action: NabdaAction;
  error?: string;
};

export function normalizeBahrainPhone(value: string): string | null {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00973")) digits = digits.slice(2);
  if (digits.length === 8) digits = `973${digits}`;
  return /^9733\d{7}$/.test(digits) ? digits : null;
}

function isEnabled(): boolean {
  return getEnvVariable("NABDA_OTP_ENABLED")?.trim().toLowerCase() === "true";
}

function apiKey(): string | null {
  return getEnvVariable("NABDA_API_KEY")?.trim() || null;
}

async function callNabda(path: string, body: Record<string, string>): Promise<void> {
  const key = apiKey();
  if (!key) throw new Error("Nabda API key is not configured");

  const response = await fetch(`${NABDA_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: key,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const publicReason =
      response.status === 400
        ? "Invalid or expired OTP"
        : response.status === 401
          ? "Nabda authentication failed"
          : response.status === 403
            ? "Nabda instance is unavailable"
            : `Nabda request failed (${response.status})`;
    throw new Error(publicReason);
  }
}

export async function executeNabdaOtp(input: NabdaOtpRequest): Promise<NabdaOtpResult> {
  const enabled = isEnabled() && Boolean(apiKey());
  if (input.action === "status") return { ok: enabled, enabled, action: input.action };
  if (!enabled) {
    return {
      ok: false,
      enabled: false,
      action: input.action,
      error: "Nabda pilot is disabled",
    };
  }

  const phone = normalizeBahrainPhone(input.phone ?? "");
  if (!phone) {
    return {
      ok: false,
      enabled: true,
      action: input.action,
      error: "Enter a valid Bahrain phone number",
    };
  }

  if (input.action === "verify") {
    const code = (input.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) {
      return { ok: false, enabled: true, action: input.action, error: "OTP must be 6 digits" };
    }
    await callNabda("/api/v1/messages/otp/verify", { phone, code });
  } else {
    await callNabda("/api/v1/messages/otp/send", { phone });
  }

  return { ok: true, enabled: true, action: input.action };
}
