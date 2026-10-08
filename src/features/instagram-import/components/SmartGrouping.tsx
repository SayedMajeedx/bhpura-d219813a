import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  suggestGroups,
  type GroupSuggestion,
} from "@/features/instagram-import/lib/group-suggestions";
import type { MergeableDraft } from "@/features/instagram-import/lib/merge-drafts";

/**
 * "Suggest groups": looks at when the posts were put up and what they say, and proposes which posts
 * are one product. The merchant sees each proposal with its pictures and ticks the ones to merge;
 * only the sure ones are ticked to begin with.
 */
export function SmartGrouping({
  isAr,
  drafts,
  onApply,
}: {
  isAr: boolean;
  drafts: MergeableDraft[];
  onApply: (groups: string[][]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<number>>(new Set());
  const [suggestions, setSuggestions] = useState<GroupSuggestion[]>([]);
  const byId = useMemo(() => new Map(drafts.map((draft) => [draft.id, draft])), [drafts]);

  const show = () => {
    const found = suggestGroups(drafts);
    setSuggestions(found);
    setChosen(new Set(found.flatMap((s, index) => (s.confidence === "high" ? [index] : []))));
    setOpen(true);
  };
  const toggle = (index: number) =>
    setChosen((current) => {
      const next = new Set(current);
      if (!next.delete(index)) next.add(index);
      return next;
    });
  const apply = () => {
    onApply(suggestions.filter((_, index) => chosen.has(index)).map((s) => s.ids));
    setOpen(false);
  };

  const sure = suggestions.filter((s) => s.confidence === "high").length;
  const reasonText = (reason: GroupSuggestion["reason"]) =>
    reason === "time-and-caption"
      ? isAr
        ? "نُشرت معاً ووصفها متقارب"
        : "Posted together, alike captions"
      : reason === "time"
        ? isAr
          ? "نُشرت في وقت متقارب"
          : "Posted close together"
        : isAr
          ? "وصفها متشابه"
          : "Similar captions";

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 rounded-lg text-xs font-bold"
        onClick={show}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {isAr ? "اقتراح ذكي" : "Suggest groups"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>{isAr ? "اقتراح دمج المنشورات" : "Suggested merges"}</DialogTitle>
            <DialogDescription>
              {suggestions.length === 0
                ? isAr
                  ? "لم أجد منشورات تبدو كمنتج واحد. استخدم الدمج بالعدد أو حدد البطاقات بنفسك."
                  : "No posts look like one product. Merge by count, or tick the cards yourself."
                : isAr
                  ? `وجدت ${suggestions.length} مجموعة (${sure} منها مؤكدة). راجعها ثم ادمج.`
                  : `Found ${suggestions.length} groups (${sure} sure). Look them over, then merge.`}
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto pe-1">
            {suggestions.map((suggestion, index) => {
              const members = suggestion.ids
                .map((id) => byId.get(id))
                .filter(Boolean) as MergeableDraft[];
              const lead = members.find((m) => m.title.trim()) ?? members[0];
              return (
                <li
                  key={suggestion.ids.join("|")}
                  className="flex items-center gap-3 rounded-xl border border-border p-2.5"
                >
                  <Checkbox
                    checked={chosen.has(index)}
                    onCheckedChange={() => toggle(index)}
                    aria-label={isAr ? `دمج المجموعة ${index + 1}` : `Merge group ${index + 1}`}
                  />
                  <div className="flex shrink-0 -space-x-2 rtl:space-x-reverse">
                    {members.slice(0, 4).map((member) => (
                      <img
                        key={member.id}
                        src={member.coverImageUrl}
                        alt=""
                        className="h-12 w-12 rounded-lg border-2 border-background object-cover"
                      />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">
                      {lead?.title.trim() || (isAr ? "بدون اسم" : "No name yet")}
                      {lead && typeof lead.price === "number" && lead.price > 0
                        ? ` · ${lead.price}`
                        : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isAr ? `${members.length} منشورات` : `${members.length} posts`} ·{" "}
                      {reasonText(suggestion.reason)}
                    </p>
                  </div>
                  <Badge
                    variant={suggestion.confidence === "high" ? "default" : "secondary"}
                    className="shrink-0 text-xs"
                  >
                    {suggestion.confidence === "high"
                      ? isAr
                        ? "مؤكدة"
                        : "Sure"
                      : isAr
                        ? "راجعها"
                        : "Check"}
                  </Badge>
                </li>
              );
            })}
          </ul>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="button" disabled={chosen.size === 0} onClick={apply}>
              {isAr ? `دمج المحدد (${chosen.size})` : `Merge selected (${chosen.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
