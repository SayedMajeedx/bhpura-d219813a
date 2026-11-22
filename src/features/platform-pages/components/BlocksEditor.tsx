import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Block, Words } from "@/lib/platform-pages/page";
import { BLOCK_KINDS, moved, newBlock, removed, replaced, type BlockKind } from "../lib/editor";
import { EditorCard, ItemControls, PictureField, WordsField, type EditorLang } from "./EditorParts";

export const BLOCK_NAMES: Record<BlockKind, { ar: string; en: string }> = {
  hero: { ar: "رأس الصفحة", en: "Header" },
  text: { ar: "نص", en: "Text" },
  benefits: { ar: "مزايا", en: "Benefits" },
  faq: { ar: "أسئلة وأجوبة", en: "Questions and answers" },
};

/** The page's sections in their order: a header, text, benefits, questions and answers. */
export function BlocksEditor({
  blocks,
  onChange,
  lang,
}: {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  lang: EditorLang;
}) {
  const ar = lang === "ar";
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const name = `${BLOCK_NAMES[block.kind][lang]} ${i + 1}`;
        return (
          <EditorCard
            key={i}
            title={name}
            controls={
              <ItemControls
                name={name}
                index={i}
                count={blocks.length}
                onMove={(delta) => onChange(moved(blocks, i, delta))}
                onRemove={() => onChange(removed(blocks, i))}
                lang={lang}
              />
            }
          >
            <BlockFields
              block={block}
              onChange={(next) => onChange(replaced(blocks, i, next))}
              lang={lang}
            />
          </EditorCard>
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" className="w-full gap-1.5">
            <Plus className="size-4" />
            {ar ? "إضافة قسم" : "Add a section"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          {BLOCK_KINDS.map((kind) => (
            <DropdownMenuItem key={kind} onSelect={() => onChange([...blocks, newBlock(kind)])}>
              {BLOCK_NAMES[kind][lang]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function BlockFields({
  block,
  onChange,
  lang,
}: {
  block: Block;
  onChange: (block: Block) => void;
  lang: EditorLang;
}) {
  const ar = lang === "ar";
  switch (block.kind) {
    case "hero":
      return (
        <div className="space-y-3">
          <PictureField
            label={ar ? "الصورة أعلى الصفحة" : "Picture at the top"}
            value={block.image_url}
            onChange={(image_url) => onChange({ ...block, image_url })}
            lang={lang}
          />
          <WordsField
            label={ar ? "الشارة" : "Badge"}
            value={block.badge}
            onChange={(badge) => onChange({ ...block, badge })}
            lang={lang}
          />
          <WordsField
            label={ar ? "العنوان" : "Title"}
            value={block.title}
            onChange={(title) => onChange({ ...block, title })}
            lang={lang}
          />
          <WordsField
            label={ar ? "السطر تحته" : "Line under it"}
            value={block.lead}
            onChange={(lead) => onChange({ ...block, lead })}
            multiline
            lang={lang}
          />
          <WordsList
            label={ar ? "النقاط تحت العنوان" : "Points under the title"}
            items={block.points}
            onChange={(points) => onChange({ ...block, points })}
            lang={lang}
          />
        </div>
      );
    case "text":
      return (
        <div className="space-y-3">
          <WordsField
            label={ar ? "العنوان (اختياري)" : "Title (optional)"}
            value={block.title}
            onChange={(title) => onChange({ ...block, title })}
            lang={lang}
          />
          <WordsField
            label={ar ? "النص" : "Text"}
            value={block.body}
            onChange={(body) => onChange({ ...block, body })}
            multiline
            lang={lang}
          />
        </div>
      );
    case "benefits":
      return (
        <div className="space-y-3">
          <WordsField
            label={ar ? "العنوان (اختياري)" : "Title (optional)"}
            value={block.title}
            onChange={(title) => onChange({ ...block, title })}
            lang={lang}
          />
          {block.items.map((item, i) => {
            const name = ar ? `الميزة ${i + 1}` : `Benefit ${i + 1}`;
            return (
              <EditorCard
                key={i}
                title={name}
                controls={
                  <ItemControls
                    name={name}
                    index={i}
                    count={block.items.length}
                    onMove={(d) => onChange({ ...block, items: moved(block.items, i, d) })}
                    onRemove={() => onChange({ ...block, items: removed(block.items, i) })}
                    lang={lang}
                  />
                }
              >
                <WordsField
                  label={ar ? "الميزة" : "Benefit"}
                  value={item.title}
                  onChange={(title) =>
                    onChange({ ...block, items: replaced(block.items, i, { ...item, title }) })
                  }
                  lang={lang}
                />
                <WordsField
                  label={ar ? "شرح (اختياري)" : "Detail (optional)"}
                  value={item.body}
                  onChange={(body) =>
                    onChange({ ...block, items: replaced(block.items, i, { ...item, body }) })
                  }
                  lang={lang}
                />
              </EditorCard>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              onChange({ ...block, items: [...block.items, { title: { ar: "", en: "" } }] })
            }
          >
            <Plus className="size-4" />
            {ar ? "إضافة ميزة" : "Add a benefit"}
          </Button>
        </div>
      );
    case "faq":
      return (
        <div className="space-y-3">
          <WordsField
            label={ar ? "العنوان (اختياري)" : "Title (optional)"}
            value={block.title}
            onChange={(title) => onChange({ ...block, title })}
            lang={lang}
          />
          {block.items.map((item, i) => {
            const name = ar ? `السؤال ${i + 1}` : `Question ${i + 1}`;
            return (
              <EditorCard
                key={i}
                title={name}
                controls={
                  <ItemControls
                    name={name}
                    index={i}
                    count={block.items.length}
                    onMove={(d) => onChange({ ...block, items: moved(block.items, i, d) })}
                    onRemove={() => onChange({ ...block, items: removed(block.items, i) })}
                    lang={lang}
                  />
                }
              >
                <WordsField
                  label={ar ? "السؤال" : "Question"}
                  value={item.question}
                  onChange={(question) =>
                    onChange({ ...block, items: replaced(block.items, i, { ...item, question }) })
                  }
                  lang={lang}
                />
                <WordsField
                  label={ar ? "الجواب" : "Answer"}
                  value={item.answer}
                  onChange={(answer) =>
                    onChange({ ...block, items: replaced(block.items, i, { ...item, answer }) })
                  }
                  multiline
                  lang={lang}
                />
              </EditorCard>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              onChange({
                ...block,
                items: [
                  ...block.items,
                  { question: { ar: "", en: "" }, answer: { ar: "", en: "" } },
                ],
              })
            }
          >
            <Plus className="size-4" />
            {ar ? "إضافة سؤال" : "Add a question"}
          </Button>
        </div>
      );
  }
}

/** A list of short lines, each in both languages (the header's points, the footer). */
export function WordsList({
  label,
  items,
  onChange,
  lang,
}: {
  label: string;
  items: Words[];
  onChange: (items: Words[]) => void;
  lang: EditorLang;
}) {
  const ar = lang === "ar";
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground">{label}</p>
      {items.map((item, i) => {
        const name = ar ? `السطر ${i + 1}` : `Line ${i + 1}`;
        return (
          <div key={i} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <WordsField
                label={name}
                value={item}
                onChange={(next) => onChange(replaced(items, i, next))}
                lang={lang}
              />
            </div>
            <ItemControls
              name={name}
              index={i}
              count={items.length}
              onMove={(d) => onChange(moved(items, i, d))}
              onRemove={() => onChange(removed(items, i))}
              lang={lang}
            />
          </div>
        );
      })}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1.5"
        onClick={() => onChange([...items, { ar: "", en: "" }])}
      >
        <Plus className="size-4" />
        {ar ? "إضافة سطر" : "Add a line"}
      </Button>
    </div>
  );
}
