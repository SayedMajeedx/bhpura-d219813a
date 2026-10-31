import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminNotice,
  customerNotice,
  purchasePageUrl,
  type NoticeEvent,
} from "../src/lib/gift-card-notices";

// A gift card purchase's emails (the owner's review of 2026-10-31): the buyer who chose email is
// told it was received, its code once ready, or that it was declined; the store is told of a
// transfer to check and of a card sold on the store. The Worker sends them once from the outbox.

const state = vi.hoisted(() => ({ admin: null as unknown }));
const adminClient = {
  get supabaseAdmin() {
    return state.admin;
  },
};
vi.mock("../src/integrations/supabase/client.server", () => adminClient);
vi.mock("@/integrations/supabase/client.server", () => adminClient);

const event = (over: Partial<NoticeEvent> = {}): NoticeEvent => ({
  event_id: "ev1",
  event: "paid",
  purchase_id: "00000000-0000-4000-8000-0000000000c1",
  brand_id: "b1",
  slug: "pura",
  store_name: "Pura Line",
  sender_name: null,
  amount: 50,
  currency: "BHD",
  payment_method: "card",
  delivery_channel: "email",
  lang: "en",
  buyer_name: "Sara",
  buyer_phone: null,
  buyer_email: "sara@example.com",
  recipient_name: "Noor",
  message: "Eid Mubarak",
  cancel_reason: null,
  token: "t".repeat(64),
  code: "ABCD-EFGH-JKMN",
  expires_on: "2027-10-31",
  ...over,
});

describe("the buyer's emails", () => {
  it("send the code once it is ready, with a way back to the card", () => {
    const mail = customerNotice(event())!;
    expect(mail.to).toBe("sara@example.com");
    expect(mail.subject).toBe("Your gift card - Pura Line");
    expect(mail.html).toContain("ABCD-EFGH-JKMN");
    expect(mail.text).toContain("Valid until 31 Oct 2027.");
    expect(mail.html).toContain(purchasePageUrl(event()));
    expect(purchasePageUrl(event())).toBe(
      `https://pura.boutq.store/pura/gift-card/00000000-0000-4000-8000-0000000000c1?t=${"t".repeat(64)}`,
    );
  });

  it("say a transfer was received, and that a request was declined with its reason, in the buyer's language", () => {
    const received = customerNotice(
      event({ event: "placed", payment_method: "benefit", code: null, lang: "ar" }),
    )!;
    expect(received.subject).toBe("Gift card request received - Pura Line");
    expect(received.html).toContain('dir="rtl"');
    expect(received.text).toContain("يتحقق المتجر من التحويل");
    const declined = customerNotice(
      event({ event: "cancelled", code: null, cancel_reason: "No transfer arrived" }),
    )!;
    expect(declined.text).toContain("Reason: No transfer arrived");
  });

  it("write nothing for a card payment not yet finished, or to a buyer who chose WhatsApp", () => {
    expect(customerNotice(event({ event: "placed", code: null }))).toBeNull();
    expect(
      customerNotice(event({ delivery_channel: "whatsapp", buyer_phone: "+97339001122" })),
    ).toBeNull();
  });

  it("never let a name or a note carry markup into the email", () => {
    const mail = customerNotice(event({ buyer_name: "<b>Sara</b>" }))!;
    expect(mail.html).not.toContain("<b>Sara</b>");
    expect(mail.html).toContain("&lt;b&gt;Sara&lt;/b&gt;");
  });
});

