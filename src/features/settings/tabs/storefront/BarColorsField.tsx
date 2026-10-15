import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ColorField } from "@/features/settings/shared/ColorField";

/**
 * A bar's two colours (the header, the side menu, the classic footer): one tap for white, the
 * store's colour or dark, then each colour on its own. They were in the palette, twice (its quick
 * step and its advanced colours), away from the bar they paint.
 */
export function BarColorsField({
  label,
  bg,
  fg,
  brandColor,
  isAr,
  onChange,
}: {
  label: string;
  bg: string | null | undefined;
  fg: string | null | undefined;
  brandColor: string;
  isAr: boolean;
  onChange: (colors: { bg: string | null; fg: string | null }) => void;
}) {
  const presets = [
    { id: "light", label: isAr ? "أبيض" : "White", bg: "#ffffff", fg: "#111111" },
    { id: "brand", label: isAr ? "لون الهوية" : "Brand colour", bg: brandColor, fg: "#ffffff" },
    { id: "dark", label: isAr ? "داكن" : "Dark", bg: "#111111", fg: "#ffffff" },
  ];
  const same = (a: string | null | undefined, b: string) =>
    (a ?? "").toLowerCase() === b.toLowerCase();
  return (
    <div className="min-w-0 space-y-3">
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
          {presets.map((preset) => {
            const on = same(bg, preset.bg) && same(fg, preset.fg);
            return (
              <Button
                key={preset.id}
                type="button"
                size="sm"
                variant={on ? "default" : "outline"}
                aria-pressed={on}
                className="gap-2"
                onClick={() => onChange({ bg: preset.bg, fg: preset.fg })}
              >
                <span
                  className="size-3.5 rounded-full border border-border"
                  style={{ backgroundColor: preset.bg }}
                  aria-hidden="true"
                />
                {preset.label}
              </Button>
            );
          })}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ColorField
          label={isAr ? "الخلفية" : "Background"}
          value={bg ?? null}
          onChange={(value) => onChange({ bg: value, fg: fg ?? null })}
        />
        <ColorField
          label={isAr ? "النص والأيقونات" : "Text & icons"}
          value={fg ?? null}
          onChange={(value) => onChange({ bg: bg ?? null, fg: value })}
        />
      </div>
    </div>
  );
}
