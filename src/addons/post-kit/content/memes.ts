import type { Post } from "../lib/types";

/*
 * Ready meme posts in Pura's voice (the feminine ending ش). Their photo slots are empty on purpose:
 * each post's note says which reaction goes in which slot. The kit's own content names no famous
 * face and borrows no known meme picture; the store's own reaction photos (hands, Shammoua, a
 * face if it likes) suit them best, and are its own.
 */

const SERIES = "ميمز بيورا";
const REEL = "ريل ميم";

const meme = (post: Omit<Post, "series" | "size" | "stickers"> & Partial<Post>): Post => ({
  series: SERIES,
  size: "post",
  stickers: [],
  ...post,
});

export const MEME_POSTS: Post[] = [
  meme({
    key: "meme-business",
    title: "شلون كنت أفكر / شلون صرت",
    tpl: "memeStack",
    tone: "wine",
    labelA: "شلون كنت أفكر",
    lead: "بصير عقب ما أفتح البزنس",
    labelB: "شلون صرت",
    foot: "",
    stickers: [
      { id: "torn-paper", x: 0.76, y: 0.74, s: 340, r: -6, text: "هذا أنا" },
      { id: "arrow-curve", x: 0.74, y: 0.85, s: 220, r: 150 },
    ],
    caption: "كل صاحبة مشروع تعرف هالشعور 😂🖤\nمنشني صديقتش اللي عندها مشروع.",
    note: "الصورة الأولى: وجه رايق ومبتسم، مع قهوة أو نظارة شمسية. الثانية: نفس الشخص تعبان بين القماش والأكياس. صوركم أنتم أحلى من أي صورة من النت.",
  }),
  meme({
    key: "meme-reply-later",
    title: "بفكر وأرد عليكم",
    tpl: "memeStack",
    tone: "cream",
    labelA: "الزبونة:",
    lead: "بفكر وأرد عليكم",
    labelB: "أنا بعد ثلاث أيام:",
    foot: "لسه أطالع التلفون",
    caption: "ولا يهمش، العباية تنتظرش 😂🖤\nالرابط في البايو.",
    note: "الصورة الأولى: تلفون فيه رسالة، أو يد تكتب. الثانية: وجه ينتظر جنب التلفون، أو شمّوعة جالسة تنتظر.",
  }),
  meme({
    key: "meme-2am",
    title: "محد: / أنا الساعة 2 الفجر",
    tpl: "memeCaption",
    tone: "wine",
    head: "محد:\nأنا الساعة 2 الفجر أطالع العبايات اللي في السلة:",
    caption: "السلة تنتظرش، كمّلي الطلب 😂🖤\nمنشني اللي تتسوق بالليل.",
    note: "الصورة: وجه منوّر بضوء التلفون في الظلام، أو يد ماسكة التلفون تحت البطانية.",
  }),
  meme({
    key: "meme-pov-bag",
    title: "POV: زوجش شاف الكيس",
    tpl: "memeCaption",
    tone: "sand",
    head: "POV: طلبتي عباية وزوجش شاف الكيس",
    caption: "قولي له: هذي من زمان 😂🖤\nمنشني اللي تخبي الكيس.",
    note: "الصورة: وجه مصدوم، أو يدين يخبون كيس بيورا ورا الظهر.",
  }),
  meme({
    key: "meme-payday",
    title: "يوم الراتب / بعد أسبوع",
    tpl: "memeSide",
    tone: "cream",
    labelA: "يوم الراتب",
    labelB: "بعد أسبوع من الراتب",
    caption: "الحل؟ اطلبي يوم الراتب 😂🖤\nالرابط في البايو.",
    note: "الصورة الأولى: شخص فرحان، أو يد ماسكة أكياس. الثانية: شخص يحسب بالحاسبة، أو محفظة فاضية.",
  }),
  meme({
    key: "meme-size",
    title: "لا: بدون مقاس / إي: على مقاسش",
    tpl: "memeNoYes",
    tone: "sand",
    labelA: "تشترين بدون ما تعرفين مقاسش",
    labelB: "تفصّلينها على مقاسش",
    caption: "عبايتش على مقاسش، بدون حظ 🖤\nالتفصيل والمقاسات في الموقع، الرابط في البايو.",
    note: "الصورة الأولى: عباية طويلة تسحب على الأرض، أو وجه محتار. الثانية: عباية بيورا مضبوطة على صاحبتها.",
  }),
  meme({
    key: "meme-occasion",
    title: "قبل المناسبة بشهر / بيوم",
    tpl: "memeStack",
    tone: "ink",
    labelA: "قبل المناسبة بشهر",
    lead: "عندي وقت",
    labelB: "قبل المناسبة بيوم",
    foot: "وين العباية؟!",
    caption: "اطلبي من وقت، والتفصيل له وقته 😂🖤\nمنشني اللي تتذكر يوم المناسبة.",
    note: "الصورة الأولى: وجه رايق. الثانية: وجه مستعجل، أو دولاب مفتوح ومقلوب.",
  }),
  meme({
    key: "meme-cart",
    title: "حطيت العباية في السلة",
    tpl: "memeClassic",
    tone: "wine",
    head: "حطيت العباية في السلة",
    foot: "وقعدت أفكر فيها أسبوع",
    caption: "لا تفكرين وايد، السلة تنتظرش 😂🖤\nالرابط في البايو.",
    note: "الصورة: وجه يفكر ويطالع بعيد، أو شمّوعة على شماعتها.",
  }),
  meme({
    key: "meme-in-mind",
    title: "العباية في بالي / من بيورا",
    tpl: "memeSide",
    tone: "wine",
    labelA: "العباية اللي في بالي",
    labelB: "العباية من بيورا",
    foot: "نفسها بالضبط",
    caption: "قولي لنا شنو في بالش، ونفصّلها 🖤\nالرابط في البايو.",
    note: "الصورة الأولى: رسمة بسيطة على ورقة، أو قماش ومقص. الثانية: العباية جاهزة من صوركم.",
  }),
  meme({
    key: "meme-mother",
    title: "POV: أمش تسأل «هذي جديدة؟»",
    tpl: "memeCaption",
    tone: "cream",
    head: "POV: أمش تسألش «هذي جديدة؟»",
    caption: "قولي لها: من زمان عندي 😂🖤\nمنشني اللي تسوي جذي.",
    note: "الصورة: وجه يبتسم ابتسامة متوترة، أو يد ماسكة العباية ورا الباب.",
  }),
  meme({
    key: "meme-wardrobe",
    title: "الكبت مليان عبايات",
    tpl: "memeClassic",
    tone: "ink",
    head: "الكبت مليان عبايات",
    foot: "وما عندي شي ألبسه",
    caption: "كلنا نفس الشي 😂🖤\nوالحل عباية جديدة، الرابط في البايو.",
    note: "الصورة: دولاب مفتوح مليان، أو وجه محتار قدامه.",
  }),
  meme({
    key: "meme-price",
    title: "لا: كم السعر؟ / إي: الموقع",
    tpl: "memeNoYes",
    tone: "cream",
    labelA: "تسألين «كم السعر؟» في الخاص وتنتظرين",
    labelB: "تشوفين السعر في الموقع وتطلبين",
    caption: "الأسعار والمقاسات كلها في الموقع 🖤\nالرابط في البايو.",
    note: "الصورة الأولى: وجه ينتظر جنب التلفون. الثانية: يد تطلب من التلفون، أو كيس بيورا.",
  }),
  meme({
    key: "meme-delivery",
    title: "أول ما أطلب / لما يوصل",
    tpl: "memeSide",
    tone: "sand",
    labelA: "أول ما أطلب",
    labelB: "لما يوصل الطلب",
    caption: "أحلى إحساس 🖤\nشاركينا صورة طلبش لما يوصل.",
    note: "الصورة الأولى: وجه ينتظر، أو تلفون فيه صفحة الطلب. الثانية: يدين تفتح كيس بيورا.",
  }),
  meme({
    key: "meme-free-best",
    title: "أحسن عباية لبستها",
    tpl: "free",
    tone: "wine",
    stickers: [
      {
        id: "text",
        x: 0.5,
        y: 0.32,
        s: 420,
        r: 0,
        text: "لما الزبونة تقول:\n«أحسن عباية لبستها»",
        look: "plain",
        color: "ink",
        align: "center",
      },
      { id: "arrow-loop", x: 0.36, y: 0.55, s: 260, r: 10 },
      { id: "burst", x: 0.62, y: 0.72, s: 380, r: -6, text: "إحنا:" },
    ],
    caption: "هذا اللي يخلينا نكمل 🤍\nشكراً لكل وحدة طلبت من عندنا.",
    note: "حطوا تحت «إحنا:» صورة رياكشن من «ستيكراتي»، وجه فرحان أو شمّوعة ترقص. لوحة حرة: كل شي يتحرك.",
  }),
];

