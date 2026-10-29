import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColorField } from "@/features/settings/shared/ColorField";
import { HERO_LOOK_PRESETS, slideLook, type HeroHeadlineFields } from "@/lib/hero-headline";

type SlideLookFields = Pick<
  HeroHeadlineFields,
  "text_tone" | "shade" | "text_color" | "button_color" | "button_text_color"
>;
type StoreLook = { hero_overlay_strength?: number | null; hero_title_color_v2?: string | null };

const SHADE_MAX = 80;
const shadeOf = (value: number | null | undefined) => value ?? 45;

/**
 * The shade and title colour every slide starts from (a slide may choose its own). They lived in
 * the design tab, far from the hero they change.
 */
export function HeroStoreLookFields({
  store,
  isAr,
  onChange,
}: {
  store: StoreLook;
  isAr: boolean;
  onChange: (patch: {
    hero_overlay_strength?: number;
    hero_title_color_v2?: string | null;
  }) => void;
}) {
  const shade = shadeOf(store.hero_overlay_strength);
  return (
    <fieldset className="min-w-0 space-y-3 rounded-xl border border-border p-3">
      <legend className="px-1 text-sm font-semibold">
        {isAr ? "الافتراضي لكل الشرائح" : "Default for every slide"}
      </legend>
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "التعتيم فوق الوسائط ولون العنوان لكل شريحة لم تختر شكلها بنفسها."
          : "The shade over the media and the title colour of every slide that has not chosen its own."}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <ShadeRange
          id="hero-store-shade"
          label={isAr ? "قوة التعتيم" : "Shade strength"}
          value={shade}
          onChange={(value) => onChange({ hero_overlay_strength: value })}
        />
        <ColorField
          label={isAr ? "لون العنوان (فارغ = أبيض)" : "Title colour (empty = white)"}
          value={store.hero_title_color_v2 || null}
          onChange={(value) => onChange({ hero_title_color_v2: value })}
        />
      </div>
    </fieldset>
  );
}

/**
 * A slide's own look: light text over a dark shade (a dark video) or dark text over a light one
 * (a light video), how strong the shade is and the title's colour. Until the slide chooses, it
 * follows the store's default.
 */
export function HeroSlideLookFields({
  idPrefix,
  slide,
  store,
  isAr,
  onChange,
}: {
  idPrefix: string;
  slide: SlideLookFields;
  store: StoreLook;
  isAr: boolean;
  onChange: (patch: SlideLookFields) => void;
}) {
  const look = slideLook(slide, store);
  const ownShade = slide.shade != null;
  const presets = [
    {
      key: "dark_video" as const,
      label: isAr ? "فيديو داكن — نص فاتح" : "Dark video — light text",
      on: look.tone === "light",
    },
    {
      key: "light_video" as const,
      label: isAr ? "فيديو فاتح — نص داكن" : "Light video — dark text",
      on: look.tone === "dark",
    },
  ];
  return (
    <fieldset className="min-w-0 space-y-3 rounded-xl border border-border p-3">
      <legend className="px-1 text-sm font-semibold">
        {isAr ? "شكل النص والتعتيم" : "Text and shade"}
      </legend>
      <div className="min-w-0 space-y-1.5">
        <Label>{isAr ? "الوسائط خلف النص" : "The media behind the text"}</Label>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={isAr ? "الوسائط خلف النص" : "The media behind the text"}
        >
          {presets.map((preset) => (
            <Button
              key={preset.key}
              type="button"
              size="sm"
              variant={preset.on ? "default" : "outline"}
              aria-pressed={preset.on}
              onClick={() => onChange({ ...HERO_LOOK_PRESETS[preset.key] })}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <ShadeRange
            id={`${idPrefix}-hero-shade`}
            label={isAr ? "قوة التعتيم" : "Shade strength"}
            value={look.shade}
            onChange={(value) => onChange({ shade: value })}
            note={
              ownShade ? undefined : isAr ? "من الافتراضي لكل الشرائح" : "From the store default"
            }
          />
          {ownShade && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ shade: undefined })}
            >
              {isAr ? "رجوع للافتراضي" : "Use the default"}
            </Button>
          )}
        </div>
        <ColorField
          label={isAr ? "لون العنوان (فارغ = حسب النص)" : "Title colour (empty = follows the text)"}
          value={slide.text_color?.trim() || null}
          onChange={(value) => onChange({ text_color: value ?? "" })}
        />
        <ColorField
          label={
            isAr ? "لون الزر (فارغ = لون المتجر)" : "Button colour (empty = the store's colour)"
          }
          value={slide.button_color?.trim() || null}
          onChange={(value) => onChange({ button_color: value ?? "" })}
        />
        <ColorField
          label={isAr ? "لون نص الزر (فارغ = تلقائي)" : "Button text colour (empty = automatic)"}
          value={slide.button_text_color?.trim() || null}
          onChange={(value) => onChange({ button_text_color: value ?? "" })}
        />
      </div>
    </fieldset>
  );
}

function ShadeRange({
  id,
  label,
  value,
  onChange,
  note,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  note?: string;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="range"
        min={0}
        max={SHADE_MAX}
        step={5}
        value={Math.min(SHADE_MAX, value)}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-valuetext={`${value}%`}
      />
      <p className="text-xs text-muted-foreground">
        {value}%{note ? ` · ${note}` : ""}
      </p>
    </div>
  );
}
