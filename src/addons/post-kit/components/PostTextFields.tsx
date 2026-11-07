import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { PAPER_LOOKS, paperLook } from "../lib/layout-paper";
import { isOwnPost } from "../lib/own-posts";
import { fieldsOf, hasSceneText } from "../lib/post-rules";
import type { PaperLook, Post } from "../lib/types";

type TextField =
  | "title"
  | "lead"
  | "head"
  | "foot"
  | "label"
  | "labelA"
  | "labelB"
  | "chat"
  | "items"
  | "bag"
  | "total"
  | "stamp";

/** A field's words where a layout uses it differently. */
const FIELD_WORDS: Record<string, Partial<Record<TextField, [string, string]>>> = {
  split: {
    labelA: ["السطر الصغير للجزء الأول", "Small line, first part"],
    head: ["كلام الجزء الأول", "First part"],
    labelB: ["السطر الصغير للجزء الثاني", "Small line, second part"],
    foot: ["كلام الجزء الثاني", "Second part"],
  },
  reply: { lead: ["مين علّق", "Who commented"], head: ["التعليق", "The comment"] },
  proof: {
    lead: ["مين قالت", "Who said it"],
    head: ["كلام الزبونة", "The customer's words"],
    label: ["اسم القطعة", "The piece"],
  },
  grid: { foot: ["السطر تحت", "Line below"] },
};

/** What a list field holds in each layout: a piece's traits and a paper's rows are "a name: a value". */
function itemsLabel(post: Post): [string, string] {
  if (post.tpl === "grid") {
    return [
      "كل خانة في سطر. الخانة بين نجمتين تتعبى، والعنوان قبل النقطتين يطلع فوق كلامها",
      "One cell a line. A cell between asterisks is filled, and a heading before a colon sits above its words",
    ];
  }
  if (post.tpl === "reply") return ["رد شمّوعة", "Shammoua's answer"];
  if (post.tpl === "piece") {
    return ["كل سطر: العنوان ونقطتين والكلام", "One a line: a heading, a colon and the words"];
  }
  if (post.tpl === "paper") {
    return paperLook(post) === "circular"
      ? ["نص التعميم", "The circular's words"]
      : ["كل سطر: البند ونقطتين والكلام", "One a line: an item, a colon and the words"];
  }
  return ["القائمة: كل نقطة في سطر", "List: one point a line"];
}

/** The words of a post: only those its layout draws. */
export function PostTextFields({
  post,
  onChange,
}: {
  post: Post;
  onChange: (change: Partial<Post>) => void;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const uid = useId();
  const fields = fieldsOf(post);
  const look = paperLook(post);

  const textInput = (name: TextField, ar: string, en: string, multi = false) => {
    const id = `${uid}-${name}`;
    const value = post[name] ?? "";
    const set = (text: string) => onChange({ [name]: text });
    return (
      <div className="space-y-1.5" key={name}>
        <Label htmlFor={id}>
          {isAr
            ? (FIELD_WORDS[post.tpl]?.[name]?.[0] ?? ar)
            : (FIELD_WORDS[post.tpl]?.[name]?.[1] ?? en)}
        </Label>
        {multi ? (
          <Textarea
            id={id}
            dir="rtl"
            value={value}
            onChange={(e) => set(e.target.value)}
            rows={3}
          />
        ) : (
          <Input id={id} dir="rtl" value={value} onChange={(e) => set(e.target.value)} />
        )}
      </div>
    );
  };

  return (
    <>
      {isOwnPost(post.key) ? textInput("title", "اسم البوست", "Post name") : null}
      {post.tpl === "paper" ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">{isAr ? "نوع الورقة" : "Paper"}</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PAPER_LOOKS) as PaperLook[]).map((key) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={look === key ? "default" : "outline"}
                aria-pressed={look === key}
                onClick={() => onChange({ paper: key })}
              >
                {isAr ? PAPER_LOOKS[key].ar : PAPER_LOOKS[key].en}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {fields.includes("lead") ? textInput("lead", "السطر الصغير فوق", "Small line above") : null}
      {fields.includes("head") ? (
        <div className="space-y-1">
          {textInput("head", "العنوان", "Headline", true)}
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "حط الكلمة المهمة بين نجمتين عشان تطلع على الليبل: *جذي*"
              : "Put the key words between two asterisks to set them on the label: *like this*"}
          </p>
        </div>
      ) : null}
      {fields.includes("chat")
        ? textInput(
            "chat",
            "المحادثة: كل رسالة في سطر، الاسم ونقطتين والكلام",
            "Chat: one message a line, a name, a colon and the words",
            true,
          )
        : null}
      {fields.includes("items") ? textInput("items", ...itemsLabel(post), true) : null}
      {fields.includes("total") && look === "receipt"
        ? textInput(
            "total",
            "المجموع: العنوان ونقطتين والكلام",
            "Total: a name, a colon and the words",
          )
        : null}
      {fields.includes("foot") ? textInput("foot", "التعليق بخط اليد", "Handwritten note") : null}
      {fields.includes("stamp") ? textInput("stamp", "الختم", "Stamp") : null}
      {fields.includes("label") ? textInput("label", "ليبل المنتج", "Product label") : null}
      {fields.includes("labelA") ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {textInput("labelA", "اسم الخيار 1", "Option 1")}
          {textInput("labelB", "اسم الخيار 2", "Option 2")}
        </div>
      ) : null}
      {hasSceneText(post)
        ? textInput("bag", "الكلام على الرسمة", "Words on the drawing", true)
        : null}
    </>
  );
}
