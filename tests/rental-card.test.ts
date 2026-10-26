import { describe, expect, it } from "vitest";
import {
  addOnLines,
  descriptionLead,
  rentalPhotoRatio,
} from "../src/features/services-home/lib/rental-card";
import type { ServiceOption } from "../src/lib/bookings/service-options";

// A rental card's rules (Aurora's booths, 2026-10-26): its photo's shape, its few words, and its
// add-ons with what each costs.

const option = (over: Partial<ServiceOption>): ServiceOption =>
  ({
    id: over.name_en ?? "o",
    product_id: "booth",
    name_en: "Option",
    name_ar: null,
    description_en: null,
    description_ar: null,
    mode: "optional",
    price: 0,
    tiers: null,
    max_quantity: null,
    is_active: true,
    sort_order: 0,
    ...over,
  }) as ServiceOption;

describe("a rental's photo", () => {
  it("stands 3:4 unless the store chose its own shape", () => {
    // The services vertical's wide frame showed a standing booth's middle half.
    expect(rentalPhotoRatio(null)).toBe("3:4");
    expect(rentalPhotoRatio({ product_card_aspect_ratio: null })).toBe("3:4");
    expect(rentalPhotoRatio({ product_card_aspect_ratio: "1:1" })).toBe("1:1");
    expect(rentalPhotoRatio({ product_card_aspect_ratio: "16:9" })).toBe("3:4");
  });
});

describe("a rental's few words", () => {
  it("are its description's first paragraph in the reader's language", () => {
    const booth = {
      description: null,
      description_ar: "منصة تصوير بكاميرا احترافية.\n\nكل ساعة إضافية 18 د.ب",
      description_en: "A complete photobooth.\nEach extra hour: 18 BHD",
    };
    expect(descriptionLead(booth, true)).toBe("منصة تصوير بكاميرا احترافية.");
    expect(descriptionLead(booth, false)).toBe("A complete photobooth.");
    expect(descriptionLead({ ...booth, description_en: null }, false)).toBe(
      "منصة تصوير بكاميرا احترافية.",
    );
    expect(
      descriptionLead({ description: null, description_ar: null, description_en: null }, true),
    ).toBe("");
  });
});

describe("a rental's add-ons", () => {
  it("say what each costs, what comes with every booking first", () => {
    const lines = addOnLines(
      [
        option({ name_en: "Magnets", mode: "optional", price: 25 }),
        option({ name_en: "Envelopes", mode: "optional", tiers: { step: 50, prices: [15, 12.5] } }),
        option({ name_en: "Attendant", mode: "required", price: 15 }),
        option({ name_en: "Setup", mode: "included", price: 99 }),
        option({ name_en: "Instant prints", mode: "default_on", price: 30 }),
      ],
      false,
    );
    expect(lines.map((line) => [line.name, line.price, line.from, line.always])).toEqual([
      ["Setup", null, false, true],
      ["Attendant", 15, false, true],
      ["Instant prints", 30, false, false],
      ["Magnets", 25, false, false],
      // A block's price, "from 15".
      ["Envelopes", 15, true, false],
    ]);
  });

  it("are named in the reader's language", () => {
    const [line] = addOnLines([option({ name_en: "Prints", name_ar: "طباعة", price: 30 })], true);
    expect(line.name).toBe("طباعة");
  });
});
