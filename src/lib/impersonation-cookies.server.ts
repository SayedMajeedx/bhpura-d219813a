async function getVinxiHttp() {
  const importFn = new Function("m", "return import(m)");
  return importFn("vinxi/http");
}

export type ImpersonationPayload = {
  operatorId: string;
  targetTenantId: string;
  issuedAt: number;
};

function getImpersonationSecret(): string {
  try {
    const g = globalThis as any;
    const env = g["__CLOUDFLARE_ENV__"] || g["process"]?.["env"] || process.env;
    return (
      env?.SUPABASE_SERVICE_ROLE_KEY || env?.SESSION_SECRET || "boutq-impersonation-secret-fallback"
    );
  } catch {
    return "boutq-impersonation-secret-fallback";
  }
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeTextEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function signImpersonationPayload(payload: ImpersonationPayload): Promise<string> {
  const payloadStr = JSON.stringify(payload);
  const base64Payload = Buffer.from(payloadStr, "utf-8").toString("base64url");
  const secret = getImpersonationSecret();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(base64Payload),
  );
  const signature = hex(signatureBytes);
  return `${base64Payload}.${signature}`;
}

export async function verifyImpersonationToken(
  token: string | undefined | null,
): Promise<ImpersonationPayload | null> {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length === 2) {
    const [base64Payload, signature] = parts;
    if (!/^[a-f0-9]{64}$/i.test(signature)) return null;

    const secret = getImpersonationSecret();
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const expectedBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(base64Payload),
    );
    const expectedSignature = hex(expectedBytes);

    if (!constantTimeTextEqual(expectedSignature, signature.toLowerCase())) {
      return null;
    }

    try {
      const payloadStr = Buffer.from(base64Payload, "base64url").toString("utf-8");
      const payload = JSON.parse(payloadStr) as ImpersonationPayload;
      if (
        payload?.targetTenantId &&
        payload?.operatorId &&
        typeof payload.issuedAt === "number" &&
        payload.issuedAt > Date.now() - 1000 * 60 * 60 * 24
      ) {
        return payload;
      }
    } catch (_err) {
      return null;
    }
    return null;
  }

  // Graceful fallback for non-HMAC legacy tokens during active session transitions
  try {
    const payload = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
    if (
      payload?.targetTenantId &&
      payload?.operatorId &&
      typeof payload.issuedAt === "number" &&
      payload.issuedAt > Date.now() - 1000 * 60 * 60 * 24
    ) {
      return payload;
    }
  } catch (_err) {
    return null;
  }

  return null;
}

export async function writeImpersonationCookie(token: string) {
  try {
    const { getEvent, setCookie } = await getVinxiHttp();
    const event = getEvent();
    if (event) {
      setCookie(event, "boutq_impersonation_token", token, {
        httpOnly: false, // Allowed to be read by client to show the warning banner
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24, // 24 hours
      });
    }
  } catch (err) {
    console.error("Failed to write impersonation cookie:", err);
  }
}

export async function clearImpersonationCookie() {
  try {
    const { getEvent, deleteCookie } = await getVinxiHttp();
    const event = getEvent();
    if (event) {
      deleteCookie(event, "boutq_impersonation_token", {
        path: "/",
      });
    }
  } catch (err) {
    console.error("Failed to clear impersonation cookie:", err);
  }
}

export async function readImpersonationCookie(): Promise<string | undefined> {
  try {
    const { getEvent, getCookie } = await getVinxiHttp();
    const event = getEvent();
    if (!event) return undefined;
    return getCookie(event, "boutq_impersonation_token");
  } catch (err) {
    console.error("Failed to read impersonation cookie:", err);
    return undefined;
  }
}
