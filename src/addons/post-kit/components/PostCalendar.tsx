import { useMemo } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { PLAN, PLAN_NOTES } from "../content/plan";
import { POSTS } from "../content/posts";
import type { PostKit } from "../hooks/use-post-kit";
import {
  calendarDays,
  calendarSummary,
  localDate,
  planDays,
  swapDays,
  withNextDay,
  withPost,
  withPosted,
  type CalendarDay,
} from "../lib/calendar";
import { pieceOnSale } from "../lib/own-posts";

const PLAN_ROWS = PLAN.flatMap((week) => week.rows);

function dayLabel(date: string, isAr: boolean) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(isAr ? "ar-BH-u-nu-latn" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** The days to come and gone: pick each day's post, move it, and mark what went out. */
export function PostCalendar({ kit, onOpen }: { kit: PostKit; onOpen: (key: string) => void }) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { calendar, saveCalendar, ownKeys, currentOf, photos } = kit;

  const choices = useMemo(() => {
    const ready = POSTS.filter((post) => pieceOnSale(post, photos)).map((post) => post.key);
    return [...ownKeys, ...ready].map((key) => ({ key, title: currentOf(key)?.title ?? key }));
  }, [ownKeys, currentOf, photos]);

  const plan = useMemo(() => planDays(PLAN_ROWS, POSTS), []);
  const days = useMemo(() => calendarDays(plan, calendar), [plan, calendar]);
  const today = localDate();
  const summary = calendarSummary(days, today);

  const move = (index: number, by: number) => {
    const other = days[index + by];
    if (other) saveCalendar(swapDays(calendar, days[index], other));
  };

  const row = (day: CalendarDay, index: number) => {
    const label = dayLabel(day.date, isAr);
    const known = day.post && currentOf(day.post) ? day.post : undefined;
    return (
      <li
        key={day.date}
        className={`grid gap-3 border-b border-border p-3 last:border-0 md:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,14rem)_auto] md:items-center ${
          day.date === today ? "bg-muted" : ""
        }`}
      >
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{day.kind}</p>
        </div>
        <div className="min-w-0" dir="rtl">
          <p
            className={`break-words text-xs text-foreground ${day.posted ? "line-through opacity-60" : ""}`}
          >
            {day.what || (isAr ? "ما له بوست للحين" : "No post yet")}
          </p>
          <p className="text-xs text-muted-foreground">{day.from}</p>
        </div>
        <Select
          value={known ?? ""}
          onValueChange={(key) => {
            const post = choices.find((choice) => choice.key === key);
            if (post) saveCalendar(withPost(calendar, day.date, post));
          }}
        >
          <SelectTrigger aria-label={`${isAr ? "اختار بوست ليوم" : "Choose a post for"} ${label}`}>
            <SelectValue placeholder={isAr ? "اختار بوست" : "Choose a post"} />
          </SelectTrigger>
          <SelectContent>
            {choices.map((choice) => (
              <SelectItem key={choice.key} value={choice.key}>
                {choice.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-foreground">
            <Checkbox
              checked={Boolean(day.posted)}
              aria-label={`${isAr ? "انتشر يوم" : "Posted on"} ${label}`}
              onCheckedChange={(on) => saveCalendar(withPosted(calendar, day.date, on === true))}
            />
            {isAr ? "انتشر" : "Posted"}
          </label>
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={index === 0 || day.posted}
            aria-label={`${isAr ? "قدّم بوست يوم" : "Move earlier the post of"} ${label}`}
            onClick={() => move(index, -1)}
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={index === days.length - 1 || day.posted}
            aria-label={`${isAr ? "أخّر بوست يوم" : "Move later the post of"} ${label}`}
            onClick={() => move(index, 1)}
          >
            <ArrowDown className="size-4" />
          </Button>
          {known ? (
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label={`${isAr ? "عدّل بوست يوم" : "Edit the post of"} ${label}`}
              onClick={() => onOpen(known)}
            >
              <Pencil className="size-4" />
            </Button>
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-3">
      <Card className="space-y-2 p-4">
        <p className="text-sm font-medium text-foreground">
          {isAr
            ? `انتشر ${summary.posted} من ${summary.total}`
            : `${summary.posted} of ${summary.total} posted`}
          {summary.missed
            ? isAr
              ? ` · فات ${summary.missed} بدون علامة`
              : ` · ${summary.missed} past, not marked`
            : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          {summary.nothingReady
            ? `${isAr ? "أول يوم ما له بوست:" : "First day with no post:"} ${dayLabel(summary.nothingReady, isAr)}`
            : isAr
              ? "كل الأيام الجاية لها بوست."
              : "Every day to come has a post."}
        </p>
        <ul dir="rtl" className="list-disc space-y-1 ps-4 text-xs leading-relaxed text-foreground">
          {PLAN_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </Card>
      <Card className="p-0">
        <ul>{days.map(row)}</ul>
      </Card>
      <Button
        type="button"
        variant="outline"
        onClick={() => saveCalendar(withNextDay(calendar, days))}
      >
        <Plus className="size-4" />
        {isAr ? "أضف يوم" : "Add a day"}
      </Button>
    </div>
  );
}
