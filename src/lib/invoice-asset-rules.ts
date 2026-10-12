/**
 * What the invoice's picture proxy will fetch.
 *
 * A PDF invoice inlines the store's logo and product pictures, so the server fetches them for
 * the browser. Anyone can call that function, so it fetches only from where this platform keeps
 * pictures (its own media host and its own Supabase project, never any project's), and never
 * more than a picture's worth of bytes.
 */

/** The media host every stored picture is served from when no other is configured. */
export const DEFAULT_MEDIA_HOST = "media.boutq.store";

/** A logo or a product picture is far below this; a file above it is not one. */
export const MAX_INVOICE_ASSET_BYTES = 5 * 1024 * 1024;

function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** The hosts a picture may come from: the media host(s) and this project's own Supabase. */
export function invoiceAssetHosts(config: {
  supabaseUrl?: string | null;
  mediaBaseUrl?: string | null;
}): Set<string> {
  const hosts = new Set<string>([DEFAULT_MEDIA_HOST]);
  for (const host of [hostOf(config.supabaseUrl), hostOf(config.mediaBaseUrl)]) {
    if (host) hosts.add(host);
  }
  return hosts;
}

export function invoiceAssetAllowed(url: URL, hosts: ReadonlySet<string>): boolean {
  return url.protocol === "https:" && hosts.has(url.hostname.toLowerCase());
}

/**
 * Reads a response's body, stopping as soon as it is bigger than `maxBytes`: the size a server
 * announces is checked first, and the bytes are counted as they arrive in case it announced none.
 */
export async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  const announced = Number(response.headers.get("content-length"));
  if (Number.isFinite(announced) && announced > maxBytes) {
    await response.body?.cancel();
    throw new Error("Invoice asset is too large");
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Invoice asset is too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
