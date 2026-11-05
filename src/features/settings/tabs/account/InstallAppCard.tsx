import { useEffect, useId, useState } from "react";
import { CheckCircle2, Download, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import {
  installState,
  promptInstall,
  useInstallOffer,
  type InstallState,
} from "@/lib/install-prompt";
import { thisDevice } from "@/lib/web-push";

/**
 * In the account settings, above the alerts: the admin as an app on this device (the PWA review of
 * 2026-11-05). One tap where the browser can install it, the two taps in Safari on an iPhone, the
 * browser's menu elsewhere, and a line saying it is installed once it is.
 */
export function InstallAppCard() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const id = useId();
  const offer = useInstallOffer();
  const [device, setDevice] = useState<{ standalone: boolean; ios: boolean } | null>(null);
  useEffect(() => {
    const { standalone, ios } = thisDevice();
    setDevice({ standalone, ios });
  }, []);
  if (!device) return null;
  const state: InstallState = installState({ ...device, ...offer });

  const text: Record<InstallState, string> = {
    installed: isAr
      ? "Boutq مثبّت على هذا الجهاز: افتحه من الشاشة الرئيسية أو قائمة التطبيقات."
      : "Boutq is installed on this device: open it from the home screen or your apps.",
    prompt: isAr
      ? "ثبّت Boutq كتطبيق: يفتح من أيقونته بدون شريط المتصفح، ويُظهر عدد الطلبات الجديدة عليها."
      : "Install Boutq as an app: it opens from its icon without the browser's bar, and shows new orders on it.",
    ios: isAr
      ? "على iPhone وiPad: من Safari اضغط «مشاركة» ثم «إضافة إلى الشاشة الرئيسية»."
      : "On iPhone and iPad: in Safari tap Share, then Add to Home Screen.",
    "browser-menu": isAr
      ? "من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»."
      : "From your browser's menu choose Install app, or Add to Home screen.",
  };
  const Icon = state === "installed" ? CheckCircle2 : state === "ios" ? Share : Download;

  return (
    <section className="space-y-3 rounded-xl border border-border p-4" aria-labelledby={`${id}-t`}>
      <div className="flex items-start gap-2">
        <Icon
          className={`mt-0.5 h-4 w-4 shrink-0 ${state === "installed" ? "text-success" : "text-primary"}`}
          aria-hidden
        />
        <div className="min-w-0">
          <h3 id={`${id}-t`} className="text-sm font-semibold">
            {isAr ? "Boutq كتطبيق على هذا الجهاز" : "Boutq as an app on this device"}
          </h3>
          <p className="text-xs text-muted-foreground">{text[state]}</p>
        </div>
      </div>
      {state === "prompt" && (
        <Button type="button" size="sm" className="gap-1.5" onClick={() => void promptInstall()}>
          <Download className="h-4 w-4" aria-hidden />
          {isAr ? "تثبيت Boutq" : "Install Boutq"}
        </Button>
      )}
    </section>
  );
}
