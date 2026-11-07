import type { Post, Sticker } from "../lib/types";

/**
 * One Piece card for each piece on sale. The character is ours and a draft for the owner's eye; what
 * a piece is for comes from its own description in the store. The name is the store's, the price is
 * the store's ({full:...}), and a card whose piece has left the store is not listed.
 */
type Card = {
  key: string;
  name: string;
  tone: string;
  character: string;
  suits: string;
  notFor: string;
  hook: string;
  /** Sold from stock, so no making time is said. */
  ready?: boolean;
  sticker?: Sticker;
};

const CARDS: Card[] = [
  {
    key: "cloud",
    name: "عباية كلاود",
    tone: "cream",
    character: "هادية وتاخذ راحتها بالكلوش",
    suits: "الطلعات والعزايم",
    notFor: "اللي تقول ما عندي شي ألبسه",
    hook: "كحلي راقي وكلوش يفوز، وربطة من النص إذا تبين.",
  },
  {
    key: "naqsh",
    name: "عباية نَقش",
    tone: "wine",
    character: "ناعمة وتحب التفاصيل",
    suits: "المناسبات",
    notFor: "اللي ما تحب أحد يسألها: من وين؟",
    hook: "دانتيل ناعم على الأكمام والواجهة.",
  },
  {
    key: "sabeeka",
    name: "عباية سَبيكة",
    tone: "sand",
    character: "مرتبة وما تحتاج تعريف",
    suits: "يومش العادي",
    notFor: "اللي تاخذ ساعة تختار شتلبس",
    hook: "أزرار وتصميم بسيط، وأناقة هادية.",
  },
  {
    key: "ghala",
    name: "عباية غَلا",
    tone: "cream",
    character: "ناعمة وتعرف تربط الموضوع",
    suits: "المشاوير اليومية",
    notFor: "اللي تربط كل شي ع الراتب",
    hook: "ربطة ناعمة تعطي العباية لمسة أنيقة.",
  },
  {
    key: "tayf",
    name: "فستان طَيف",
    tone: "ink",
    character: "تشتغل من ورا الكواليس",
    suits: "تحت العباية في كل مناسبة",
    notFor: "اللي تخلي الفستان في الدولاب",
    hook: "فستان داخلي يكمل إطلالتش.",
    ready: true,
  },
  {
    key: "lujain",
    name: "فستان لُجَين",
    tone: "sand",
    character: "باردة الأعصاب وملمسها حرير",
    suits: "تحت العباية ليوم طويل",
    notFor: "اللي تدور شي يحر",
    hook: "بيج أملس بإحساس حريري بارد ومريح تحت العباية.",
  },
  {
    key: "nasaq",
    name: "عباية نَسَق",
    tone: "wine",
    character: "توصل الدوام قبل المدير",
    suits: "الدوام والمشاوير",
    notFor: "اللي ما تحب الجيوب",
    hook: "خياطة بارزة وأغطية جيوب، ومرتبة طول اليوم.",
  },
  {
    key: "yaqoot",
    name: "عباية ياقوت",
    tone: "ink",
    character: "جريئة بهدوء",
    suits: "اللي ملّت من الأسود شوي",
    notFor: "اللي تقول: الأسود وبس",
    hook: "بنفسجي داكن فاخر وزر ذهبي.",
  },
  {
    key: "danah",
    name: "عباية دانة",
    tone: "cream",
    character: "رسمية وتدخل الاجتماع قبلش",
    suits: "الدوام والإطلالة الرسمية",
    notFor: "اللي تبي تختفي في الاجتماع",
    hook: "بليزر كلاسيكية بتطريز خطوط طولية.",
  },
  {
    key: "iqd",
    name: "عباية عِقد",
    tone: "wine",
    character: "تلفت النظر بأدب",
    suits: "المناسبات",
    notFor: "اللي تدور شي عادي",
    hook: "سوداء بعقد قماشية وأربطة من قدام.",
  },
  {
    key: "sahab",
    name: "عباية سَحاب",
    tone: "sand",
    character: "بسيطة وما تتكلم واجد",
    suits: "كل يوم تقريباً",
    notFor: "اللي تحب الزحمة في التفاصيل",
    hook: "هدوء السواد ونعومة الخيوط.",
  },
  {
    key: "marjan",
    name: "عباية مَرجان",
    tone: "cream",
    character: "تحب الرفقة الحلوة",
    suits: "فوق فستان ناعم",
    notFor: "اللي تطلع بدون ما تجهز",
    hook: "تطلع أجمل مع فستان أو قطعة ناعمة تحتها.",
  },
  {
    key: "half-bisht",
    name: "عباية نص بشت",
    tone: "wine",
    character: "نص رسمية ونص على راحتها",
    suits: "اليوم العادي والمناسبة",
    notFor: "اللي تبي البشت كامل",
    hook: "خلق مخطط يعطيها لمسة فخمة، وقصة عملية.",
  },
  {
    key: "two-tone",
    name: "عباية لونين",
    tone: "sand",
    character: "ما قدرت تختار فأخذت لونين",
    suits: "المناسبات",
    notFor: "اللي تقرر من أول مرة",
    hook: "خلق ثاني من تحت وفي الأكمام.",
  },
  {
    key: "new-blazer",
    name: "عباية بليزر جديد",
    tone: "ink",
    character: "عملية وأنيقة بنفس الوقت",
    suits: "الدوام والإطلالة الرسمية",
    notFor: "اللي تبي عذر عشان ما تداوم",
    hook: "موديل بسيط، وتقدرين تضيفين قطعة للصدر على رغبتش.",
  },
  {
    key: "tie",
    name: "عباية ربطة",
    tone: "cream",
    character: "خفيفة وترتب اليوم",
    suits: "كل الطلعات",
    notFor: "اللي تدور عذر عشان ما تطلع",
    hook: "سوداء ناعمة وخفيفة، ومرتبة في اللبس.",
  },
];

export const PIECE_CARDS: Post[] = CARDS.map((card) => ({
  key: `piece-${card.key}`,
  series: "كرت القطعة",
  title: card.name,
  tpl: "piece",
  tone: card.tone,
  size: "post",
  head: card.name,
  items: `شخصيتها: ${card.character}\nتناسب: ${card.suits}\nما تناسب: ${card.notFor}`,
  label: `{full:${card.key}}`,
  photo1: card.key,
  stickers: card.sticker ? [card.sticker] : [],
  caption: `${card.hook}\n{price:${card.key}}\n${card.ready ? "" : "{making}"}الرابط في البايو 🖤`,
}));