describe("the store's emails", () => {
  it("tell of a transfer to check and of a card sold, with where the code goes", () => {
    const transfer = adminNotice(
      event({
        event: "placed",
        payment_method: "benefit",
        delivery_channel: "whatsapp",
        buyer_phone: "+97339001122",
        buyer_email: null,
        code: null,
      }),
    )!;
    expect(transfer.subject).toMatch(/^\[Gift card\] Transfer to check BHD 50\.000 - Pura Line$/);
    expect(transfer.text).toContain(
      "By WhatsApp to +97339001122: send the code from the Gift cards page",
    );
    expect(transfer.text).toContain("https://boutq.store/admin/b/pura/gift-cards");
    const sold = adminNotice(event())!;
    expect(sold.subject).toMatch(/Sold online/);
    expect(sold.text).toContain("By email to sara@example.com (sent automatically)");
  });

  it("stay quiet for what staff did themselves, and for a card payment not finished", () => {
    expect(adminNotice(event({ payment_method: "benefit" }))).toBeNull();
    expect(adminNotice(event({ event: "placed" }))).toBeNull();
    expect(adminNotice(event({ event: "cancelled" }))).toBeNull();
  });
});

const { processGiftCardNotices } = await import("../src/lib/gift-card-notices.server");

describe("sending from the outbox", () => {
  type Call = [string, Record<string, unknown>];
  function server(events: NoticeEvent[], mailboxes: Record<string, unknown> = {}) {
    const calls: Call[] = [];
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push([name, args]);
      if (name === "claim_gift_card_purchase_events") return { data: events, error: null };
      if (name === "get_integration_credential_secret") {
        const box = mailboxes[String(args.p_provider)];
        return { data: box ? [box] : [], error: null };
      }
      return { data: null, error: null };
    });
    const rows: Record<string, unknown[]> = {
      profiles: [{ email: "Owner@Pura.com", name: "Owner" }],
      brand_notification_recipients: [{ email: "owner@pura.com" }, { email: "ops@pura.com" }],
    };
    const from = (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        then: (resolve: (v: unknown) => unknown) =>
          resolve({ data: rows[table] ?? [], error: null }),
      };
      return chain;
    };
    state.admin = { rpc, from };
    return calls;
  }

  const MAILBOXES = {
    resend_customer_email: { is_active: true, api_key: "re_key", base_url: "hello@pura.com" },
    sendpulse_admin: {
      is_active: true,
      api_key: "sp_id",
      webhook_secret: "sp_secret",
      base_url: "alerts@pura.com",
    },
  };

  beforeEach(() => vi.unstubAllGlobals());

  it("sends the buyer's and the store's emails and marks the event done", async () => {
    const calls = server([event()], MAILBOXES);
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("oauth")
        ? new Response(JSON.stringify({ access_token: "tok" }))
        : new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await processGiftCardNotices()).toEqual({ claimed: 1, sent: 2, skipped: 0, failed: 0 });
    const resend = fetchMock.mock.calls.find(([url]) => String(url).includes("resend"))!;
    expect(JSON.parse(String((resend[1] as RequestInit).body))).toMatchObject({
      from: "Pura Line <hello@pura.com>",
      to: ["sara@example.com"],
    });
    const pulse = fetchMock.mock.calls.find(([url]) => String(url).includes("smtp/emails"))!;
    expect(JSON.parse(String((pulse[1] as RequestInit).body)).email.to).toEqual([
      { email: "owner@pura.com", name: "Owner" },
      { email: "ops@pura.com" },
    ]);
    expect(calls).toContainEqual([
      "finish_gift_card_purchase_event",
      { p_event_id: "ev1", p_error: null },
    ]);
  });

  it("skips a mailbox the store has not set up, and keeps a failed send to be tried again", async () => {
    let calls = server([event()], {});
    vi.stubGlobal("fetch", vi.fn());
    expect(await processGiftCardNotices()).toEqual({ claimed: 1, sent: 0, skipped: 2, failed: 0 });

    calls = server([event()], MAILBOXES);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("resend")
          ? new Response("down", { status: 500 })
          : new Response(JSON.stringify({ access_token: "tok" })),
      ),
    );
    expect(await processGiftCardNotices()).toMatchObject({ failed: 1, sent: 1 });
    const finish = calls.find(([name]) => name === "finish_gift_card_purchase_event")!;
    expect(String(finish[1].p_error)).toMatch(/Resend 500/);
  });
});
