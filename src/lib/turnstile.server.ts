const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_ACTION = "turnstile-spin-v2";

const ALLOWED_HOSTNAMES = new Set([
  "boutq.store",
  "www.boutq.store",
  "pura.boutq.store",
  "localhost",
  "127.0.0.1",
]);

type TurnstileResponse = {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
};

export async function verifyOnboardingTurnstile(input: {
  token: string;
  secret: string | undefined;
  remoteIp?: string;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  if (!input.secret || !input.token) return false;

  const body = new URLSearchParams({
    secret: input.secret,
    response: input.token,
  });
  if (input.remoteIp) body.set("remoteip", input.remoteIp);

  try {
    const response = await (input.fetchImpl ?? fetch)(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) return false;

    const result = (await response.json()) as TurnstileResponse;
    return (
      result.success === true &&
      result.action === TURNSTILE_ACTION &&
      typeof result.hostname === "string" &&
      ALLOWED_HOSTNAMES.has(result.hostname.toLowerCase())
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "turnstile_siteverify_failed",
        error: error instanceof Error ? error.message : "unknown_error",
      }),
    );
    return false;
  }
}
