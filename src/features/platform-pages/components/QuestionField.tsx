import { useId, useState } from "react";
import {
  Crown,
  Gift,
  Instagram,
  Phone,
  Shirt,
  Sparkles,
  Store,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { textOf, type Lang, type Question } from "@/lib/platform-pages/page";
import { phoneDigits } from "@/lib/platform-pages/answers";
import { word } from "../lib/words";

/** The icons a choice's card may name (the editor offers these). */
export const OPTION_ICONS: Record<string, LucideIcon> = {
  shirt: Shirt,
  sparkles: Sparkles,
  gift: Gift,
  utensils: UtensilsCrossed,
  store: Store,
  crown: Crown,
};

/** The Gulf's country codes, Bahrain first, for a WhatsApp number. */
export const COUNTRY_CODES = ["+973", "+966", "+971", "+965", "+974", "+968"] as const;

type Value = string | string[] | undefined;

export function QuestionField({
  question,
  value,
  onChange,
  error,
  lang,
}: {
  question: Question;
  value: Value;
  onChange: (value: string | string[]) => void;
  error?: string;
  lang: Lang;
}) {
  const id = useId();
  const label = textOf(question.label, lang);
  const help = textOf(question.help, lang);
  const placeholder = textOf(question.placeholder, lang);
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : undefined;
  const isChoice = question.type === "cards" || question.type === "choices";

  return (
    <div className="space-y-1.5" data-question={question.key}>
      {isChoice ? (
        <p id={`${id}-label`} className="block text-sm font-semibold text-foreground">
          <LabelWords label={label} required={question.required} lang={lang} />
        </p>
      ) : (
        <Label
          htmlFor={id}
          className="flex items-center gap-1.5 text-sm font-semibold text-foreground"
        >
          {question.type === "instagram" && <Instagram className="size-4 text-primary" />}
          {question.type === "phone" && <Phone className="size-4 text-primary" />}
          <LabelWords label={label} required={question.required} lang={lang} />
        </Label>
      )}

      {question.type === "text" && (
        <Input
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={200}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className="min-h-11 rounded-xl text-sm"
        />
      )}
      {question.type === "long_text" && (
        <Textarea
          id={id}
          rows={3}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={2000}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className="rounded-xl text-sm leading-relaxed"
        />
      )}
      {question.type === "instagram" && (
        <div className="flex min-h-11 overflow-hidden rounded-xl border border-input bg-card focus-within:ring-2 focus-within:ring-ring">
          <span className="inline-flex shrink-0 items-center border-e border-border bg-muted/40 px-3.5 text-sm font-bold text-muted-foreground">
            @
          </span>
          <input
            id={id}
            type="text"
            dir="ltr"
            autoCapitalize="none"
            autoCorrect="off"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value.replace(/^@/, "").trim())}
            placeholder={placeholder || "yourbrand"}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            className="min-w-0 flex-1 bg-transparent px-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      )}
      {question.type === "phone" && (
        <PhoneInput
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          placeholder={placeholder || "39000000"}
          describedBy={describedBy}
          invalid={Boolean(error)}
          lang={lang}
        />
      )}
      {isChoice && (
        <ChoiceCards
          question={question}
          value={value}
          onChange={onChange}
          labelledBy={`${id}-label`}
          lang={lang}
        />
      )}

      {help && !error && <p className="text-xs text-muted-foreground">{help}</p>}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function LabelWords({ label, required, lang }: { label: string; required: boolean; lang: Lang }) {
  return (
    <>
      <span>{label}</span>{" "}
      {required ? (
        <span className="text-destructive">*</span>
      ) : (
        <span className="text-xs font-normal text-muted-foreground">{word("optional", lang)}</span>
      )}
    </>
  );
}

/** A WhatsApp number: the country code chosen, the number typed, kept as one "+973…" answer. */
function PhoneInput({
  id,
  value,
  onChange,
  placeholder,
  describedBy,
  invalid,
  lang,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  describedBy?: string;
  invalid: boolean;
  lang: Lang;
}) {
  const known = COUNTRY_CODES.find((code) => value.startsWith(code));
  const [code, setCode] = useState<string>(known ?? COUNTRY_CODES[0]);
  const number = known ? value.slice(known.length) : value.replace(/^\+/, "");
  const write = (nextCode: string, nextNumber: string) => {
    const digits = phoneDigits(nextNumber).replace(/^\+/, "").replace(/^0+/, "");
    onChange(digits ? `${nextCode}${digits}` : "");
  };
  return (
    <div className="flex min-h-11 overflow-hidden rounded-xl border border-input bg-card focus-within:ring-2 focus-within:ring-ring">
      <select
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          write(e.target.value, number);
        }}
        dir="ltr"
        aria-label={word("countryCode", lang)}
        className="shrink-0 cursor-pointer border-e border-border bg-muted/40 px-3 text-sm font-bold text-foreground focus:outline-none"
      >
        {COUNTRY_CODES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        dir="ltr"
        value={number}
        onChange={(e) => write(code, e.target.value)}
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className="min-w-0 flex-1 bg-transparent px-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
    </div>
  );
}

/** A choice among the page's options: tiles with an icon, a list, or a grid of two. */
function ChoiceCards({
  question,
  value,
  onChange,
  labelledBy,
  lang,
}: {
  question: Question;
  value: Value;
  onChange: (value: string | string[]) => void;
  labelledBy: string;
  lang: Lang;
}) {
  const many = question.type === "choices";
  const picked = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const layout = question.layout ?? "list";
  const toggle = (optionId: string) => {
    if (!many) return onChange(optionId);
    onChange(
      picked.includes(optionId) ? picked.filter((p) => p !== optionId) : [...picked, optionId],
    );
  };
  return (
    <div
      role={many ? "group" : "radiogroup"}
      aria-labelledby={labelledBy}
      className={cn(
        layout === "tiles" && "grid grid-cols-2 gap-2.5 sm:grid-cols-3",
        layout === "grid" && "grid grid-cols-1 gap-2.5 sm:grid-cols-2",
        layout === "list" && "space-y-2",
      )}
    >
      {question.options.map((option) => {
        const selected = picked.includes(option.id);
        const Icon = option.icon ? OPTION_ICONS[option.icon] : undefined;
        const title = textOf(option.title, lang);
        const body = textOf(option.body, lang);
        const tag = textOf(option.tag, lang);
        return (
          <button
            key={option.id}
            type="button"
            role={many ? "checkbox" : "radio"}
            aria-checked={selected}
            onClick={() => toggle(option.id)}
            className={cn(
              "w-full rounded-xl border p-3.5 text-start transition-colors duration-(--motion-fast)",
              selected
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted/50",
              layout === "tiles" &&
                "flex min-h-[90px] flex-col items-center justify-center gap-2 text-center",
            )}
          >
            {layout === "tiles" ? (
              <>
                {Icon && <Icon className={cn("size-5", selected && "text-primary")} />}
                <span className="text-xs font-semibold text-foreground">{title}</span>
              </>
            ) : (
              <span className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center border border-primary/40 bg-background",
                    many ? "rounded" : "rounded-full",
                  )}
                >
                  {selected && (
                    <span
                      className={cn("size-2 bg-primary", many ? "rounded-sm" : "rounded-full")}
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-foreground">{title}</span>
                    {tag && (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-primary/30 bg-primary/15 text-xs font-bold text-primary"
                      >
                        {tag}
                      </Badge>
                    )}
                  </span>
                  {body && (
                    <span className="block text-xs leading-relaxed text-muted-foreground">
                      {body}
                    </span>
                  )}
                </span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
