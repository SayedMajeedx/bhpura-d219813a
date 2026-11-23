import * as React from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { TabsPill } from "@/components/motion/TabsPill";
import { SEGMENT_TRACK, segmentCount, segmentTab } from "@/components/ui/segmented";
import { type AdminNavItemConfig, workspaceTabs } from "@/config/admin-navigation";

export interface OsWorkspaceTabsProps {
  navItems: AdminNavItemConfig[];
  pathname: string;
  lang: "en" | "ar";
  activeSlug?: string | null;
  className?: string;
}

export function OsWorkspaceTabs({
  navItems,
  pathname,
  lang,
  activeSlug,
  className,
}: OsWorkspaceTabsProps) {
  const isAr = lang === "ar";
  // The open workspace's pages in view (and a folded page while it is the one open).
  const {
    workspace: workspaceGroup,
    items,
    activeItem,
  } = React.useMemo(
    () => workspaceTabs(navItems, pathname, activeSlug),
    [navItems, pathname, activeSlug],
  );

  // One page, or a page outside the menu: no tabs.
  if (!workspaceGroup || items.length <= 1) {
    return null;
  }

  const WorkspaceIcon = workspaceGroup?.icon;

  return (
    <div
      data-os-workspace-tabs="true"
      className={cn(
        "no-print shrink-0 w-full bg-card/85 backdrop-blur-md border-b border-border-subtle transition-colors select-none z-10",
        className,
      )}
    >
      <div className="max-w-full px-3 py-1.5 pointer-coarse:py-1 sm:px-4 flex items-center justify-start gap-3 overflow-hidden">
        {/* Workspace Title & Badge (Desktop) */}
        <div className="hidden lg:flex items-center gap-2 shrink-0 pe-2.5 border-e border-border-subtle">
          {WorkspaceIcon && (
            <div className="h-6 w-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <WorkspaceIcon className="h-3.5 w-3.5" />
            </div>
          )}
          <span className="text-xs font-bold text-foreground truncate">
            {isAr ? workspaceGroup?.labelAr : workspaceGroup?.labelEn}
          </span>
          <span className="text-xs font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {items.length}
          </span>
        </div>

        {/* Scrollable Tab Strip */}
        <div className={cn(SEGMENT_TRACK, "min-w-0 scroll-smooth overscroll-contain")}>
          {/* The current page's fill slides to the next one (transitions.dev's tabs sliding). */}
          <TabsPill />
          {items.map((tab) => {
            const isActive = tab.id === activeItem?.id;
            const TabIcon = tab.icon;
            const label = isAr ? tab.labelAr : tab.labelEn;

            return (
              <Link
                key={tab.id}
                to={tab.to as any}
                params={tab.params as any}
                preload="intent"
                data-active={isActive ? "true" : "false"}
                className={cn(segmentTab(isActive), "min-h-8")}
              >
                {TabIcon && <TabIcon className="h-3.5 w-3.5 shrink-0" />}
                <span>{label}</span>
                {tab.badge !== undefined && (
                  <span className={segmentCount(isActive)}>{tab.badge}</span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
