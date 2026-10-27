import { useEffect, useId, useState } from "react";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
import {
  alertsAvailability,
  currentAlertSubscription,
  showTestAlert,
  thisDevice,
  turnOffOrderAlerts,
  turnOnOrderAlerts,
} from "@/lib/web-push";

type State = "loading" | "needs-install" | "unsupported" | "blocked" | "off" | "on";

/**
 * In the account settings: this device's alerts for new orders while the app is closed (Web Push,
 * src/lib/web-push.ts). Per device and per person; the sound is the device's own.
 */
export function OrderAlertsSettings() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const id = useId();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const availability = alertsAvailability(thisDevice());
    if (availability !== "supported") return setState(availability);
    if (Notification.permission === "denied") return setState("blocked");
    void currentAlertSubscription().then((sub) => setState(sub ? "on" : "off"));
  }, []);

  const turnOn = async () => {
    setBusy(true);
    try {
      setState(await turnOnOrderAlerts(brand.id));
    } catch {
      toast.error(isAr ? "تعذّر تفعيل التنبيهات على هذا الجهاز" : "Could not turn alerts on here");
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    try {
      await turnOffOrderAlerts();
      setState("off");
    } catch {
      toast.error(isAr ? "تعذّر إيقاف التنبيهات" : "Could not turn alerts off");
    } finally {
      setBusy(false);
    }
  };

  const note: Partial<Record<State, string>> = {
    "needs-install": isAr
      ? "على iPhone: من Safari اضغط «مشاركة» ثم «إضافة إلى الشاشة الرئيسية»، وافتح Boutq من الشاشة الرئيسية وفعّل التنبيهات هنا."
      : "On iPhone: in Safari tap Share, then Add to Home Screen; open Boutq from the home screen and turn alerts on here.",
    unsupported: isAr ? "هذا المتصفح لا يدعم التنبيهات." : "This browser cannot show alerts.",
    blocked: isAr
      ? "التنبيهات محجوبة لـ Boutq في إعدادات المتصفح أو الجهاز."
      : "Notifications are blocked for Boutq in this browser's or device's settings.",
  };

  return (
    <section className="space-y-3 rounded-xl border border-border p-4" aria-labelledby={`${id}-t`}>
      <div className="flex items-start gap-2">
        <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <h3 id={`${id}-t`} className="text-sm font-semibold">
            {isAr ? "تنبيهات الطلبات على هذا الجهاز" : "Order alerts on this device"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "إشعار بصوت الجهاز عند كل طلب جديد، حتى والتطبيق مغلق."
              : "A notification with your device's sound for every new order, even while the app is closed."}
          </p>
        </div>
      </div>
      {note[state] ? <p className="text-xs text-muted-foreground">{note[state]}</p> : null}
      {state === "off" ? (
        <Button type="button" size="sm" disabled={busy} onClick={turnOn}>
          {isAr ? "تفعيل التنبيهات" : "Turn on alerts"}
        </Button>
      ) : null}
      {state === "on" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-success">{isAr ? "مفعّلة" : "On"}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              void showTestAlert(
                isAr ? "تنبيه تجريبي" : "Test alert",
                isAr ? "هكذا يصلك كل طلب جديد" : "This is how each new order arrives",
              )
            }
          >
            {isAr ? "تنبيه تجريبي" : "Send a test"}
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={turnOff}>
            {isAr ? "إيقاف" : "Turn off"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
