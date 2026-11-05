import type { AddonId, Bilingual } from "./addon-types";

export type AddonKeyFeature = {
  icon: string;
  title: Bilingual;
  description: Bilingual;
};

export type AddonWorkflowStep = {
  step: number;
  title: Bilingual;
  description: Bilingual;
};

export type AddonFaq = {
  q: Bilingual;
  a: Bilingual;
};

export type AddonPreviewMockup = {
  storefront: {
    title: Bilingual;
    subtitle: Bilingual;
    bullets: Bilingual[];
    tag?: Bilingual;
  };
  admin: {
    title: Bilingual;
    subtitle: Bilingual;
    bullets: Bilingual[];
    tag?: Bilingual;
  };
};

export type AddonShowcaseItem = {
  id: AddonId;
  tagline: Bilingual;
  categoryLabel: Bilingual;
  badge?: Bilingual;
  publisher: Bilingual;
  highlights: Bilingual[];
  fullOverview: Bilingual;
  keyFeatures: AddonKeyFeature[];
  workflowSteps: AddonWorkflowStep[];
  faqs: AddonFaq[];
  previewMockup: AddonPreviewMockup;
};
