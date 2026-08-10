import { useEffect, useRef } from "react";
const TURNSTILE_SITE_KEY = "0x4AAAAAAEKct6A0er_uRCEI";
const TURNSTILE_ACTION = "turnstile-spin-v2";
const TURNSTILE_SCRIPT_ID = "cloudflare-turnstile-script";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");

    const handleLoad = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("TURNSTILE_API_UNAVAILABLE"));
    };
    const handleError = () => reject(new Error("TURNSTILE_SCRIPT_FAILED"));

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existing) {
      script.id = TURNSTILE_SCRIPT_ID;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
}

export function TurnstileWidget({
  onVerify,
  language,
  resetKey,
}: {
  onVerify: (token: string | null) => void;
  language: "ar" | "en";
  resetKey: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let widgetId: string | undefined;
    onVerify(null);

    void loadTurnstile()
      .then((api) => {
        if (disposed || !containerRef.current) return;
        widgetId = api.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action: TURNSTILE_ACTION,
          theme: "auto",
          language,
          size: "flexible",
          callback: (token: string) => onVerify(token),
          "expired-callback": () => onVerify(null),
          "error-callback": () => onVerify(null),
        });
      })
      .catch(() => onVerify(null));

    return () => {
      disposed = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [language, onVerify, resetKey]);

  return (
    <div className="w-full min-w-0 space-y-1.5">
      <div
        ref={containerRef}
        dir="ltr"
        className="flex min-h-[65px] w-full min-w-0 justify-center overflow-visible [&>div]:w-full [&_iframe]:max-w-full"
      />
      <p className="text-center text-[10px] text-muted-foreground">
        {language === "ar"
          ? "أكمل فحص الأمان قبل المتابعة."
          : "Complete the security check before continuing."}
      </p>
    </div>
  );
}
