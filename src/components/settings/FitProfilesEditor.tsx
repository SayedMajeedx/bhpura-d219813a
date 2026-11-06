import { Switch } from "@/components/ui/switch";
import { withFieldRequired, type FitProfileDefinition } from "@/lib/addons/addon-presets";

/**
 * Which of a store's measurements a shopper must fill in, one switch each. This is the one place
 * it is decided: the product page, the order editor and the customer's saved measurements all read
 * the store's profiles, whatever a product's own fields say.
 */
export function FitProfilesEditor({
  profiles,
  onChange,
  isAr,
}: {
  profiles: FitProfileDefinition[];
  onChange: (next: FitProfileDefinition[]) => void;
  isAr: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {profiles.map((profile) => {
        const profileName = isAr ? profile.label_ar : profile.label_en;
        return (
          <section key={profile.key} className="rounded-lg border border-border bg-card p-3">
            <h4 className="text-sm font-semibold text-foreground">{profileName}</h4>
            <ul className="mt-2 divide-y divide-border">
              {profile.fields.map((field) => {
                const label = isAr ? field.label_ar : field.label_en;
                return (
                  <li key={field.key} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 break-words text-xs font-medium">{label}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {field.required
                          ? isAr
                            ? "إجباري"
                            : "Required"
                          : isAr
                            ? "اختياري"
                            : "Optional"}
                      </span>
                      <Switch
                        aria-label={
                          isAr
                            ? `${label} إجباري في ${profileName}`
                            : `${label} required on ${profileName}`
                        }
                        checked={Boolean(field.required)}
                        onCheckedChange={(required) =>
                          onChange(withFieldRequired(profiles, profile.key, field.key, required))
                        }
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
