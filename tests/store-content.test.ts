import { describe, expect, it } from "vitest";
import {
  EMPTY_FAQ_FORM,
  EMPTY_GALLERY_FORM,
  captionText,
  faqColumns,
  faqFormError,
  faqFormFrom,
  faqText,
  galleryColumns,
  galleryFormError,
  groupFaqs,
  moveItem,
  nextSortOrder,
  type FaqItem,
} from "../src/lib/store-content";

const faq = (over: Partial<FaqItem>): FaqItem => ({
  id: "q",
  group_en: null,
  group_ar: null,
  question_en: "Q",
  question_ar: null,
  answer_en: "A",
  answer_ar: null,
  sort_order: 0,
  is_active: true,
  ...over,
});

describe("a store's gallery and FAQ rules", () => {
  it("reads a caption or question in the reader's language, falling back to the other", () => {
    expect(captionText({ caption_en: "Wedding", caption_ar: "زفاف" }, true)).toBe("زفاف");
    expect(captionText({ caption_en: "Wedding", caption_ar: " " }, true)).toBe("Wedding");
    expect(captionText({ caption_en: null, caption_ar: null }, false)).toBe("");
    expect(faqText(faq({ question_ar: "سؤال" }), "question", true)).toBe("سؤال");
    expect(faqText(faq({}), "question", true)).toBe("Q");
  });

  it("groups the active questions in order under their headings", () => {
    const groups = groupFaqs(
      [
        faq({ id: "3", group_en: "Payment", question_en: "Deposit?", sort_order: 3 }),
        faq({ id: "1", group_en: "Booking", question_en: "How?", sort_order: 1 }),
        faq({ id: "2", group_en: "Booking", question_en: "Move it?", sort_order: 2 }),
        faq({
          id: "4",
          group_en: "Booking",
          question_en: "Hidden",
          sort_order: 0,
          is_active: false,
        }),
        faq({ id: "5", question_en: null, question_ar: null, sort_order: 4 }),
        faq({ id: "6", question_en: "General", sort_order: 5 }),
      ],
      false,
    );
    expect(groups.map((group) => [group.title, group.items.map((item) => item.id)])).toEqual([
      ["Booking", ["1", "2"]],
      ["Payment", ["3"]],
      ["", ["6"]],
    ]);
    // Arabic reading falls back to the English group name.
    expect(groupFaqs([faq({ group_en: "Booking" })], true)[0].title).toBe("Booking");
  });

  it("moves an item one place and renumbers", () => {
    const items = [
      { id: "a", sort_order: 5 },
      { id: "b", sort_order: 9 },
      { id: "c", sort_order: 12 },
    ];
    expect(moveItem(items, "b", -1)).toEqual([
      { id: "b", sort_order: 0 },
      { id: "a", sort_order: 1 },
      { id: "c", sort_order: 2 },
    ]);
    expect(moveItem(items, "a", -1)).toBeNull();
    expect(moveItem(items, "c", 1)).toBeNull();
    expect(moveItem(items, "zzz", 1)).toBeNull();
    expect(nextSortOrder(items)).toBe(13);
    expect(nextSortOrder([])).toBe(0);
  });

  it("will not save a picture without an image or a question without an answer", () => {
    expect(galleryFormError(EMPTY_GALLERY_FORM, false)).toMatch(/picture/);
    expect(
      galleryFormError({ ...EMPTY_GALLERY_FORM, image_url: "https://x/y.jpg" }, false),
    ).toBeNull();
    expect(
      galleryColumns({
        ...EMPTY_GALLERY_FORM,
        image_url: " u ",
        caption_en: "  ",
        caption_ar: "ع",
      }),
    ).toEqual({ image_url: "u", caption_en: null, caption_ar: "ع", is_active: true });

    expect(faqFormError(EMPTY_FAQ_FORM, false)).toMatch(/question/);
    expect(faqFormError({ ...EMPTY_FAQ_FORM, question_ar: "سؤال" }, true)).toBe("اكتب الإجابة.");
    // One language is enough.
    const form = { ...EMPTY_FAQ_FORM, question_ar: "سؤال", answer_ar: "جواب" };
    expect(faqFormError(form, false)).toBeNull();
    expect(faqColumns(form)).toMatchObject({
      question_en: null,
      question_ar: "سؤال",
      group_en: null,
      is_active: true,
    });
    expect(faqFormFrom(faq({ group_en: "G", answer_ar: "ج" }))).toMatchObject({
      group_en: "G",
      answer_ar: "ج",
      question_ar: "",
    });
  });
});
