import { describe, it, expect } from "vitest";
import { DEFAULT_VOCABULARY, resolveVocabulary } from "../src/lib/store-vocabulary";
import { FASHION_VOCABULARY } from "../src/addons/fashion-core/vocabulary";

describe("Store Vocabulary Resolution", () => {
  it("provides vanilla defaults with no fashion-specific terms", () => {
    expect(DEFAULT_VOCABULARY.workshop.ar).toBe("الورشة");
    expect(DEFAULT_VOCABULARY.workshop.en).toBe("Workshop");
    expect(DEFAULT_VOCABULARY.sent_to_workshop.ar).toBe("تم الإرسال للورشة");
    expect(DEFAULT_VOCABULARY.sent_to_workshop.en).toBe("Sent to Workshop");
    expect(DEFAULT_VOCABULARY.custom_order.ar).toBe("حسب الطلب");
    expect(DEFAULT_VOCABULARY.custom_order.en).toBe("Made to order");
  });

  it("resolves fashion vocabulary verbatim when fashion-core contributes overrides", () => {
    const vocab = resolveVocabulary(DEFAULT_VOCABULARY, FASHION_VOCABULARY);
    expect(vocab.workshop.ar).toBe("الخياط");
    expect(vocab.workshop.en).toBe("Tailor");
    expect(vocab.sent_to_workshop.ar).toBe("تم الإرسال للخياط");
    expect(vocab.sent_to_workshop.en).toBe("Sent to Tailor");
    expect(vocab.custom_order.ar).toBe("تفصيل");
    expect(vocab.custom_order.en).toBe("Tailoring");
    expect(vocab.customization_options.ar).toBe("خيارات التخصيص والمقاسات (التفصيل)");
    expect(vocab.workshop_instructions.ar).toBe("تعليمات للمشغل");
    expect(vocab.workshop_notes_label.ar).toBe("ملاحظات وتفاصيل التفصيل والخياط:");
  });

  it("handles null or undefined overrides gracefully", () => {
    const vocab = resolveVocabulary(DEFAULT_VOCABULARY, undefined, null);
    expect(vocab.workshop.ar).toBe("الورشة");
    expect(vocab.workshop.en).toBe("Workshop");
  });
});
