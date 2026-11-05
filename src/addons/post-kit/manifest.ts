import React from "react";
import type { AddonManifest } from "@/lib/addons/addon-types";

/**
 * A store's own ready-made social posts. It holds one store's words and logo, so it is private:
 * the add-on store lists it only for the platform's owner, who installs it for that store.
 */
export const postKitManifest: AddonManifest = {
  id: "post-kit",
  version: 1,
  kind: "feature",
  private: true,
  name: { ar: "عدّة البوستات", en: "Post kit" },
  description: {
    ar: "بوستات مضحكة جاهزة بلهجة المتجر، تتعدل وتتحمل من استوديو المحتوى",
    en: "Ready-made funny posts in the store's own voice, edited and saved from the content studio",
  },
  whatItAdds: [
    {
      ar: "صفحة بوستات جاهزة في استوديو المحتوى",
      en: "A page of ready posts in the content studio",
    },
    { ar: "صور المنتجات وأسعارها من المتجر مباشرة", en: "Product photos and prices read live" },
  ],
  icon: "Sticker",
  activities: [],
  contributions: {
    slots: [
      {
        id: "post-kit-studio-link",
        addonId: "post-kit",
        placement: "admin.contentStudio.action",
        order: 10,
        component: React.lazy(() => import("./components/PostKitLink")),
      },
    ],
  },
};
