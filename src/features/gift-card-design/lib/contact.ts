import { displayPhone } from "@/lib/invoice-display";

/** How a card's reader reaches the store: its number and its Instagram, as people write them. */
export type CardContact = { phone: string | null; instagram: string | null };

/**
 * The store's Instagram handle from its social links (`business_settings.socials`: a list of
 * `{ name, url }`, or an older `{ instagram: url }`): "@puraline.bh". Null when it has none.
 */
export function instagramHandle(socials: unknown): string | null {
  const urls: string[] = [];
  if (Array.isArray(socials)) {
    for (const item of socials) {
      const entry = item as { name?: unknown; url?: unknown } | null;
      if (typeof entry?.url === "string") urls.push(entry.url);
    }
  } else if (socials && typeof socials === "object") {
    for (const value of Object.values(socials as Record<string, unknown>)) {
      if (typeof value === "string") urls.push(value);
    }
  }
  for (const url of urls) {
    const match = url.trim().match(/instagram\.com\/([A-Za-z0-9._]{1,30})/i);
    if (match) return `@${match[1].replace(/\.+$/, "")}`;
  }
  return null;
}

/** The store's contact as a card prints it, from its settings. */
export function cardContact(
  settings:
    | {
        phone?: string | null;
        whatsapp_number?: string | null;
        socials?: unknown;
      }
    | null
    | undefined,
): CardContact {
  const phone = displayPhone(settings?.phone || settings?.whatsapp_number || "") || null;
  return { phone, instagram: instagramHandle(settings?.socials) };
}
