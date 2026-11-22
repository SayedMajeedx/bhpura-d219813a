import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  QUESTION_TYPES,
  type PageForm,
  type Question,
  type QuestionType,
} from "@/lib/platform-pages/page";
import { moved, newOptionId, newQuestion, newStep, removed, replaced } from "../lib/editor";
import { OPTION_ICONS } from "./QuestionField";
import { EditorCard, ItemControls, WordsField, type EditorLang } from "./EditorParts";

export const TYPE_NAMES: Record<QuestionType, { ar: string; en: string }> = {
  text: { ar: "نص قصير", en: "Short text" },
  long_text: { ar: "نص طويل", en: "Long text" },
  instagram: { ar: "حساب إنستغرام", en: "Instagram account" },
  phone: { ar: "رقم واتساب", en: "WhatsApp number" },
  cards: { ar: "اختيار واحد", en: "One choice" },
  choices: { ar: "أكثر من اختيار", en: "Several choices" },
};

const LAYOUT_NAMES = {
  list: { ar: "قائمة", en: "List" },
  grid: { ar: "عمودان", en: "Two columns" },
  tiles: { ar: "مربعات بأيقونات", en: "Tiles with icons" },
} as const;

const ICON_NAMES: Record<string, { ar: string; en: string }> = {
  shirt: { ar: "ملابس", en: "Clothing" },
  sparkles: { ar: "لمعة", en: "Sparkles" },
  gift: { ar: "هدية", en: "Gift" },
  utensils: { ar: "طعام", en: "Food" },
  store: { ar: "متجر", en: "Store" },
  crown: { ar: "تاج", en: "Crown" },
};

