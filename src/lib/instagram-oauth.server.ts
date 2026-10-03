import { constantTimeSecretEqual } from "@/lib/security.server";

/**
 * Instagram Business Login (the "Instagram API with Instagram Login" flavour, not
 * Facebook Login): the store's manager is sent to Instagram, comes back to the
 * callback with a one-time code, and the server swaps that code for a token.
 *
 * The App Secret and the tokens stay on the server: the code exchange, the
 * long-lived exchange and the storing all happen here, never in the browser, and
 * no token is put in a URL or a log. A signed, short-lived, HttpOnly cookie ties
 * the callback to the browser that started the connection (OAuth state).
 */

/** Exactly what is registered in the Meta app; the same value is used in both steps. */
export const INSTAGRAM_REDIRECT_URI = "https://boutq.store/api/auth/instagram/callback";
export const REQUIRED_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_comments",
] as const;
export const COMMENTS_SCOPE = "instagram_business_manage_comments";

const AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH = "https://graph.instagram.com";
const GRAPH_VERSION = "v23.0";

export const STATE_COOKIE = "ig_oauth_state";
const STATE_TTL_MS = 10 * 60_000;
const COOKIE_PATH = "/api/auth/instagram";

/** Why a connection did not complete; the giveaways screen has a message for each. */
export type OAuthErrorCode =
  | "denied"
  | "invalid_state"
  | "missing_code"
  | "not_configured"
  | "exchange_failed"
  | "long_lived_failed"
  | "profile_failed"
  | "missing_comments_permission"
  | "save_failed";

export class OAuthError extends Error {
  code: OAuthErrorCode;
  /** Instagram's own words for the refusal, already made safe to show (see describeFailure). */
  detail?: string;
  constructor(code: OAuthErrorCode, message?: string, detail?: string) {
    super(message ?? code);
    this.name = "OAuthError";
    this.code = code;
    this.detail = detail;
  }
}

type Fetcher = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

// ── State ───────────────────────────────────────────────────────────────────

export type OAuthState = {
  /** The random value sent to Instagram as `state`. */
  n: string;
  /** The store being connected. */
  b: string;
  /** The signed-in user who started it. */
  u: string;
  /** Where the browser returns to (the site the user was on). */
  o: string;
  /** Expiry, ms since the epoch. */
  e: number;
};

export function randomState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromBase64Url = (text: string) => {
  const padded = text
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(text.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

async function sign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))),
  );
}

/** The cookie value: the state, signed so it cannot be forged or edited. */
export async function sealState(state: OAuthState, secret: string): Promise<string> {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(state)));
  return `${body}.${await sign(secret, body)}`;
}

