import { useEffect, useState } from "react";
import { Boxes, ShoppingBag, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

const TAGLINES = {
  en: [
    "Orders that move on their own.",
    "Stock that keeps its own count.",
    "Deliveries that close the loop.",
  ],
  ar: ["طلبات تمضي من تلقاء نفسها.", "مخزون يحصي نفسه بدقة.", "توصيل يُغلق الدائرة بإتقان."],
} as const;

const CAPABILITIES = [
  { icon: ShoppingBag, en: "Orders", ar: "الطلبات" },
  { icon: Boxes, en: "Inventory", ar: "المخزون" },
  { icon: Truck, en: "Deliveries", ar: "التوصيل" },
] as const;

const ROTATE_MS = 4200;

/** The next tagline every few seconds, unless the visitor asked for less motion. */
function useRotatingIndex(length: number) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % length), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [length]);
  return index;
}

/**
 * A thread of silk looping through the upper half of the panel (clear of the
 * headline), with a stitch line along the bottom.
 */
function SilkThread() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full rtl:-scale-x-100"
      viewBox="0 0 600 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <path
        className="auth-thread"
        pathLength={1}
        strokeWidth={1.4}
        opacity={0.55}
        d="M660 90 C 520 60 360 90 330 190 S 470 330 520 250 S 420 110 300 180 S 210 420 380 470 S 600 430 660 470"
      />
      <path
        className="auth-thread-glint"
        pathLength={1}
        strokeWidth={2.2}
        d="M660 90 C 520 60 360 90 330 190 S 470 330 520 250 S 420 110 300 180 S 210 420 380 470 S 600 430 660 470"
      />
      <path
        className="auth-thread"
        pathLength={1}
        strokeWidth={0.8}
        opacity={0.25}
        d="M660 150 C 540 120 400 150 380 240 S 500 360 560 300 S 470 160 360 230 S 280 440 440 500 S 620 470 660 520"
      />
      <path className="auth-stitch" strokeWidth={1} opacity={0.22} d="M0 760 L 600 740" />
    </svg>
  );
}

/**
 * The sign-in page's brand side: the maroon canvas with drifting light, the
 * silk thread, the headline and a rotating line about what Boutq runs. It is
 * decorative (no heading: the form owns the page's h1). `compact` is the
 * phone header above the form.
 */
export function SignInBrandPanel({
  lang,
  title,
  compact = false,
}: {
  lang: "en" | "ar";
  title: string;
  compact?: boolean;
}) {
  const taglines = TAGLINES[lang];
  const index = useRotatingIndex(taglines.length);

  return (
    <div
      className={cn(
        "auth-brand flex flex-col",
        compact ? "rounded-xl px-6 py-7" : "h-full min-h-dvh px-12 py-12 xl:px-16",
      )}
    >
      <div className="auth-aurora auth-aurora--wine" />
      <div className="auth-aurora auth-aurora--rose" />
      <div className="auth-aurora auth-aurora--silk" />
      <div className="auth-grain" />
      {!compact && <SilkThread />}

      <div
        className="auth-rise flex items-center gap-2.5"
        style={{ "--auth-delay": "80ms" } as React.CSSProperties}
      >
        <span className="font-display text-2xl leading-none tracking-tight">{title}</span>
        <span className="rounded-sm border border-current/25 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-[0.18em] opacity-80">
          OS
        </span>
      </div>

      <div className={cn("flex flex-col", compact ? "mt-5 gap-2" : "mt-auto gap-6 pb-10")}>
        <p
          className={cn(
            "auth-rise font-display leading-[1.05] tracking-tight",
            compact ? "text-3xl" : "text-5xl xl:text-6xl",
          )}
          style={{ "--auth-delay": "220ms" } as React.CSSProperties}
        >
          {lang === "ar" ? "أدِر البوتيك" : "Run your boutique"}
          <br />
          <span className="italic opacity-80">{lang === "ar" ? "بأناقة." : "beautifully."}</span>
        </p>
        <p
          className="auth-rise min-h-[1.75rem] text-base opacity-75 xl:text-lg"
          style={{ "--auth-delay": "360ms" } as React.CSSProperties}
          aria-live="off"
        >
          <span key={index} className="auth-swap inline-block">
            {taglines[index]}
          </span>
        </p>
      </div>

      {!compact && (
        <div
          className="auth-rise flex items-center justify-between gap-6 border-t border-current/15 pt-6"
          style={{ "--auth-delay": "500ms" } as React.CSSProperties}
        >
          <ul className="flex flex-wrap gap-2">
            {CAPABILITIES.map(({ icon: Icon, en, ar }, i) => (
              <li
                key={en}
                className={cn(
                  "flex items-center gap-2 rounded-full border border-current/15 px-3 py-1.5 text-xs transition-opacity duration-500",
                  i === index ? "opacity-100" : "opacity-55",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {lang === "ar" ? ar : en}
              </li>
            ))}
          </ul>
          <span className="shrink-0 text-xs opacity-55">
            {lang === "ar" ? "صُنع لبوتيكات الخليج" : "Made for GCC boutiques"}
          </span>
        </div>
      )}
    </div>
  );
}
