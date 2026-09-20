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
  return <GroupNavigator tab="storefront" groups={GROUPS} />;
}
