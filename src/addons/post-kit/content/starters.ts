import type { Post } from "../lib/types";
import { OWN_SERIES } from "../lib/own-posts";

export type Starter = {
  id: string;
  name: { ar: string; en: string };
  post: Omit<Post, "key" | "title" | "series" | "stickers" | "caption" | "size"> &
    Partial<Pick<Post, "stickers" | "caption">>;
  /** Takes a piece of the store's: its photo, and its name and price as the label. */
  usesPiece?: boolean;
  title: string;
};

/** Where a new post starts: one per layout, the paper three times, with words to type over. */
export const STARTERS: Starter[] = [
  {
    id: "joke",
    name: { ar: "نكتة", en: "Joke" },
    title: "نكتة جديدة",
    post: {
      tpl: "joke",
      tone: "wine",
      lead: "السطر الصغير هني",
      head: "النكتة هني، و*الكلمة المهمة* بين نجمتين",
      foot: "تعليق بخط اليد",
      stickers: [{ id: "hanger-smile", x: 0.3, y: 0.76, s: 460, r: -5 }],
    },
  },
  {
    id: "piece",
    name: { ar: "كرت القطعة", en: "Piece card" },
    title: "كرت قطعة جديد",
    usesPiece: true,
    post: {
      tpl: "piece",
      tone: "cream",
      items: "شخصيتها: اكتبيها هني\nتناسب: الدوام والطلعات\nما تناسب: نكتة صغيرة",
    },
  },
  {
    id: "receipt",
    name: { ar: "فاتورة", en: "Receipt" },
    title: "فاتورة جديدة",
    post: {
      tpl: "paper",
      paper: "receipt",
      tone: "wine",
      head: "فاتورة شمّوعة",
      lead: "هالشهر",
      items: "الشي الأول: ضروري\nالشي الثاني: ضروري جداً",
      total: "المجموع: الراتب",
      foot: "لا يرد ولا يستبدل",
    },
  },
  {
    id: "circular",
    name: { ar: "تعميم", en: "Circular" },
    title: "تعميم جديد",
    post: {
      tpl: "paper",
      paper: "circular",
      tone: "sand",
      lead: "من: إدارة شمّوعة · إلى: جميع البنات",
      head: "تعميم رقم 1",
      items: "يمنع منعاً باتاً *هالشي*",
      foot: "والمخالفة: اكتبيها هني.",
      stamp: "معتمد",
    },
  },
  {
    id: "licence",
    name: { ar: "رخصة", en: "Licence" },
    title: "رخصة جديدة",
    post: {
      tpl: "paper",
      paper: "licence",
      tone: "ink",
      head: "رخصة",
      lead: "صادرة من إدارة شمّوعة",
      items: "الفئة: اكتبيها هني\nالقيود: اكتبيها هني\nتنتهي: اكتبيها هني",
      stamp: "سارية",
    },
  },
  {
    id: "bingo",
    name: { ar: "بنقو", en: "Bingo card" },
    title: "بنقو جديد",
    post: {
      tpl: "grid",
      tone: "wine",
      head: "بنقو",
      items: "خانة 1\nخانة 2\nخانة 3\nخانة 4\n*الخانة المجانية*\nخانة 6\nخانة 7\nخانة 8\nخانة 9",
      foot: "كم خانة طلعت لش؟",
    },
  },
  {
    id: "split",
    name: { ar: "قبل وبعد", en: "Before and after" },
    title: "قبل وبعد جديد",
    post: {
      tpl: "split",
      tone: "sand",
      labelA: "قبل",
      head: "الخطة الهادية",
      labelB: "وقت",
      foot: "الواقع!",
    },
  },
  {
    id: "reply",
    name: { ar: "رد على تعليق", en: "Comment reply" },
    title: "رد جديد",
    post: {
      tpl: "reply",
      tone: "wine",
      lead: "تعليق من متابعة",
      head: "التعليق هني",
      items: "رد شمّوعة هني",
      note: "تعليق حقيقي، وبدون اسم صاحبته.",
    },
  },
  {
    id: "proof",
    name: { ar: "كلام زبونة", en: "Customer words" },
    title: "كلام زبونة جديد",
    post: {
      tpl: "proof",
      tone: "cream",
      lead: "من زبونة، وبإذنها",
      head: "كلام الزبونة مثل ما كتبته",
      note: "بإذن الزبونة بس، وبدون اسمها.",
    },
  },
  {
    id: "photo",
    name: { ar: "صورة ونكتة", en: "Photo and joke" },
    title: "صورة ونكتة جديدة",
    usesPiece: true,
    post: { tpl: "photo", tone: "wine", head: "النكتة فوق الصورة" },
  },
  {
    id: "poster",
    name: { ar: "صورة كاملة", en: "Full photo" },
    title: "صورة كاملة جديدة",
    usesPiece: true,
    post: { tpl: "poster", tone: "wine", head: "الكلام على الصورة" },
  },
  {
    id: "poll",
    name: { ar: "صوّتوا", en: "Poll" },
    title: "تصويت جديد",
    usesPiece: true,
    post: { tpl: "poll", tone: "sand", head: "هالقطعة ولا هالقطعة؟", labelA: "1", labelB: "2" },
  },
  {
    id: "chat",
    name: { ar: "محادثة", en: "Chat" },
    title: "محادثة جديدة",
    post: {
      tpl: "chat",
      tone: "cream",
      head: "المحادثة",
      chat: "هي: كل رسالة في سطر\nشمّوعة: الاسم ونقطتين والكلام",
    },
  },
  {
    id: "list",
    name: { ar: "قائمة", en: "List" },
    title: "قائمة جديدة",
    post: { tpl: "list", tone: "cream", head: "العنوان", items: "النقطة الأولى\nالنقطة الثانية" },
  },
];

/** A new post from a starting point, its piece given by the page: the store's first, if any. */
export function postFromStarter(starter: Starter, key: string, piece: string | undefined): Post {
  const post: Post = {
    stickers: [],
    caption: "",
    ...starter.post,
    key,
    series: OWN_SERIES,
    title: starter.title,
    size: "post",
  };
  if (starter.usesPiece && piece) {
    post.photo1 = piece;
    if (post.tpl === "poll") post.photo2 = piece;
    if (post.tpl === "photo" || post.tpl === "piece") post.label = `{full:${piece}}`;
  }
  return post;
}
