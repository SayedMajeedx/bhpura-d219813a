import React, { Suspense, lazy, useEffect, useId, useState } from "react";
import { listenForCartOpen, triggerShown } from "@/lib/cart-drawer";
import { useStorefront } from "@/lib/storefront-context";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { isCatalogMode } from "@/lib/storefront-mode";

// The drawer's contents load when it first opens, or once the page is idle so the first tap opens
// at once: on every page they were in the first scripts, before the hero (PageSpeed, 2026-11-14).
const loadBody = () => import("@/components/storefront/CartDrawerBody");
const CartDrawerBody = lazy(loadBody);

export function CartDrawer({ children }: { children: React.ReactNode }) {
  const { lang, settings } = useStorefront();

  const [open, setOpen] = useState(false);
  // "Add to cart" opens this drawer when its button is the one on screen (`cart-drawer.ts`).
  const triggerId = useId();
  useEffect(
    () =>
      listenForCartOpen(() => {
        const trigger = document.querySelector(`[data-cart-trigger="${CSS.escape(triggerId)}"]`);
        if (!triggerShown(trigger)) return false;
        setOpen(true);
        return true;
      }),
    [triggerId],
  );
  useEffect(() => preloadWhenIdle(loadBody), []);
  if (isCatalogMode(settings)) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild data-cart-trigger={triggerId}>
        {children}
      </SheetTrigger>
      <SheetContent
        side={lang === "ar" ? "left" : "right"}
        dir={lang === "ar" ? "rtl" : "ltr"}
        className={`w-full sm:max-w-md flex flex-col ${lang === "ar" ? "[&>button]:left-auto [&>button]:right-4" : ""}`}
      >
        {open && (
          <Suspense fallback={null}>
            <CartDrawerBody onClose={() => setOpen(false)} />
          </Suspense>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Fetches the drawer's script after the page has loaded, in an idle moment. */
function preloadWhenIdle(load: () => Promise<unknown>): () => void {
  let cancelled = false;
  let timer: number | undefined;
  const run = () => {
    if (cancelled) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const go = () => {
      if (!cancelled) load().catch(() => {});
    };
    if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(go);
    else timer = window.setTimeout(go, 1500);
  };
  if (document.readyState === "complete") run();
  else window.addEventListener("load", run, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener("load", run);
    if (timer !== undefined) window.clearTimeout(timer);
  };
}
