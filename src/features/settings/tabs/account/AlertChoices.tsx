import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { alertKindsFor, alertOn } from "@/lib/alert-choices";
import { deviceAlertChoices, setDeviceAlertChoice } from "@/lib/web-push";

/**
 * Which kinds of alert this device takes, each saved on its switch (`set_web_push_alert_choices`).
 * A booking request is offered only where the store takes bookings.
 */
export function AlertChoices({ brandId, isAr }: { brandId: string; isAr: boolean }) {
  const id = useId();
  const { profile } = useAdminStoreProfile(brandId);
  const [choices, setChoices] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    void deviceAlertChoices()
      .then((saved) => setChoices(saved ?? {}))
      .catch(() => setChoices({}));
  }, []);

  const change = async (key: string, on: boolean) => {
    const before = choices;
    setChoices({ ...(choices ?? {}), [key]: on });
    setSaving(key);
    try {
      setChoices(await setDeviceAlertChoice(key, on));
    } catch {
      setChoices(before);
      toast.error(isAr ? "تعذّر حفظ اختيارك" : "Could not save your choice");
    } finally {
      setSaving(null);
    }
  };

  if (!choices) return null;
  return (
    <fieldset className="space-y-2 border-t border-border pt-3">
      <legend className="text-xs font-semibold text-muted-foreground">
        {isAr ? "ما يصل إلى هذا الجهاز" : "What reaches this device"}
      </legend>
      {alertKindsFor(profile.modules).map((kind) => {
        const label = isAr ? kind.label.ar : kind.label.en;
        return (
          <div key={kind.key} className="flex items-center justify-between gap-3">
            <label htmlFor={`${id}-${kind.key}`} className="min-w-0 cursor-pointer">
              <span className="block text-sm">{label}</span>
              <span className="block text-xs text-muted-foreground">
                {isAr ? kind.hint.ar : kind.hint.en}
              </span>
            </label>
            <Switch
              id={`${id}-${kind.key}`}
              checked={alertOn(choices, kind)}
              disabled={saving === kind.key}
              aria-label={label}
              onCheckedChange={(on) => void change(kind.key, on)}
            />
          </div>
        );
      })}
    </fieldset>
  );
}
