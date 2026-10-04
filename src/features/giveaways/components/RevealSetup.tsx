import { Clapperboard, Maximize, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { RevealConfig } from "../lib/reveal";

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; text: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Button
              key={String(option.value)}
              type="button"
              size="sm"
              variant="chip"
              aria-pressed={selected}
              className={
                selected ? "border-primary bg-primary/10 text-foreground" : "border-border"
              }
              onClick={() => onChange(option.value)}
            >
              {option.text}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The screen before the reveal: pick the format and timing, then press Start. It
 * is a separate screen on purpose, so the recording can be started first and the
 * reveal begins from a clean picture.
 */
export function RevealSetup({
  config,
  onChange,
  onStart,
  onClose,
  onFullscreen,
  isAr,
  winnerCount,
}: {
  config: RevealConfig;
  onChange: (patch: Partial<RevealConfig>) => void;
  onStart: () => void;
  onClose: () => void;
  onFullscreen: () => void;
  isAr: boolean;
  winnerCount: number;
}) {
  return (
    <div className="relative m-4 w-full max-w-lg space-y-5 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-lg">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute end-3 top-3"
        onClick={onClose}
        aria-label={isAr ? "إغلاق" : "Close"}
      >
        <X className="size-4" />
      </Button>

      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <Clapperboard className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold">
            {isAr ? "عرض إعلان الفائز" : "Winner reveal"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? `${winnerCount} للإعلان · عدّ تنازلي ثم سحب ثم الفائز`
              : `${winnerCount} to reveal · countdown, shuffle, winner`}
          </p>
        </div>
      </div>

      <Choice
        label={isAr ? "الشكل" : "Format"}
        value={config.format}
        onChange={(format) => onChange({ format })}
        options={[
          { value: "story", text: isAr ? "ستوري / ريلز 9:16" : "Story / Reel 9:16" },
          { value: "wide", text: isAr ? "عرضي ملء الشاشة" : "Wide, full screen" },
        ]}
      />
      <Choice
        label={isAr ? "العدّ التنازلي" : "Countdown"}
        value={config.countdownFrom}
        onChange={(countdownFrom) => onChange({ countdownFrom })}
        options={[3, 5, 10].map((n) => ({ value: n as 3 | 5 | 10, text: `${n}` }))}
      />
      <Choice
        label={isAr ? "مدة التبديل بين الأسماء (ثوانٍ)" : "Name shuffle (seconds)"}
        value={config.shuffleSeconds}
        onChange={(shuffleSeconds) => onChange({ shuffleSeconds })}
        options={[4, 6, 8].map((n) => ({ value: n as 4 | 6 | 8, text: `${n}` }))}
      />
      <Label className="flex items-center gap-2 text-sm font-normal">
        <Checkbox
          checked={config.sound}
          onCheckedChange={(checked) => onChange({ sound: checked === true })}
        />
        {isAr ? "مؤثرات صوتية" : "Sound effects"}
      </Label>

      <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
        {isAr
          ? "للتسجيل: ابدأ برنامج تسجيل الشاشة أولاً (على ويندوز: Win + Alt + R)، ثم اضغط «ابدأ». Esc للإغلاق، والمسافة للتخطي."
          : "To record: start your screen recorder first (on Windows: Win + Alt + R), then press Start. Esc closes, Space skips ahead."}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="lg" onClick={onStart} disabled={winnerCount === 0}>
          <Play className="size-4" />
          {isAr ? "ابدأ" : "Start"}
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={onFullscreen}>
          <Maximize className="size-4" />
          {isAr ? "ملء الشاشة" : "Full screen"}
        </Button>
      </div>
    </div>
  );
}