/** The form's steps in their order, each with its questions. */
export function FormEditor({
  form,
  onChange,
  lang,
}: {
  form: PageForm;
  onChange: (form: PageForm) => void;
  lang: EditorLang;
}) {
  const ar = lang === "ar";
  const steps = form.steps;
  return (
    <div className="space-y-3">
      <WordsField
        label={ar ? "زر الإرسال" : "Send button"}
        value={form.submit_label}
        onChange={(submit_label) => onChange({ ...form, submit_label })}
        lang={lang}
      />
      {steps.map((step, s) => {
        const name = ar ? `الخطوة ${s + 1}` : `Step ${s + 1}`;
        const setStep = (next: typeof step) =>
          onChange({ ...form, steps: replaced(steps, s, next) });
        return (
          <EditorCard
            key={s}
            title={name}
            controls={
              <ItemControls
                name={name}
                index={s}
                count={steps.length}
                onMove={(d) => onChange({ ...form, steps: moved(steps, s, d) })}
                onRemove={() => onChange({ ...form, steps: removed(steps, s) })}
                lang={lang}
              />
            }
          >
            <WordsField
              label={ar ? "عنوان الخطوة" : "Step title"}
              value={step.title}
              onChange={(title) => setStep({ ...step, title })}
              lang={lang}
            />
            <WordsField
              label={ar ? "اسمها القصير في شريط التقدم" : "Short name in the progress bar"}
              value={step.short}
              onChange={(short) => setStep({ ...step, short })}
              lang={lang}
            />
            <WordsField
              label={ar ? "سطر تحت العنوان" : "Line under the title"}
              value={step.lead}
              onChange={(lead) => setStep({ ...step, lead })}
              lang={lang}
            />
            {step.questions.map((question, q) => {
              const qName = ar ? `السؤال ${q + 1}` : `Question ${q + 1}`;
              return (
                <EditorCard
                  key={question.key}
                  title={`${qName} · ${TYPE_NAMES[question.type][lang]}`}
                  controls={
                    <ItemControls
                      name={qName}
                      index={q}
                      count={step.questions.length}
                      onMove={(d) => setStep({ ...step, questions: moved(step.questions, q, d) })}
                      onRemove={() => setStep({ ...step, questions: removed(step.questions, q) })}
                      lang={lang}
                    />
                  }
                >
                  <QuestionEditor
                    question={question}
                    onChange={(next) =>
                      setStep({ ...step, questions: replaced(step.questions, q, next) })
                    }
                    lang={lang}
                  />
                </EditorCard>
              );
            })}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="gap-1.5">
                  <Plus className="size-4" />
                  {ar ? "إضافة سؤال" : "Add a question"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {QUESTION_TYPES.map((type) => (
                  <DropdownMenuItem
                    key={type}
                    onSelect={() =>
                      setStep({ ...step, questions: [...step.questions, newQuestion(form, type)] })
                    }
                  >
                    {TYPE_NAMES[type][lang]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </EditorCard>
        );
      })}
      <Button
        type="button"
        variant="outline"
        className="w-full gap-1.5"
        onClick={() => onChange({ ...form, steps: [...steps, newStep()] })}
      >
        <Plus className="size-4" />
        {ar ? "إضافة خطوة" : "Add a step"}
      </Button>
    </div>
  );
}

function QuestionEditor({
  question,
  onChange,
  lang,
}: {
  question: Question;
  onChange: (question: Question) => void;
  lang: EditorLang;
}) {
  const ar = lang === "ar";
  const choice = question.type === "cards" || question.type === "choices";
  const text = question.type === "text" || question.type === "long_text";
  return (
    <div className="space-y-3">
      <WordsField
        label={ar ? "السؤال" : "Question"}
        value={question.label}
        onChange={(label) => onChange({ ...question, label })}
        lang={lang}
      />
      <WordsField
        label={ar ? "شرح تحته (اختياري)" : "Help under it (optional)"}
        value={question.help}
        onChange={(help) => onChange({ ...question, help })}
        lang={lang}
      />
      {text && (
        <WordsField
          label={ar ? "مثال داخل الخانة (اختياري)" : "Example in the field (optional)"}
          value={question.placeholder}
          onChange={(placeholder) => onChange({ ...question, placeholder })}
          lang={lang}
        />
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <ToggleRow
          label={ar ? "إجباري" : "Required"}
          checked={question.required}
          onChange={(required) => onChange({ ...question, required })}
        />
        {!choice && (
          <ToggleRow
            label={ar ? "يظهر في رسالة الشكر" : "Shown on the thank-you card"}
            checked={Boolean(question.in_summary)}
            onChange={(in_summary) => onChange({ ...question, in_summary })}
          />
        )}
      </div>
      {choice && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              {ar ? "شكل الخيارات" : "How the choices look"}
            </Label>
            <div className="flex flex-wrap gap-1.5" role="radiogroup">
              {(Object.keys(LAYOUT_NAMES) as Array<keyof typeof LAYOUT_NAMES>).map((layout) => (
                <Button
                  key={layout}
                  type="button"
                  size="sm"
                  role="radio"
                  aria-checked={(question.layout ?? "list") === layout}
                  variant={(question.layout ?? "list") === layout ? "default" : "outline"}
                  onClick={() => onChange({ ...question, layout })}
                >
                  {LAYOUT_NAMES[layout][lang]}
                </Button>
              ))}
            </div>
          </div>
          {question.options.map((option, o) => {
            const name = ar ? `الخيار ${o + 1}` : `Choice ${o + 1}`;
            const setOption = (next: typeof option) =>
              onChange({ ...question, options: replaced(question.options, o, next) });
            return (
              <EditorCard
                key={option.id}
                title={name}
                controls={
                  <ItemControls
                    name={name}
                    index={o}
                    count={question.options.length}
                    onMove={(d) =>
                      onChange({ ...question, options: moved(question.options, o, d) })
                    }
                    onRemove={() =>
                      onChange({ ...question, options: removed(question.options, o) })
                    }
                    lang={lang}
                  />
                }
              >
                <WordsField
                  label={ar ? "نص الخيار" : "Choice"}
                  value={option.title}
                  onChange={(title) => setOption({ ...option, title })}
                  lang={lang}
                />
                {question.layout !== "tiles" && (
                  <>
                    <WordsField
                      label={ar ? "شرح (اختياري)" : "Detail (optional)"}
                      value={option.body}
                      onChange={(body) => setOption({ ...option, body })}
                      lang={lang}
                    />
                    <WordsField
                      label={ar ? "شارة (اختياري)" : "Badge (optional)"}
                      value={option.tag}
                      onChange={(tag) => setOption({ ...option, tag })}
                      lang={lang}
                    />
                  </>
                )}
                {question.layout === "tiles" && (
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="radiogroup"
                    aria-label={ar ? "الأيقونة" : "Icon"}
                  >
                    {Object.entries(OPTION_ICONS).map(([icon, Icon]) => (
                      <Button
                        key={icon}
                        type="button"
                        size="icon"
                        role="radio"
                        aria-checked={option.icon === icon}
                        aria-label={ICON_NAMES[icon]?.[lang] ?? icon}
                        variant={option.icon === icon ? "default" : "outline"}
                        className="size-9"
                        onClick={() => setOption({ ...option, icon })}
                      >
                        <Icon className="size-4" />
                      </Button>
                    ))}
                  </div>
                )}
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
                ...question,
                options: [
                  ...question.options,
                  { id: newOptionId(question), title: { ar: "", en: "" } },
                ],
              })
            }
          >
            <Plus className="size-4" />
            {ar ? "إضافة خيار" : "Add a choice"}
          </Button>
        </>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-foreground">
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
      {label}
    </label>
  );
}
