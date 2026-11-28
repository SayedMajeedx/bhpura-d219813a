import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyGiftSchedule,
  giftDue,
  giftScheduleLine,
  schedulePayload,
  scheduleProblem,
  type GiftSchedule,
} from "../src/lib/gift-schedule";
import { giftDueNotices, type NoticeEvent } from "../src/lib/gift-card-notices";
import { orderStep } from "../src/features/gift-cards/lib/card-orders";
import type { GiftCardPurchase } from "../src/lib/data/gift-cards";

// A gift that arrives when the buyer chooses (migration 20261230100000): what the buyer may pick,
// what reaches the person it is for by email at that time, and what the store sends by hand.
// The database's side is tests/gift-card-scheduled-migration.test.ts.

const state = vi.hoisted(() => ({ admin: null as unknown }));
const adminClient = {
  get supabaseAdmin() {
    return state.admin;
  },
};
vi.mock("../src/integrations/supabase/client.server", () => adminClient);
vi.mock("@/integrations/supabase/client.server", () => adminClient);

const NOW = new Date("2026-12-01T10:00:00");
const later = (over: Partial<GiftSchedule> = {}): GiftSchedule => ({
  ...emptyGiftSchedule(),
  mode: "later",
  date: "2026-12-12",
  time: "09:00",
  email: "noor@example.com",
  ...over,
});

describe("what the buyer may pick", () => {
  it("is nothing to check when the buyer sends the gift now", () => {
    expect(scheduleProblem(emptyGiftSchedule(), NOW)).toBeNull();
    expect(schedulePayload(emptyGiftSchedule())).toBeUndefined();
  });

  it("is a day and time from a quarter of an hour ahead to a year", () => {
    expect(scheduleProblem(later(), NOW)).toBeNull();
    expect(scheduleProblem(later({ date: "2026-12-01", time: "10:05" }), NOW)).toBe("when");
    expect(scheduleProblem(later({ date: "2027-12-12" }), NOW)).toBe("when");
    expect(scheduleProblem(later({ date: "" }), NOW)).toBe("when");
  });

  it("needs their email, or their WhatsApp number", () => {
    expect(scheduleProblem(later({ email: "noor@" }), NOW)).toBe("email");
    expect(scheduleProblem(later({ channel: "whatsapp", phone: "123" }), NOW)).toBe("phone");
    expect(
      scheduleProblem(later({ channel: "whatsapp", phone: "+973 3999 0001" }), NOW),
    ).toBeNull();
  });

  it("is sent to the server as one moment, with only the way it goes", () => {
    const sent = schedulePayload(later());
    expect(sent).toEqual({
      at: new Date("2026-12-12T09:00:00").toISOString(),
      channel: "email",
      email: "noor@example.com",
    });
    expect(schedulePayload(later({ channel: "whatsapp", phone: "+97339990001" }))).toMatchObject({
      channel: "whatsapp",
      phone: "+97339990001",
    });
  });
});

describe("where a scheduled gift stands", () => {
  const scheduled = {
    status: "paid",
    send_at: "2026-12-12T06:00:00Z",
    send_channel: "email",
    recipient_email: "noor@example.com",
    recipient_phone: null,
    recipient_sent_at: null as string | null,
  };

  it("says when and how it arrives, then that it was sent", () => {
    expect(giftScheduleLine(scheduled, "en")).toMatch(
      /^Arrives by email to noor@example\.com on 12 Dec at /,
    );
    expect(
      giftScheduleLine(
        { ...scheduled, send_channel: "whatsapp", recipient_phone: "+97339990001" },
        "ar",
      ),
    ).toMatch(/^يرسلها المتجر على واتساب إلى \+97339990001 يوم /);
    expect(
      giftScheduleLine({ ...scheduled, recipient_sent_at: "2026-12-12T06:00:30Z" }, "en"),
    ).toMatch(/^Sent to noor@example\.com on /);
    expect(giftScheduleLine({ send_at: null }, "en")).toBeNull();
  });

  it("is the store's to send by hand: on WhatsApp at its time, by email only when the system could not", () => {
    const at = new Date("2026-12-12T06:00:00Z");
    const plus = (minutes: number) => new Date(at.getTime() + minutes * 60_000);
    const whatsapp = { ...scheduled, send_channel: "whatsapp", recipient_phone: "+97339990001" };
    expect(giftDue(whatsapp, plus(-1))).toBeNull();
    expect(giftDue(whatsapp, plus(0))).toBe("whatsapp");
    expect(giftDue(scheduled, plus(10))).toBeNull();
    expect(giftDue(scheduled, plus(31))).toBe("email");
    expect(giftDue({ ...whatsapp, recipient_sent_at: plus(1).toISOString() }, plus(5))).toBeNull();
    expect(giftDue({ ...whatsapp, status: "pending" }, plus(5))).toBeNull();

    const purchase = { ...whatsapp, gift_cards: { code: "X", expires_on: null, share_token: "t" } };
    expect(orderStep(purchase as unknown as GiftCardPurchase, plus(5))).toBe("send_gift");
    expect(orderStep(purchase as unknown as GiftCardPurchase, plus(-5))).toBeNull();
  });
});