/** The two beats of a meme reel: tall frames, the second cut in after a second and a half. */
export const MEME_REEL_POSTS: Post[] = [
  meme({
    key: "meme-reel-reply-1",
    series: REEL,
    size: "story",
    title: "ريل: بفكر وأرد عليكم (1)",
    tpl: "memeCaption",
    tone: "cream",
    head: "الزبونة: بفكر وأرد عليكم",
    caption: "",
    note: "الضربة الأولى: يد تكتب في التلفون.",
  }),
  meme({
    key: "meme-reel-reply-2",
    series: REEL,
    size: "story",
    title: "ريل: بفكر وأرد عليكم (2)",
    tpl: "memeCaption",
    tone: "cream",
    head: "أنا بعد ثلاث أيام:",
    caption: "ولا يهمش، العباية تنتظرش 😂🖤\nالرابط في البايو.",
    note: "الضربة الثانية: أقوى رياكشن عندكم، وجه ينتظر أو شمّوعة جالسة جنب التلفون.",
  }),
  meme({
    key: "meme-reel-business-1",
    series: REEL,
    size: "story",
    title: "ريل: قبل المشروع (1)",
    tpl: "memeCaption",
    tone: "wine",
    head: "قبل ما أفتح المشروع",
    caption: "",
    note: "الضربة الأولى: صورة رايقة، قهوة أو بحر.",
  }),
  meme({
    key: "meme-reel-business-2",
    series: REEL,
    size: "story",
    title: "ريل: بعد المشروع (2)",
    tpl: "memeCaption",
    tone: "wine",
    head: "بعد ما فتحت المشروع",
    caption: "كل صاحبة مشروع تعرف 😂🖤\nمنشني صديقتش اللي عندها مشروع.",
    note: "الضربة الثانية: طاولة الشغل مليانة قماش وأكياس، أو وجه تعبان ومبتسم.",
  }),
];

/** Every meme layout, to list them together on the posts page. */
export const isMemePost = (post: Pick<Post, "tpl">) =>
  post.tpl.startsWith("meme") || post.tpl === "free";
