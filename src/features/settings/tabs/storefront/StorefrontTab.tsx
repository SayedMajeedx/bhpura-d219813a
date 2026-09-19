import { ModeGroup } from "./ModeGroup";
import { HomeHeroGroup } from "./HomeHeroGroup";
import { HomeSectionsGroup } from "./HomeSectionsGroup";
import { HeaderFooterGroup } from "./HeaderFooterGroup";
import { AnnouncementGroup } from "./AnnouncementGroup";
import { LoaderGroup } from "./LoaderGroup";
import { SeoGroup } from "./SeoGroup";

export function StorefrontTab() {
  return (
    <div className="space-y-8">
      <section id="group-mode" aria-label="Storefront Mode">
        <ModeGroup />
      </section>

      <section id="group-home_hero" aria-label="Hero & Story">
        <HomeHeroGroup />
      </section>

      <section id="group-home_sections" aria-label="Sections & Promo Cards">
        <HomeSectionsGroup />
      </section>

      <section id="group-header_footer" aria-label="Header & Footer">
        <HeaderFooterGroup />
      </section>

      <section id="group-announcement" aria-label="Announcement Bar">
        <AnnouncementGroup />
      </section>

      <section id="group-loader" aria-label="Storefront Loader">
        <LoaderGroup />
      </section>

      <section id="group-seo" aria-label="Storefront SEO">
        <SeoGroup />
      </section>
    </div>
  );
}
