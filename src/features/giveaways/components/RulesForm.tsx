import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { GiveawayDetail } from "../hooks/use-giveaway-detail";
import { parseRequiredText, parseUsernames } from "../lib/entry-rules";
import { fromLocalInput, toLocalInput } from "../lib/messages";

function NumberField({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        dir="ltr"
        className="w-24"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, Math.trunc(next))));
        }}
      />
    </div>
  );
}

/** The conditions a comment must meet, and how many winners and backups to draw. */
export function RulesForm({ detail }: { detail: GiveawayDetail }) {
  const { isAr, rules, patchRules } = detail;
  // Text areas keep what is typed; the rules hold the parsed lists.
  const [wordsText, setWordsText] = useState(rules.requiredText.join("\n"));
  const [excludeText, setExcludeText] = useState(rules.excludeUsernames.join(" "));

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <h2 className="font-semibold text-foreground">{isAr ? "الشروط" : "Rules"}</h2>

      <div className="flex flex-wrap gap-4">
        <NumberField
          id="rule-winners"
          label={isAr ? "عدد الفائزين" : "Winners"}
          value={rules.winners}
          min={1}
          max={50}
          onChange={(winners) => patchRules({ winners })}
        />
        <NumberField
          id="rule-backups"
          label={isAr ? "عدد الاحتياط" : "Backups"}
          value={rules.backups}
          min={0}
          max={50}
          onChange={(backups) => patchRules({ backups })}
        />
        <NumberField
          id="rule-mentions"
          label={isAr ? "منشن أصدقاء (حد أدنى)" : "Friends to tag (minimum)"}
          value={rules.minMentions}
          min={0}
          max={10}
          onChange={(minMentions) => patchRules({ minMentions })}
        />
      </div>

      <div className="space-y-2">
        <Label className="flex items-start gap-2 text-sm font-normal">
          <Checkbox
            className="mt-0.5"
            checked={rules.onePerPerson}
            onCheckedChange={(checked) => patchRules({ onePerPerson: checked === true })}
          />
          <span>
            {isAr ? "فرصة واحدة لكل حساب" : "One chance per account"}
            <span className="block text-xs text-muted-foreground">
              {isAr
                ? "عند إلغائه، كل تعليق مؤهل فرصة إضافية، والحساب يفوز مرة واحدة فقط."
                : "When off, every qualifying comment is one more chance; an account still wins once."}
            </span>
          </span>
        </Label>
        <Label className="flex items-start gap-2 text-sm font-normal">
          <Checkbox
            className="mt-0.5"
            checked={rules.uniqueMentions}
            onCheckedChange={(checked) => patchRules({ uniqueMentions: checked === true })}
          />
          <span>
            {isAr
              ? "الأصدقاء المذكورون يجب أن يكونوا مختلفين"
              : "Tagged friends must be different people"}
          </span>
        </Label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rule-words">
            {isAr
              ? "كلمة أو هاشتاق مطلوب (سطر لكل واحد)"
              : "Required word or hashtag (one per line)"}
          </Label>
          <Textarea
            id="rule-words"
            rows={3}
            value={wordsText}
            onChange={(event) => {
              setWordsText(event.target.value);
              patchRules({ requiredText: parseRequiredText(event.target.value) });
            }}
          />
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "يكفي وجود واحدة منها. اتركه فارغاً بلا شرط."
              : "Any one of them is enough. Leave empty for no condition."}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rule-exclude">
            {isAr ? "حسابات مستبعدة" : "Accounts that cannot win"}
          </Label>
          <Textarea
            id="rule-exclude"
            dir="ltr"
            rows={3}
            placeholder="@account1 @account2"
            value={excludeText}
            onChange={(event) => {
              setExcludeText(event.target.value);
              patchRules({ excludeUsernames: parseUsernames(event.target.value) });
            }}
          />
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "حساب المتجر يُستبعد تلقائياً."
              : "The store's own account is left out automatically."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="rule-start">{isAr ? "التعليقات من" : "Comments from"}</Label>
          <Input
            id="rule-start"
            type="datetime-local"
            dir="ltr"
            value={toLocalInput(rules.startsAt)}
            onChange={(event) => patchRules({ startsAt: fromLocalInput(event.target.value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rule-end">{isAr ? "إلى" : "To"}</Label>
          <Input
            id="rule-end"
            type="datetime-local"
            dir="ltr"
            value={toLocalInput(rules.endsAt)}
            onChange={(event) => patchRules({ endsAt: fromLocalInput(event.target.value) })}
          />
        </div>
      </div>

      <div className="space-y-2 rounded-lg bg-muted p-3">
        <p className="text-sm font-medium text-foreground">
          {isAr ? "شروط يتحقق منها فريقك يدوياً" : "Conditions your team checks by hand"}
        </p>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "انستغرام لا يتيح معرفة من يتابع الحساب أو من وضع إعجاباً. يُفتح بروفايل كل فائز لتتحقق منه، وإن لم يحقق الشرط ينتقل الدور للاحتياطي."
            : "Instagram does not say who follows the account or liked the post. Each winner's profile opens for you to check; if they fail, the next backup takes the place."}
        </p>
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox
            checked={rules.requireFollow}
            onCheckedChange={(checked) => patchRules({ requireFollow: checked === true })}
          />
          {isAr ? "متابعة الحساب" : "Follows the account"}
        </Label>
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox
            checked={rules.requireLike}
            onCheckedChange={(checked) => patchRules({ requireLike: checked === true })}
          />
          {isAr ? "إعجاب بالبوست" : "Liked the post"}
        </Label>
      </div>

      {detail.rulesChanged && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={detail.savingRules}
          onClick={detail.saveRules}
        >
          {detail.savingRules ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {isAr ? "حفظ الشروط" : "Save rules"}
        </Button>
      )}
    </section>
  );
}
