import type { AddonShowcaseItem } from "./addon-showcase-types";

/** What the add-on store says about a private add-on, seen only by the platform's owner and the store that has it. */
export const POST_KIT_SHOWCASE: AddonShowcaseItem = {
  id: "post-kit",
  tagline: {
    ar: "بوستات جاهزة بلهجة المتجر، بصوره وأسعاره",
    en: "Ready posts in the store's voice, with its photos and prices",
  },
  categoryLabel: { ar: "إضافة خاصة", en: "Private add-on" },
  publisher: { ar: "فريق Boutq المعتمد", en: "Boutq Official Studio" },
  highlights: [
    { ar: "صفحة بوستات داخل استوديو المحتوى", en: "A page of posts in the content studio" },
    { ar: "الصور والأسعار من المتجر مباشرة", en: "Photos and prices read live from the store" },
  ],
  fullOverview: {
    ar: "إضافة خاصة بمتجر واحد: بوستاته وكابشناته جاهزة، يعدلها فريقه ويحملها صورًا.",
    en: "One store's own add-on: its posts and captions, ready for its team to edit and save.",
  },
  keyFeatures: [
    {
      icon: "Sticker",
      title: { ar: "بوستات جاهزة", en: "Ready posts" },
      description: {
        ar: "تتعدل بالكلام والألوان والصور والستيكرات.",
        en: "Edit the words, colours, photos and stickers.",
      },
    },
  ],
  workflowSteps: [
    {
      step: 1,
      title: { ar: "افتح استوديو المحتوى", en: "Open the content studio" },
      description: { ar: "اضغط عدّة البوستات.", en: "Choose the post kit." },
    },
  ],
  faqs: [],
  previewMockup: {
    storefront: {
      title: { ar: "لا يظهر للمتسوقين", en: "Not shown to shoppers" },
      subtitle: { ar: "صفحة للفريق فقط", en: "A page for the team" },
      bullets: [],
    },
    admin: {
      title: { ar: "عدّة البوستات", en: "Post kit" },
      subtitle: { ar: "داخل استوديو المحتوى", en: "In the content studio" },
      bullets: [],
    },
  },
};
