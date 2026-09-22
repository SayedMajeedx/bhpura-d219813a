import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Store, ChevronLeft, ChevronRight, Boxes } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStorefrontUrl } from "@/lib/storefront-url";
import { OsNavItem } from "./os-nav-item";
import { OsBrandSwitcher, type BrandRow } from "./os-brand-switcher";
import { OsAppsHubModal } from "./os-apps-hub-modal";
import { ADMIN_WORKSPACES, type AdminNavItemConfig } from "@/config/admin-navigation";

export interface OsSidebarProps {
  brandLabel: string;
  brandSubtitle: string;
  activeSlug: string | null;
  navItems: AdminNavItemConfig[];
  pathname: string;
  lang: "en" | "ar";
  isSuperAdmin: boolean;
  isCourier: boolean;
  brands: BrandRow[];
  collapsed: boolean;
  collapsible?: boolean;
  onToggleCollapse: () => void;
  className?: string;
}

export function OsSidebar({
  brandLabel,
  brandSubtitle,
  activeSlug,
  navItems,
  pathname,
  lang,
  isSuperAdmin,
  isCourier,
  brands,
  collapsed,
  collapsible = true,
  onToggleCollapse,
  className,
}: OsSidebarProps) {
  const isAr = lang === "ar";
  const [appsHubModalOpen, setAppsHubModalOpen] = React.useState(false);

  // Group items
  const isPlatformMode = !activeSlug && isSuperAdmin;

  const jobGroups = React.useMemo(() => {
    if (isPlatformMode || isCourier) return [];
    return ADMIN_WORKSPACES.map((group) => {
      const items = navItems.filter((i) => (i.workspace || i.category || "today") === group.id);
      if (group.id === "store_setup") {
        items.sort((a, b) => (a.id === "settings" ? -1 : b.id === "settings" ? 1 : 0));
      } else if (group.id === "catalog") {
        items.sort((a, b) => (a.id === "inventory" ? -1 : b.id === "inventory" ? 1 : 0));
      } else if (group.id === "operations") {
        items.sort((a, b) => (a.id === "orders" ? -1 : b.id === "orders" ? 1 : 0));
      }
      return {
        ...group,
        items,
      };
    }).filter((g) => g.items.length > 0);
  }, [navItems, isPlatformMode, isCourier]);

  return (
    <>
      <aside
        className={cn(
          "no-print hidden md:flex flex-col shrink-0 border border-[var(--os-border)] os-glass-strong shadow-xl transition-all duration-300 relative z-20 my-3 ms-3 rounded-[var(--os-radius-panel)] overflow-hidden select-none",
          collapsed ? "w-20" : "w-64",
          className,
        )}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-[var(--os-border)] flex items-center justify-between gap-2 bg-card/30">
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <span className="text-xl font-bold font-heading text-foreground truncate leading-tight block">
                {brandLabel}
              </span>
              <p className="text-xs text-muted-foreground truncate">{brandSubtitle}</p>
            </div>
          ) : (
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold font-heading text-base shadow-sm">
              {brandLabel.slice(0, 2).toUpperCase()}
            </div>
          )}

          {collapsible && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="h-7 w-7 rounded-lg hover:bg-muted/80 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors shrink-0 outline-none os-focus-ring"
              title={
                collapsed
                  ? isAr
                    ? "توسيع الشريط"
                    : "Expand sidebar"
                  : isAr
                    ? "طي الشريط"
                    : "Collapse sidebar"
              }
            >
              {collapsed ? (
                isAr ? (
                  <ChevronLeft className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )
              ) : isAr ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        {/* Super Admin Switcher */}
        {isSuperAdmin && (
          <OsBrandSwitcher
            activeSlug={activeSlug}
            brands={brands}
            lang={lang}
            pathname={pathname}
            collapsed={collapsed}
          />
        )}

        {/* View Storefront Quick Button */}
        {activeSlug && !isCourier && !collapsed && (
          <div className="px-3 pt-3">
            <a
              href={getStorefrontUrl(activeSlug)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-foreground/90 bg-muted/40 border border-[var(--os-border)] rounded-xl hover:bg-muted/80 transition-all shadow-2xs"
            >
              <Store className="h-3.5 w-3.5 text-primary" />
              <span>{isAr ? "عرض المتجر" : "View Storefront"}</span>
            </a>
          </div>
        )}

        {/* Main Nav List */}
        <nav className="flex-1 p-3 space-y-3 overflow-y-auto scrollbar-none">
          {/* Courier or Super Admin Platform Mode */}
          {isPlatformMode || isCourier ? (
            <div className="flex flex-col gap-1">
              {navItems.map((item) => {
                const targetPath = item.to.replace("$slug", item.params?.slug ?? "");
                const active = pathname.startsWith(targetPath);
                const label = isAr ? item.labelAr : item.labelEn;

                return (
                  <Link
                    key={item.id}
                    to={item.to as any}
                    params={item.params as any}
                    preload="intent"
                    className="block"
                  >
                    <OsNavItem
                      icon={item.icon}
                      label={label}
                      active={active}
                      collapsed={collapsed}
                      badge={item.badge}
                    />
                  </Link>
                );
              })}
            </div>
          ) : !collapsed ? (
            /* Expanded: 6 Master Workspaces */
            <div className="space-y-4">
              {jobGroups.map((group) => {
                const GroupIcon = group.icon;
                const isCurrentWorkspace = group.items.some((i) => {
                  const targetPath = i.to.replace("$slug", i.params?.slug ?? "");
                  return pathname.startsWith(targetPath);
                });

                return (
                  <div key={group.id} className="space-y-1">
                    <div
                      className={cn(
                        "flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider transition-colors",
                        isCurrentWorkspace ? "text-primary bg-primary/10" : "text-muted-foreground",
                      )}
                    >
                      <span className="flex items-center gap-1.5 truncate uppercase">
                        {GroupIcon && <GroupIcon className="h-3 w-3 shrink-0" />}
                        <span>{isAr ? group.labelAr : group.labelEn}</span>
                      </span>
                      <span className="text-xs font-semibold opacity-70 px-1.5 py-0.5 rounded bg-muted/60">
                        {group.items.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {group.items.map((item) => {
                        const targetPath = item.to.replace("$slug", item.params?.slug ?? "");
                        const active = pathname.startsWith(targetPath);
                        const label = isAr ? item.labelAr : item.labelEn;

                        return (
                          <Link
                            key={item.id}
                            to={item.to as any}
                            params={item.params as any}
                            preload="intent"
                            className="block"
                          >
                            <OsNavItem
                              icon={item.icon}
                              label={label}
                              active={active}
                              collapsed={false}
                              badge={item.badge}
                            />
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Collapsed: Icon-only Workspaces */
            <div className="flex flex-col gap-2">
              {jobGroups.map((group, groupIdx) => (
                <React.Fragment key={group.id}>
                  {groupIdx > 0 && <div className="h-px bg-border/40 mx-2 my-1" />}
                  <div className="flex flex-col gap-1">
                    {group.items.map((item) => {
                      const targetPath = item.to.replace("$slug", item.params?.slug ?? "");
                      const active = pathname.startsWith(targetPath);
                      const label = isAr ? item.labelAr : item.labelEn;

                      return (
                        <Link
                          key={item.id}
                          to={item.to as any}
                          params={item.params as any}
                          preload="intent"
                          className="block"
                        >
                          <OsNavItem
                            icon={item.icon}
                            label={label}
                            active={active}
                            collapsed={true}
                            badge={item.badge}
                          />
                        </Link>
                      );
                    })}
                  </div>
                </React.Fragment>
              ))}
            </div>
          )}
        </nav>

        {/* Apps Hub Trigger Footer */}
        {activeSlug && !isCourier && (
          <div className="p-2.5 border-t border-[var(--os-border)] bg-card/20">
            {!collapsed ? (
              <button
                type="button"
                onClick={() => setAppsHubModalOpen(true)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl bg-muted/40 hover:bg-muted/70 border border-border-subtle text-muted-foreground hover:text-foreground transition-all shadow-2xs"
              >
                <div className="flex items-center gap-2">
                  <Boxes className="h-4 w-4 text-primary" />
                  <span>{isAr ? "دليل مساحات العمل والأدوات" : "Workspaces Directory"}</span>
                </div>
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {navItems.length}
                </span>
              </button>
            ) : (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setAppsHubModalOpen(true)}
                  title={isAr ? "دليل مساحات العمل والأدوات" : "Workspaces Directory"}
                  className="h-9 w-9 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary flex items-center justify-center transition-all shadow-2xs border border-primary/20"
                >
                  <Boxes className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Apps Hub Modal */}
      {activeSlug && !isCourier && (
        <OsAppsHubModal
          open={appsHubModalOpen}
          onOpenChange={setAppsHubModalOpen}
          activeSlug={activeSlug}
          navItems={navItems}
          lang={lang}
        />
      )}
    </>
  );
}
