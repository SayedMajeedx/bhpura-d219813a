/**
 * What makes the admin an installable app (a phone's home screen, a laptop's dock): its manifest,
 * the iPhone's icon and the standalone look. On the sign-in page and every admin page, so it can be
 * added from either; an iPhone takes order alerts only from the app added this way
 * (src/lib/web-push.ts). Storefront pages carry their store's own manifest instead.
 *
 * An iPhone or iPad opening the app shows a launch screen only if one is given for its exact screen
 * (the PWA review of 2026-11-05: it flashed white). Each is Boutq's mark on its ink, as the
 * manifest's `background_color` gives Android (`public/admin-app/splash/`). The status bar keeps
 * iOS's default style: a translucent bar would write white over the admin's light top bar.
 */

/** Portrait screens of current iPhones and iPads: CSS width and height, and pixel ratio. */
export const LAUNCH_SCREENS: ReadonlyArray<readonly [number, number, number]> = [
  [440, 956, 3],
  [402, 874, 3],
  [430, 932, 3],
  [393, 852, 3],
  [390, 844, 3],
  [375, 812, 3],
  [360, 780, 3],
  [414, 896, 3],
  [414, 896, 2],
  [375, 667, 2],
  [1024, 1366, 2],
  [834, 1194, 2],
  [820, 1180, 2],
  [810, 1080, 2],
  [744, 1133, 2],
];

export function launchScreenLinks() {
  return LAUNCH_SCREENS.map(([w, h, ratio]) => ({
    rel: "apple-touch-startup-image",
    href: `/admin-app/splash/splash-${w * ratio}x${h * ratio}.png`,
    media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`,
  }));
}

export function adminAppHead() {
  return {
    links: [
      { rel: "manifest", href: "/admin-app/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/admin-app/icon-180.png" },
      ...launchScreenLinks(),
    ],
    meta: [
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Boutq" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
    ],
  };
}
