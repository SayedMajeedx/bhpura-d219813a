import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/** Banners that move slower than the page while it scrolls (home sections and category pages). */
export function BannerMotionFields({ isAr }: { isAr: boolean }) {
  const { form, setBs } = useBrandSettingsFormContext();
  const bs = form.bs;
  return (
    <div className="rounded-xl border border-border p-4 bg-background space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label className="cursor-pointer text-xs font-semibold">
            {isAr ? "تفعيل حركة البارالاكس للبنرات" : "Enable Banner Parallax"}
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAr ? "حركة عمق ثلاثية الأبعاد مع السكرول" : "Smooth depth scroll motion"}
          </p>
        </div>
        <Switch
          checked={bs.secondary_banner_parallax_enabled ?? false}
          onCheckedChange={(checked) => setBs({ secondary_banner_parallax_enabled: checked })}
        />
      </div>

      {bs.secondary_banner_parallax_enabled && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="cursor-pointer text-xs font-medium">
                {isAr ? "تفعيل التأثير على الموبايل" : "Enable on Mobile"}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr ? "قد يؤثر قليلاً على بطارية الهاتف" : "Slight battery impact"}
              </p>
            </div>
            <Switch
              checked={bs.secondary_banner_parallax_mobile_enabled ?? false}
              onCheckedChange={(checked) =>
                setBs({ secondary_banner_parallax_mobile_enabled: checked })
              }
            />
          </div>

          <div>
            <Label className="text-xs font-medium">
              {isAr ? "نقطة توقف الشاشة للبارالاكس (px)" : "Desktop Breakpoint (px)"}
            </Label>
            <Input
              type="number"
              min={320}
              max={1920}
              className="mt-1.5 text-xs h-9"
              value={bs.secondary_banner_parallax_breakpoint ?? 768}
              onChange={(e) =>
                setBs({
                  secondary_banner_parallax_breakpoint: Math.max(
                    320,
                    Math.min(1920, Number(e.target.value) || 768),
                  ),
                })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
