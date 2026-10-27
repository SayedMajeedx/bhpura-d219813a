/**
 * What makes the admin an installable app (a phone's home screen, a laptop's dock): its manifest,
 * the iPhone's icon and the standalone look. On the sign-in page and every admin page, so it can be
 * added from either; an iPhone takes order alerts only from the app added this way
 * (src/lib/web-push.ts). Storefront pages carry their store's own manifest instead.
 */
export function adminAppHead() {
  return {
    links: [
      { rel: "manifest", href: "/admin-app/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/admin-app/icon-180.png" },
    ],
    meta: [
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Boutq" },
    ],
  };
}