/** The state from a cookie value, or null if it is missing, edited or expired. */
export async function openState(
  value: string | null | undefined,
  secret: string,
  now: number = Date.now(),
): Promise<OAuthState | null> {
  if (!value || !secret) return null;
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra !== undefined) return null;
  if (!(await constantTimeSecretEqual(signature, await sign(secret, body)))) return null;
  try {
    const state = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as OAuthState;
    if (
      typeof state.n !== "string" ||
      typeof state.b !== "string" ||
      typeof state.u !== "string" ||
      typeof state.o !== "string" ||
      typeof state.e !== "number" ||
      state.e < now
    ) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export function newExpiry(now: number = Date.now()): number {
  return now + STATE_TTL_MS;
}

export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

/** Shared across boutq.store and its subdomains, so the callback sees what the admin page set. */
export function cookieDomainFor(host: string): string | undefined {
  const root = new URL(INSTAGRAM_REDIRECT_URI).hostname;
  return host === root || host.endsWith(`.${root}`) ? root : undefined;
}

export function stateCookie(value: string, host: string): string {
  const domain = cookieDomainFor(host);
  return [
    `${STATE_COOKIE}=${value}`,
    `Path=${COOKIE_PATH}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${STATE_TTL_MS / 1000}`,
    ...(domain ? [`Domain=${domain}`] : []),
  ].join("; ");
}

export function clearStateCookie(host: string): string {
  const domain = cookieDomainFor(host);
  return [
    `${STATE_COOKIE}=`,
    `Path=${COOKIE_PATH}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0",
    ...(domain ? [`Domain=${domain}`] : []),
  ].join("; ");
}

/**
 * The origin the browser may be sent back to: the store's own site (or a local
 * dev server), never an address taken from the request, so it cannot be an open redirect.
 */
export function allowedReturnOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    const root = new URL(INSTAGRAM_REDIRECT_URI).hostname;
    if (url.protocol === "https:" && (url.hostname === root || url.hostname.endsWith(`.${root}`))) {
      return url.origin;
    }
    if (url.protocol === "http:" && url.hostname === "localhost") return url.origin;
  } catch {
    // not a URL
  }
  return null;
}

// ── Authorization and token exchange ────────────────────────────────────────

export function buildAuthorizeUrl(appId: string, state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", INSTAGRAM_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", REQUIRED_SCOPES.join(","));
  url.searchParams.set("state", state);
  // Always show Instagram's consent screen, so a reconnect can grant the comment permission.
  url.searchParams.set("force_reauth", "true");
  return url.toString();
}

export type CodeExchange = {
  accessToken: string;
  userId: string | null;
  /** What Instagram says was granted, or null when it did not say. */
  permissions: string[] | null;
};

function parsePermissions(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string" && value.trim()) {
    return value.split(/[,\s]+/).filter(Boolean);
  }
  return null;
}

/**
 * What Instagram said when it refused a request, made safe to show on a page:
 * the step, the HTTP status and Instagram's own message, with any secret, code or
 * token removed and only plain characters kept.
 */
export function describeFailure(
  step: string,
  status: number,
  body: Record<string, unknown>,
  redact: string[],
): string {
  const nested = asRecord(body.error);
  const words = [
    body.error_message,
    body.error_description,
    nested.message,
    typeof body.error === "string" ? body.error : undefined,
    body.error_type ?? nested.type,
  ].find((v): v is string => typeof v === "string" && v.trim() !== "");
  let text = `${step}: HTTP ${status}${words ? ` - ${words}` : ""}`;
  for (const secret of redact) {
    if (secret) text = text.split(secret).join("[redacted]");
  }
  return text
    .replace(/[^\w .,:;()'[\]-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/** Swaps the one-time code for a short-lived token. Server only: it needs the App Secret. */
export async function exchangeCodeForToken(
  input: { appId: string; appSecret: string; code: string },
  fetcher: Fetcher,
): Promise<CodeExchange> {
  const form = new URLSearchParams({
    client_id: input.appId,
    client_secret: input.appSecret,
    grant_type: "authorization_code",
    redirect_uri: INSTAGRAM_REDIRECT_URI,
    code: input.code,
  });
  const response = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const body = asRecord(await response.json().catch(() => ({})));
  // Instagram answers either { data: [{ ... }] } or the fields at the top level.
  const first = Array.isArray(body.data) ? asRecord(body.data[0]) : body;
  const token = typeof first.access_token === "string" ? first.access_token : "";
  if (!response.ok || !token) {
    throw new OAuthError(
      "exchange_failed",
      `Instagram refused the code (HTTP ${response.status})`,
      describeFailure("code exchange", response.status, body, [input.appSecret, input.code]),
    );
  }
  const userId =
    typeof first.user_id === "string" || typeof first.user_id === "number"
      ? String(first.user_id)
      : null;
  return { accessToken: token, userId, permissions: parsePermissions(first.permissions) };
}

/** Swaps the short-lived token for one that lasts about 60 days. Server only. */
export async function exchangeForLongLived(
  input: { appSecret: string; accessToken: string },
  fetcher: Fetcher,
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = new URL(`${GRAPH}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", input.appSecret);
  url.searchParams.set("access_token", input.accessToken);
  const response = await fetcher(url.toString());
  const body = asRecord(await response.json().catch(() => ({})));
  const token = typeof body.access_token === "string" ? body.access_token : "";
  if (!response.ok || !token) {
    throw new OAuthError(
      "long_lived_failed",
      `Long-lived exchange failed (HTTP ${response.status})`,
      describeFailure("long-lived exchange", response.status, body, [
        input.appSecret,
        input.accessToken,
      ]),
    );
  }
  const expiresIn =
    typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 60 * 86_400;
  return { accessToken: token, expiresIn };
}

export async function fetchProfile(
  accessToken: string,
  fetcher: Fetcher,
): Promise<{ userId: string | null; username: string | null }> {
  const url = new URL(`${GRAPH}/${GRAPH_VERSION}/me`);
  url.searchParams.set("fields", "user_id,username");
  url.searchParams.set("access_token", accessToken);
  const response = await fetcher(url.toString());
  const body = asRecord(await response.json().catch(() => ({})));
  if (!response.ok)
    throw new OAuthError("profile_failed", `Profile lookup failed (HTTP ${response.status})`);
  const id = body.user_id ?? body.id;
  return {
    userId: typeof id === "string" || typeof id === "number" ? String(id) : null,
    username: typeof body.username === "string" ? body.username : null,
  };
}

// ── The callback ────────────────────────────────────────────────────────────

export type CallbackDeps = {
  fetcher: Fetcher;
  appId: string;
  appSecret: string;
  /** Stores the long-lived token (encrypted, server side). */
  saveToken: (input: {
    brandId: string;
    userId: string;
    instagramUserId: string | null;
    username: string | null;
    accessToken: string;
    expiresIn: number;
    scope: string;
  }) => Promise<void>;
  /** The store's slug, to build the page the browser returns to. */
  slugFor: (brandId: string) => Promise<string | null>;
  now?: number;
};

/**
 * Which part of the state check failed. A fixed word, safe to show: it says
 * nothing about the cookie's contents.
 */
export type StateProblem =
  "no_cookie" | "bad_cookie" | "no_state" | "state_mismatch" | "bad_origin" | "unknown_store";

export type CallbackResult =
  /** The browser goes back to the giveaways screen, with the outcome in the query string. */
  | { kind: "redirect"; location: string }
  /** No safe place to send the browser (the state could not be checked): show a plain page. */
  | { kind: "page"; status: number; code: OAuthErrorCode; reason?: StateProblem };

function giveawaysUrl(origin: string, slug: string, outcome: Record<string, string>) {
  const url = new URL(`/admin/b/${encodeURIComponent(slug)}/giveaways`, origin);
  for (const [key, value] of Object.entries(outcome)) url.searchParams.set(key, value);
  return url.toString();
}

/**
 * Handles Instagram's redirect: checks the state, exchanges the code, checks the
 * granted permissions, stores the token. Nothing secret is in the result.
 */
export async function completeInstagramConnection(
  query: URLSearchParams,
  cookieValue: string | null,
  deps: CallbackDeps,
): Promise<CallbackResult> {
  const state = await openState(cookieValue, deps.appSecret, deps.now);
  const returned = query.get("state") ?? "";
  const invalid = (reason: StateProblem): CallbackResult => ({
    kind: "page",
    status: 400,
    code: "invalid_state",
    reason,
  });
  // The callback must belong to the browser that started it.
  if (!state) return invalid(cookieValue ? "bad_cookie" : "no_cookie");
  if (!returned) return invalid("no_state");
  if (!(await constantTimeSecretEqual(returned, state.n))) return invalid("state_mismatch");
  const origin = allowedReturnOrigin(state.o);
  if (!origin) return invalid("bad_origin");
  const slug = await deps.slugFor(state.b);
  if (!slug) return invalid("unknown_store");

  const fail = (code: OAuthErrorCode, detail?: string): CallbackResult => ({
    kind: "redirect",
    location: giveawaysUrl(origin, slug, {
      instagram_error: code,
      ...(detail ? { instagram_detail: detail } : {}),
    }),
  });

  if (query.get("error")) return fail("denied");
  const code = query.get("code")?.trim();
  if (!code) return fail("missing_code");
  if (!deps.appId || !deps.appSecret) return fail("not_configured");

  try {
    const short = await exchangeCodeForToken(
      { appId: deps.appId, appSecret: deps.appSecret, code },
      deps.fetcher,
    );
    // Instagram lists what was granted; without the comments permission the
    // usernames never come back, so do not store a token that cannot do the job.
    if (short.permissions && !short.permissions.includes(COMMENTS_SCOPE)) {
      return fail("missing_comments_permission");
    }
    const long = await exchangeForLongLived(
      { appSecret: deps.appSecret, accessToken: short.accessToken },
      deps.fetcher,
    );
    const profile = await fetchProfile(long.accessToken, deps.fetcher).catch(() => ({
      userId: short.userId,
      username: null,
    }));
    await deps
      .saveToken({
        brandId: state.b,
        userId: state.u,
        instagramUserId: profile.userId ?? short.userId,
        username: profile.username,
        accessToken: long.accessToken,
        expiresIn: long.expiresIn,
        scope: (short.permissions ?? [...REQUIRED_SCOPES]).join(","),
      })
      .catch(() => {
        throw new OAuthError("save_failed");
      });
    return {
      kind: "redirect",
      location: giveawaysUrl(origin, slug, {
        instagram: "connected",
        ...(short.permissions ? {} : { permissions: "unverified" }),
      }),
    };
  } catch (error) {
    return error instanceof OAuthError ? fail(error.code, error.detail) : fail("exchange_failed");
  }
}
