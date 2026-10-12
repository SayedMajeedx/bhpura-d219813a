import { describe, expect, it } from "vitest";
import {
  campaignCsv,
  campaignMessage,
  eligibilityOf,
  eligibleAmong,
  filterAudience,
  segmentCountsOf,
  selectedRecipients,
  whatsappChatUrl,
  whatsappDigits,
} from "../src/features/campaigns/lib/campaign-audience";
import { isMarketingEligible } from "../src/lib/marketing-eligibility";

// Who a WhatsApp campaign reaches and what each of them is sent: the rules the campaigns page
// held inline, moved out as they were.

const customers = [
  { id: "c1", name: "Sara Ali", phone: "+973 3900 0001", marketing_consent: true },
  { id: "c2", name: "Fatima", phone: "97339000002", marketing_consent: true },
  { id: "c3", name: "Noura", phone: null, marketing_consent: true },
  { id: "c4", name: "Maryam", phone: "97339000004", opted_out_at: "2026-10-01T00:00:00Z" },
];
const stats = new Map([
  ["c1", { badge: "VIP", totalOrders: 6 }],
  ["c2", { badge: "New Buyer", totalOrders: 1 }],
  ["c4", { badge: "VIP", totalOrders: 4 }],
]);

describe("the audience", () => {
  it("is everyone for the whole list, and one badge's customers for a segment", () => {
    const of = (segment: "All" | "VIP" | "Churn Risk" | "New Buyer") =>
      filterAudience(customers, stats, { search: "", segment }).map((c) => c.id);
    expect(of("All")).toEqual(["c1", "c2", "c3", "c4"]);
    expect(of("VIP")).toEqual(["c1", "c4"]);
    expect(of("New Buyer")).toEqual(["c2"]);
    expect(of("Churn Risk")).toEqual([]);
  });

  it("is narrowed by a name or a phone, in any case, inside the segment", () => {
    const search = (text: string, segment: "All" | "VIP" = "All") =>
      filterAudience(customers, stats, { search: text, segment }).map((c) => c.id);
    expect(search("  SARA ")).toEqual(["c1"]);
    expect(search("9000002")).toEqual(["c2"]);
    expect(search("fatima", "VIP")).toEqual([]);
  });

  it("counts each segment over the whole list", () => {
    expect(segmentCountsOf(customers, stats)).toEqual({
      All: 4,
      VIP: 2,
      "Churn Risk": 0,
      "New Buyer": 1,
    });
  });
});

describe("who may be sent marketing", () => {
  it("is decided by the one eligibility rule, with the customer's own order count", () => {
    for (const customer of customers) {
      expect(eligibilityOf(customer, stats)).toEqual(
        isMarketingEligible(customer, stats.get(customer.id)?.totalOrders ?? 0),
      );
    }
    expect(eligibilityOf(customers[2], stats).eligible).toBe(false);
    expect(eligibilityOf(customers[3], stats).eligible).toBe(false);
  });

  it("keeps the eligible, and of the ticked only the eligible", () => {
    const eligible = eligibleAmong(customers, stats).map((c) => c.id);
    expect(eligible).not.toContain("c3");
    expect(eligible).not.toContain("c4");
    const recipients = selectedRecipients(customers, ["c1", "c3", "c4"], stats).map((c) => c.id);
    expect(recipients).toEqual(eligible.includes("c1") ? ["c1"] : []);
    expect(selectedRecipients(customers, [], stats)).toEqual([]);
  });
});

describe("what a customer is sent", () => {
  it("is the message with every placeholder filled in", () => {
    const template = "Hi {{customer_name}}, {{business_name}} here. {{customer_name}}!";
    expect(campaignMessage(template, "Sara", "Pura")).toBe("Hi Sara, Pura here. Sara!");
    expect(campaignMessage(template, "", "")).toBe("Hi ,  here. !");
  });

  it("opens their WhatsApp chat by digits only, and is nothing without a phone", () => {
    expect(whatsappDigits("+973 3900-0001")).toBe("97339000001");
    expect(whatsappDigits(null)).toBe("");
    expect(whatsappChatUrl(customers[0], "Hi Sara & co")).toBe(
      "https://wa.me/97339000001?text=Hi%20Sara%20%26%20co",
    );
    expect(whatsappChatUrl(customers[2], "Hi")).toBeNull();
  });
});

describe("the recipients file", () => {
  it("has a line per recipient with their own message, quoted, after a byte order mark", () => {
    const csv = campaignCsv(customers.slice(0, 2), (name) => `Hi ${name}, "sale" today`);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split("\n")).toEqual([
      "Phone,Name,Message",
      '"97339000001","Sara Ali","Hi Sara Ali, ""sale"" today"',
      '"97339000002","Fatima","Hi Fatima, ""sale"" today"',
    ]);
  });

  it("is only its heading for nobody", () => {
    expect(campaignCsv([], () => "x").slice(1)).toBe("Phone,Name,Message");
  });
});
