import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useStorefront } from "@/lib/storefront-context";
import {
  NAV_PROGRESS_DELAY_MS,
  navigationWaiting,
} from "@/features/storefront-shell/lib/navigation-progress";

type Phase = "idle" | "running" | "done";

/**
 * A slim bar in the store's colour across the top of the screen while a tapped page is on its way
 * (`navigationWaiting`): it grows slowly towards the end while the page loads, runs to the end and
 * fades when the page is drawn, and never shows for a page that opens at once.
 */
export function NavigationProgress() {
  const { t } = useStorefront();
  const waiting = useRouterState({
    select: (state) =>
      navigationWaiting({
        isLoading: state.isLoading,
        pathname: state.location.pathname,
        shownPathname: state.resolvedLocation?.pathname,
      }),
  });
  const [phase, setPhase] = useState<Phase>("idle");
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    if (waiting) {
      const timer = setTimeout(() => setPhase("running"), NAV_PROGRESS_DELAY_MS);
      return () => clearTimeout(timer);
    }
    setPhase((current) => (current === "running" ? "done" : "idle"));
  }, [waiting]);

  useEffect(() => {
    if (phase === "running") {
      // Drawn short first, then let grow: a width set on the first frame would not move.
      const frame = requestAnimationFrame(() => setGrown(true));
      return () => cancelAnimationFrame(frame);
    }
    setGrown(false);
    if (phase === "done") {
      const timer = setTimeout(() => setPhase("idle"), 600);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  if (phase === "idle") return null;
  const done = phase === "done";
  return (
    <div
      role="progressbar"
      aria-label={t("جارٍ فتح الصفحة", "Opening the page")}
      className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top,0px)] z-50 h-0.5"
    >
      <div
        className="h-full bg-primary"
        style={{
          width: done ? "100%" : grown ? "85%" : "10%",
          opacity: done ? 0 : 1,
          // While loading it creeps towards the end and never quite gets there; once the page is
          // drawn it runs to the end and fades.
          transition: done
            ? "width var(--motion-quick) var(--motion-ease-smooth), opacity var(--motion-fast) var(--motion-ease-smooth) var(--motion-quick)"
            : "width 8s cubic-bezier(0.1, 0.6, 0.2, 1)",
        }}
      />
    </div>
  );
}
