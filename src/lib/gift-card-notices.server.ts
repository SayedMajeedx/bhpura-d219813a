import { adminNotice, customerNotice, type Email, type NoticeEvent } from "@/lib/gift-card-notices";

/**
 * Sends a gift card purchase's emails from the outbox (server only, the service role): every
 * minute from the Worker's scheduler, and straight after a purchase is written or paid so the
 * buyer is not kept waiting. Each event is claimed once (`claim_gift_card_purchase_events`); the
 * buyer's email goes through the store's own customer mailbox (Resend, as an order's), the
 * store's through its admin mailbox (SendPulse) to its active admins and the notification
 * recipients who take new orders. A store with a mailbox not set up skips that email. Each email
 * is recorded on its own (migration 20261106100000): when one fails, the event is tried again later
 * for that one alone, so an email that went is never sent twice (the buyer once received the same
 * "request received" four times while the store's email kept failing).
 */

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;
type Admin = {
  rpc: unknown;
  from: (table: string) => {
    select: (columns: string) => QueryChain;
  };
};
type QueryChain = {
  eq: (column: string, value: unknown) => QueryChain;
  in: (column: string, values: unknown[]) => QueryChain;
  limit: (count: number) => QueryChain;
  then: Promise<{ data: unknown; error: { message: string; code?: string } | null }>["then"];
};

type Integration = {
  api_key?: string;
  webhook_secret?: string;
  base_url?: string;
  is_active?: boolean;
};

async function integration(
  admin: Admin,
  brandId: string,
  provider: string,
): Promise<Integration | null> {
  const { data, error } = await (admin.rpc as Rpc)("get_integration_credential_secret", {
    p_brand_id: brandId,
    p_provider: provider,
  });
  const row = Array.isArray(data) ? (data[0] as Integration | undefined) : undefined;
  return error || !row?.is_active ? null : row;
}

async function sendCustomer(admin: Admin, e: NoticeEvent, mail: Email & { to: string }) {
  const mailbox = await integration(admin, e.brand_id, "resend_customer_email");
  const from = mailbox?.base_url?.trim();
  const key = mailbox?.api_key?.trim();
  if (!from || !key) return "skipped" as const;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${e.sender_name || e.store_name} <${from}>`,
      to: [mail.to],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    }),
  });
  if (!response.ok) {
    throw new Error(`Resend ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return "sent" as const;
}

/** The store's admins and the recipients who take new-order emails, each address once. */
async function storeRecipients(admin: Admin, brandId: string) {
  const [profiles, configured] = await Promise.all([
    admin
      .from("profiles")
      .select("email, name")
      .eq("brand_id", brandId)
      .eq("status", "active")
      .in("role", ["admin", "brand_admin"])
      .limit(200),
    admin
      .from("brand_notification_recipients")
      .select("email, name")
      .eq("brand_id", brandId)
      .eq("active", true)
      .eq("receive_order_placed", true)
      .limit(200),
  ]);
  if (profiles.error) throw new Error(`Store admins: ${profiles.error.message}`);
  const people = [
    ...((profiles.data as Array<{ email?: string; name?: string }>) ?? []),
    ...((configured.error ? [] : configured.data) as Array<{ email?: string; name?: string }>),
  ];
  const byEmail = new Map<string, { email: string; name?: string }>();
  for (const person of people) {
    const email = String(person.email ?? "")
      .trim()
      .toLowerCase();
    if (!email || byEmail.has(email)) continue;
    const name = String(person.name ?? "").trim();
    byEmail.set(email, { email, ...(name ? { name } : {}) });
  }
  return [...byEmail.values()];
}

async function sendStore(admin: Admin, e: NoticeEvent, mail: Email) {
  const mailbox = await integration(admin, e.brand_id, "sendpulse_admin");
  const id = mailbox?.api_key?.trim();
  const secret = mailbox?.webhook_secret?.trim();
  const from = mailbox?.base_url?.trim();
  if (!id || !secret || !from) return "skipped" as const;
  const to = await storeRecipients(admin, e.brand_id);
  if (to.length === 0) return "skipped" as const;
  const tokenResponse = await fetch("https://api.sendpulse.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: id,
      client_secret: secret,
    }),
  });
  if (!tokenResponse.ok) throw new Error(`SendPulse sign-in ${tokenResponse.status}`);
  const { access_token: accessToken } = (await tokenResponse.json()) as { access_token?: string };
  const response = await fetch("https://api.sendpulse.com/smtp/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: {
        html: mail.html,
        text: mail.text,
        subject: mail.subject,
        from: { name: e.store_name, email: from },
        to,
      },
    }),
  });
  if (!response.ok)
    throw new Error(`SendPulse ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return "sent" as const;
}

export type NoticeRun = {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  /** The first failure's reason, for the health log. */
  lastError?: string;
};

/** An event as the outbox gives it, with which of its emails already went. */
type ClaimedEvent = NoticeEvent & { customer_done?: boolean; store_done?: boolean };

type Part = { done: boolean; error: string | null; outcome: "sent" | "skipped" | "none" };

async function sendPart(
  already: boolean | undefined,
  mail: unknown,
  send: () => Promise<"sent" | "skipped">,
): Promise<Part> {
  if (already || !mail) return { done: true, error: null, outcome: "none" };
  try {
    return { done: true, error: null, outcome: await send() };
  } catch (error) {
    return {
      done: false,
      error: error instanceof Error ? error.message : String(error),
      outcome: "none",
    };
  }
}

export async function processGiftCardNotices(limit = 20): Promise<NoticeRun> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Admin;
  const { data, error } = await (admin.rpc as Rpc)("claim_gift_card_purchase_events", {
    p_limit: limit,
  });
  if (error) throw new Error(`Gift card notices: ${error.message}`);
  const events = (Array.isArray(data) ? data : []) as ClaimedEvent[];
  const run: NoticeRun = { claimed: events.length, sent: 0, skipped: 0, failed: 0 };

  for (const event of events) {
    const toBuyer = customerNotice(event);
    const toStore = adminNotice(event);
    const [buyer, store] = await Promise.all([
      sendPart(event.customer_done, toBuyer, () => sendCustomer(admin, event, toBuyer!)),
      sendPart(event.store_done, toStore, () => sendStore(admin, event, toStore!)),
    ]);
    const problems: string[] = [];
    for (const [who, part] of [
      ["buyer", buyer],
      ["store", store],
    ] as const) {
      if (part.error) {
        problems.push(`${who}: ${part.error}`);
        run.failed += 1;
      } else if (part.outcome === "sent") run.sent += 1;
      else if (part.outcome === "skipped") run.skipped += 1;
    }
    if (problems.length && !run.lastError) run.lastError = problems.join("; ").slice(0, 300);
    await (admin.rpc as Rpc)("finish_gift_card_purchase_event", {
      p_event_id: event.event_id,
      p_error: problems.length ? problems.join("; ") : null,
      p_customer_done: buyer.done,
      p_store_done: store.done,
    });
  }
  return run;
}

/** After a purchase is written or paid: its emails now rather than at the next minute. */
export async function sendGiftCardNoticesNow(): Promise<void> {
  try {
    await processGiftCardNotices(10);
  } catch (error) {
    console.warn("[gift card notices]", error instanceof Error ? error.message : error);
  }
}
