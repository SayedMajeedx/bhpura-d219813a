import { useLocation } from "@tanstack/react-router";
import React from "react";
import { useStorefront } from "@/lib/storefront-context";

/** The floating WhatsApp button, raised above the sticky buy bar on product and checkout pages. */
export function WhatsAppFab() {
  const { settings, lang, brand } = useStorefront();
  const { pathname } = useLocation();
  const isEmbedded =
    typeof window !== "undefined" &&
    (window.self !== window.top || window.location.search.includes("preview=1"));
  if (isEmbedded) return null;
  if (!settings.whatsapp_enabled) return null;
  const digits = (settings.whatsapp_number ?? "").replace(/\D/g, "");
  if (!digits) return null;

  // Detect pages that render a sticky mobile bottom action bar
  const hasStickyBottom = pathname.includes("/product/") || pathname.endsWith("/checkout");

  const text =
    lang === "ar"
      ? `مرحباً! لدي استفسار عن متجر ${brand.name_ar || brand.name_en}`
      : `Hi! I have a question about ${brand.name_en}`;
  const href = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={lang === "ar" ? "تواصل معنا عبر واتساب" : "Contact us on WhatsApp"}
      className={`fixed z-50 ${
        hasStickyBottom
          ? "bottom-[calc(88px+env(safe-area-inset-bottom,0px))] md:bottom-6"
          : "bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] md:bottom-6"
      } end-5 h-14 w-14 rounded-full grid place-items-center shadow-lg hover:scale-110 active:scale-95 touch-manipulation`}
      style={{
        backgroundColor: "#25D366",
        color: "#fff",
        transition:
          "transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s ease, bottom 0.4s cubic-bezier(0.25, 1, 0.5, 1)",
        willChange: "transform",
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-7 w-7"
        aria-hidden="true"
      >
        <path d="M20.52 3.48A11.94 11.94 0 0 0 12.06 0C5.5 0 .2 5.3.2 11.86c0 2.09.55 4.13 1.6 5.93L0 24l6.38-1.67a11.86 11.86 0 0 0 5.68 1.45h.01c6.56 0 11.86-5.3 11.86-11.86 0-3.17-1.23-6.15-3.41-8.44ZM12.07 21.5h-.01a9.63 9.63 0 0 1-4.9-1.34l-.35-.21-3.79.99 1.01-3.7-.23-.38a9.63 9.63 0 0 1-1.48-5.15c0-5.32 4.33-9.65 9.66-9.65 2.58 0 5 1 6.83 2.83a9.6 9.6 0 0 1 2.82 6.82c0 5.32-4.33 9.65-9.66 9.65Zm5.29-7.23c-.29-.15-1.71-.85-1.98-.94-.27-.1-.46-.15-.66.14-.19.29-.75.94-.92 1.13-.17.19-.34.22-.63.07-.29-.14-1.23-.45-2.35-1.44-.87-.77-1.46-1.72-1.63-2.01-.17-.29-.02-.44.13-.59.13-.13.29-.34.44-.51.14-.17.19-.29.29-.48.1-.19.05-.36-.02-.51-.07-.14-.66-1.58-.9-2.17-.24-.58-.48-.5-.66-.51h-.56c-.19 0-.51.07-.77.36-.27.29-1.02 1-1.02 2.44 0 1.44 1.05 2.83 1.2 3.02.14.19 2.07 3.15 5.02 4.42.7.3 1.24.48 1.66.62.7.22 1.33.19 1.83.11.56-.08 1.71-.7 1.96-1.38.24-.68.24-1.26.17-1.38-.07-.12-.26-.19-.55-.34Z" />
      </svg>
    </a>
  );
}