const dueEvent = (over: Partial<NoticeEvent> = {}): NoticeEvent => ({
  event_id: "ev9",
  event: "gift_due",
  purchase_id: "00000000-0000-4000-8000-0000000000c1",
  brand_id: "b1",
  slug: "pura",
  store_name: "Pura Line",
  sender_name: null,
  amount: 50,
  currency: "BHD",
  payment_method: "card",
  delivery_channel: "whatsapp",
  lang: "en",
  buyer_name: "Sara",
  buyer_phone: "+97339990001",
  buyer_email: "sara@example.com",
  recipient_name: "Noor",
  message: "Happy birthday",
  cancel_reason: null,
  token: "t".repeat(64),
  code: "ABCD-EFGH-JKMN",
  expires_on: null,
  send_at: "2026-12-12T06:00:00Z",
  send_channel: "email",
  recipient_email: "noor@example.com",
  gift_from: "Sara",
  gift_token: "ab".repeat(32),
  ...over,
});

describe("a due gift's emails", () => {
  it("send the gift link to the person it is for, never the code, and tell the buyer", () => {
    const { toRecipient, toBuyer } = giftDueNotices(dueEvent());
    expect(toRecipient?.to).toBe("noor@example.com");
    expect(toRecipient?.html).toContain(`https://pura.boutq.store/pura/gift/${"ab".repeat(32)}`);
    expect(toRecipient?.text).toContain("Sara sent you a gift card from Pura Line.");
    expect(toRecipient?.html).not.toContain("ABCD-EFGH-JKMN");
    expect(toBuyer?.to).toBe("sara@example.com");
    expect(toBuyer?.text).toContain("We sent the gift link to noor@example.com");
  });

  it("name no giver the buyer did not write on the card, and tell no buyer with no email", () => {
    const { toRecipient, toBuyer } = giftDueNotices(
      dueEvent({ gift_from: null, buyer_email: null }),
    );
    expect(toRecipient?.text).toContain("You have a gift card from Pura Line.");
    expect(toRecipient?.text).not.toContain("Sara");
    expect(toBuyer).toBeNull();
    expect(giftDueNotices(dueEvent({ gift_token: null })).toRecipient).toBeNull();
  });
});

const { processGiftCardNotices } = await import("../src/lib/gift-card-notices.server");

describe("the worker", () => {
  type Call = [string, Record<string, unknown>];
  function server(events: NoticeEvent[], mailbox: boolean) {
    const calls: Call[] = [];
    state.admin = {
      rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
        calls.push([name, args]);
        if (name === "claim_gift_card_purchase_events") return { data: events, error: null };
        if (name === "get_integration_credential_secret") {
          return {
            data: mailbox
              ? [{ is_active: true, api_key: "re_key", base_url: "hello@pura.com" }]
              : [],
            error: null,
          };
        }
        return { data: null, error: null };
      }),
      from: vi.fn(),
    };
    return calls;
  }

  beforeEach(() => vi.unstubAllGlobals());

  it("queues the gifts that are due first, sends both emails, and records the gift sent", async () => {
    const calls = server([dueEvent()], true);
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await processGiftCardNotices()).toEqual({ claimed: 1, sent: 2, skipped: 0, failed: 0 });
    expect(calls[0][0]).toBe("enqueue_due_gift_sends");
    const sentTo = fetchMock.mock.calls.map(
      (call) => JSON.parse(String((call as unknown as [string, RequestInit])[1].body)).to[0],
    );
    expect(sentTo).toEqual(["noor@example.com", "sara@example.com"]);
    expect(calls).toContainEqual([
      "finish_gift_card_purchase_event",
      {
        p_event_id: "ev9",
        p_error: null,
        p_customer_done: true,
        p_store_done: true,
        p_gift_sent: true,
      },
    ]);
  });

  it("never records a gift sent when the store has no mailbox", async () => {
    const calls = server([dueEvent()], false);
    vi.stubGlobal("fetch", vi.fn());
    await processGiftCardNotices();
    expect(calls.find(([name]) => name === "finish_gift_card_purchase_event")![1]).toMatchObject({
      p_gift_sent: false,
    });
  });
});
