import * as React from "react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SETTINGS_GROUPS, type SettingsTabId } from "./registry";

/**
 * One group per screen.
 *
 * Instead of stacking every group of a tab into one long page, each tab shows a
 * group navigator (chips on phones, a sticky list on desktop) and renders only
 * the active group. Deep links (`?group=`), settings search and the readiness
 * checklist select a group through {@link SettingsNavContext}.
 */

export interface GroupDef {
  id: string;
  /** Overrides the registry label (for tab-only sections such as the design upgrade card). */
  label?: { ar: string; en: string };
  icon?: React.ElementType;
  render: () => React.ReactNode;
}

interface SettingsNavValue {
  activeGroup: string | null;
  setActiveGroup: (group: string | null) => void;
}

export const SettingsNavContext = React.createContext<SettingsNavValue>({
  activeGroup: null,
  setActiveGroup: () => {},
});

const STORAGE_KEY = "boutq_settings_active_group";

function readStored(tab: SettingsTabId): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    return map[tab] ?? null;
  } catch {
    return null;
  }
}

function writeStored(tab: SettingsTabId, group: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[tab] = group;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // per-viewer convenience only
  }
}

export function GroupNavigator({
  tab,
  groups,
  before,
}: {
  tab: SettingsTabId;
  groups: GroupDef[];
  /** Rendered above the navigator on every group (e.g. the first-visit banner). */
  before?: React.ReactNode;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { activeGroup, setActiveGroup } = React.useContext(SettingsNavContext);
  const registryLabels = React.useMemo(
    () => new Map(SETTINGS_GROUPS[tab].map((g) => [g.id, g])),
    [tab],
  );

  const ids = groups.map((g) => g.id);
  const resolved =
    activeGroup && ids.includes(activeGroup)
      ? activeGroup
      : (() => {
          const stored = typeof window !== "undefined" ? readStored(tab) : null;
          return stored && ids.includes(stored) ? stored : ids[0];
        })();

  // Keep context + storage in sync with what is actually shown.
  React.useEffect(() => {
    if (resolved !== activeGroup) setActiveGroup(resolved);
    writeStored(tab, resolved);
  }, [resolved, activeGroup, setActiveGroup, tab]);

  const active = groups.find((g) => g.id === resolved) ?? groups[0];

  const labelOf = (g: GroupDef) => {
    const l = g.label ?? registryLabels.get(g.id);
    return l ? (isAr ? l.ar : l.en) : g.id;
  };

  const select = (id: string) => {
    setActiveGroup(id);
    writeStored(tab, id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("group", id);
      window.history.replaceState({}, "", url.toString());
      // Bring the group header into view without scrolling the whole page back to the top.
      document
        .getElementById("settings-group-top")
        ?.scrollIntoView({ block: "start", behavior: "auto" });
    }
  };

  return (
    <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6 lg:items-start">
      {/* Navigator: wrapping chips on phones/tablets, sticky list on desktop */}
      <nav
        aria-label={isAr ? "أقسام التبويب" : "Tab sections"}
        className="mb-4 lg:mb-0 lg:sticky lg:top-4"
      >
        <ul role="tablist" className="flex flex-wrap gap-1.5 lg:flex-col lg:gap-1">
          {groups.map((g) => {
            const isActive = g.id === active.id;
            const Icon = g.icon;
            return (
              <li key={g.id} className="lg:w-full">
                <Button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  onClick={() => select(g.id)}
                  className={cn(
                    "h-auto min-h-9 w-full justify-start gap-2 rounded-lg px-3 py-1.5 text-xs font-medium lg:min-h-10 lg:text-sm",
                    !isActive && "bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {Icon && <Icon className="size-3.5 shrink-0 lg:size-4" />}
                  <span className="truncate">{labelOf(g)}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0 space-y-6">
        {before}
        <div id="settings-group-top" className="scroll-mt-24" />
        <section id={`group-${active.id}`} aria-label={labelOf(active)} className="space-y-6">
          {active.render()}
        </section>
      </div>
    </div>
  );
}
