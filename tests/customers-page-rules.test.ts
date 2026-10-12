import { describe, expect, it } from "vitest";
import { parseVCard } from "../src/features/customers/lib/vcard";
import { CUSTOMER_HEADER_MAPS } from "../src/features/customers/lib/customer-header-maps";
import { oldestFirst } from "../src/features/customers/lib/customers-shared";

// The small rules the customers page held inline: reading contact cards shared from a phone, the
// column names its importer recognises, and the order the edit dialog lists addresses in.

describe("contact cards shared from a phone", () => {
  it("reads each card's name, phone and email", () => {
    const cards = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Sara Ali",
      "TEL;TYPE=CELL:+973 3900-0001",
      "EMAIL;TYPE=HOME:sara@example.com",
      "END:VCARD",
      "BEGIN:VCARD",
      "N:Mahmood;Fatima;;;",
      "TEL:39000002",
      "END:VCARD",
    ].join("\r\n");
    expect(parseVCard(cards)).toEqual([
      { name: "Sara Ali", phone: "+97339000001", email: "sara@example.com" },
      { name: "Fatima Mahmood", phone: "39000002", email: null },
    ]);
  });

  it("prefers the full name over the name parts, and names a card that has none", () => {
    const named = "BEGIN:VCARD\nFN:Noura\nN:Other;Name\nEND:VCARD";
    expect(parseVCard(named)[0].name).toBe("Noura");
    const unnamed = "BEGIN:VCARD\nTEL:97339000003\nEND:VCARD";
    expect(parseVCard(unnamed)).toEqual([
      { name: "WhatsApp Contact", phone: "97339000003", email: null },
    ]);
  });

  it("skips a card with nothing in it, and text that is not a card", () => {
    expect(parseVCard("BEGIN:VCARD\nVERSION:3.0\nEND:VCARD")).toEqual([]);
    expect(parseVCard("")).toEqual([]);
  });
});

describe("the columns the customer importer recognises", () => {
  it("knows each field by several names, all in lower case", () => {
    for (const names of Object.values(CUSTOMER_HEADER_MAPS)) {
      expect(names.length).toBeGreaterThan(1);
      for (const name of names) expect(name).toBe(name.toLowerCase());
    }
    expect(Object.keys(CUSTOMER_HEADER_MAPS)).toEqual(expect.arrayContaining(["name", "phone"]));
  });

  it("gives no column name to two fields", () => {
    const all = Object.values(CUSTOMER_HEADER_MAPS).flat();
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("a customer's addresses in the edit dialog", () => {
  it("are listed oldest first, without changing the list they came from", () => {
    const addresses = [
      { id: "b", created_at: "2026-03-01T00:00:00Z" },
      { id: "a", created_at: "2026-01-01T00:00:00Z" },
      { id: "c", created_at: "2026-02-01T00:00:00Z" },
    ] as Parameters<typeof oldestFirst>[0];
    expect(oldestFirst(addresses).map((address) => address.id)).toEqual(["a", "c", "b"]);
    expect(addresses.map((address) => address.id)).toEqual(["b", "a", "c"]);
  });
});
