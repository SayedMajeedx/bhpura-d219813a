import { useState, useEffect } from "react";

export type RecentModule = {
  path: string;
  titleEn: string;
  titleAr: string;
  timestamp: number;
};

export type PinnedAction = {
  id: string;
  titleEn: string;
  titleAr: string;
  route: string;
  iconName?: string;
};

const RECENT_MODULES_KEY = "boutq_os_recent_modules";
const PINNED_ACTIONS_KEY = "boutq_os_pinned_actions";
const PANEL_WIDTHS_KEY = "boutq_os_panel_widths";
const NAV_FILTERS_KEY = "boutq_os_nav_filters";

// 1. Recently Visited Modules Tracker
export function getRecentModules(): RecentModule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_MODULES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function recordVisitedModule(module: Omit<RecentModule, "timestamp">) {
  if (typeof window === "undefined") return;
  try {
    const recents = getRecentModules().filter((m) => m.path !== module.path);
    const updated = [{ ...module, timestamp: Date.now() }, ...recents].slice(0, 5);
    localStorage.setItem(RECENT_MODULES_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

// 2. Pinned Quick Actions
export function getPinnedActions(): PinnedAction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PINNED_ACTIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function togglePinnedAction(action: PinnedAction): boolean {
  if (typeof window === "undefined") return false;
  try {
    const current = getPinnedActions();
    const exists = current.some((a) => a.id === action.id);
    const updated = exists ? current.filter((a) => a.id !== action.id) : [...current, action];
    localStorage.setItem(PINNED_ACTIONS_KEY, JSON.stringify(updated));
    return !exists;
  } catch {
    return false;
  }
}

// 3. Persistent Panel Width Preferences
export function getPanelWidth(panelId: string, defaultWidth: number = 30): number {
  if (typeof window === "undefined") return defaultWidth;
  try {
    const raw = localStorage.getItem(PANEL_WIDTHS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    return typeof map[panelId] === "number" ? map[panelId] : defaultWidth;
  } catch {
    return defaultWidth;
  }
}

export function setPanelWidth(panelId: string, width: number) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(PANEL_WIDTHS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[panelId] = width;
    localStorage.setItem(PANEL_WIDTHS_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

// 4. Context-Preserving Return Navigation
export function saveNavFilterContext(routeKey: string, searchParams: Record<string, any>) {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(NAV_FILTERS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[routeKey] = searchParams;
    sessionStorage.setItem(NAV_FILTERS_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

export function getNavFilterContext(routeKey: string): Record<string, any> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(NAV_FILTERS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    return map[routeKey] ?? null;
  } catch {
    return null;
  }
}

// React Hook for Recent Modules
export function useRecentModules() {
  const [recents, setRecents] = useState<RecentModule[]>([]);

  useEffect(() => {
    setRecents(getRecentModules());
  }, []);

  return recents;
}
