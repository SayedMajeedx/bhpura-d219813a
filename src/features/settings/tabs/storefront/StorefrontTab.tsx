import * as React from "react";
import {
  Bell,
  Globe,
  LayoutGrid,
  LayoutTemplate,
  Loader2,
  PanelTop,
  Sparkles,
  Store,
  Wand2,
} from "lucide-react";
import { GroupNavigator, type GroupDef } from "@/features/settings/GroupNavigator";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { isStorefrontV2 } from "@/lib/storefront-engine";
import { StorefrontDesignUpgradeCard } from "./StorefrontDesignUpgradeCard";
import { DesignV2Group } from "./DesignV2Group";
import { ModeGroup } from "./ModeGroup";
import { HomeHeroGroup } from "./HomeHeroGroup";
import { HomeSectionsGroup } from "./HomeSectionsGroup";
import { HeaderFooterGroup } from "./HeaderFooterGroup";
import { AnnouncementGroup } from "./AnnouncementGroup";
import { LoaderGroup } from "./LoaderGroup";
import { SeoGroup } from "./SeoGroup";

const GROUPS: GroupDef[] = [
  { id: "mode", icon: Store, render: () => <ModeGroup /> },
  { id: "home_hero", icon: LayoutTemplate, render: () => <HomeHeroGroup /> },
  { id: "home_sections", icon: LayoutGrid, render: () => <HomeSectionsGroup /> },
  { id: "header_footer", icon: PanelTop, render: () => <HeaderFooterGroup /> },
  { id: "announcement", icon: Bell, render: () => <AnnouncementGroup /> },
  { id: "loader", icon: Loader2, render: () => <LoaderGroup /> },
  { id: "seo", icon: Globe, render: () => <SeoGroup /> },
  {
    id: "upgrade",
    label: { ar: "ترقية المظهر", en: "Design upgrade" },
    icon: Wand2,
    render: () => <StorefrontDesignUpgradeCard />,
  },
  { id: "design_v2", icon: Sparkles, render: () => <DesignV2Group /> },
];

export function StorefrontTab() {
  const { form } = useBrandSettingsFormContext();
  // The Storefront 2.0 panel is read only by the V2 components, so it is hidden
  // entirely on a classic storefront. GroupNavigator falls back to the first
  // available group when the stored selection disappears.
  const isV2 = isStorefrontV2(form.bs);
  const groups = React.useMemo(
    () => GROUPS.filter((g) => (g.id === "design_v2" ? isV2 : true)),
    [isV2],
  );

  return <GroupNavigator tab="storefront" groups={groups} />;
}
