/**
 * Finding a setting by what it is called: one rule for the Settings page's search and the
 * command palette (the ease-of-use review of 2026-11-28: 199 settings in 5 tabs and 22 groups,
 * and the palette, the search every page has, found none of them).
 *
 * Every word typed must be found, in any order, in a setting's name, its keywords or its column,
 * in either language. Arabic is read as people type it: diacritics and the tatweel dropped, an
 * alef in any form, and a word's closing ة / ه and ى / ي alike, so "شعار المتجر" and "الشعار"
 * both find the store's logo. A setting the store's footer does not read, or one only the system
 * writes, is never offered: it would open a group where its control is not drawn.
 */
import {
  SETTINGS_GROUPS,
  SETTINGS_REGISTRY,
  SETTINGS_TABS,
  type SettingsFieldDef,
  type SettingsTabId,
} from "@/features/settings/registry";
import { isSettingApplicable } from "@/lib/storefront-engine";
import { foldWord } from "@/lib/fold-text";

export { foldWord };

type Lang = "ar" | "en";

/** The words of a search, each folded, each once. */
function queryWords(query: string): string[] {
  return [
    ...new Set(
      foldWord(query)
        .split(/[\s,،]+/)
        .map((word) => word.trim())
        // "الشعار" finds "شعار المتجر": the article is looked past, never the word itself.
        .map((word) => (word.length > 3 && word.startsWith("ال") ? word.slice(2) : word))
        .filter(Boolean),
    ),
  ];
}

function haystack(entry: SettingsFieldDef): string {
  return foldWord(
    [
      entry.label.ar,
      entry.label.en,
      entry.key.replace(/_/g, " "),
      ...(entry.keywords?.ar ?? []),
      ...(entry.keywords?.en ?? []),
    ].join(" "),
  );
}

/** What the store's settings say that changes which settings it has (its footer's layout). */
export type SearchStore = { footer_layout?: string | null } | null | undefined;

/** The settings a search finds, best first: a name that starts with it before one that has it. */
export function searchSettings(query: string, store: SearchStore, limit = 8): SettingsFieldDef[] {
  const words = queryWords(query);
  if (!words.length || words.join("").length < 2) return [];
  const found: { entry: SettingsFieldDef; rank: number }[] = [];
  for (const entry of SETTINGS_REGISTRY) {
    if (!entry.tab || entry.owner === "system") continue;
    if (!isSettingApplicable(entry.scope, store ?? null)) continue;
    const text = haystack(entry);
    if (!words.every((word) => text.includes(word))) continue;
    const names = [foldWord(entry.label.ar), foldWord(entry.label.en)];
    const first = words[0];
    const rank = names.some((name) => name.startsWith(first))
      ? 0
      : names.some((name) => name.includes(first))
        ? 1
        : 2;
    found.push({ entry, rank });
  }
  return found
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ entry }) => entry);
}

/** Where a setting lives, as the Settings page names it: "Storefront › Homepage Hero". */
export function settingPlace(entry: SettingsFieldDef, lang: Lang): string {
  const tab = SETTINGS_TABS.find((t) => t.id === entry.tab);
  const group = entry.tab
    ? SETTINGS_GROUPS[entry.tab as SettingsTabId]?.find((g) => g.id === entry.group)
    : undefined;
  return [tab?.label[lang], group?.[lang]].filter(Boolean).join(" › ");
}

/** The Settings page opened at a setting's tab and group. */
export function settingHref(entry: SettingsFieldDef, slug: string): string {
  const params = new URLSearchParams();
  if (entry.tab) params.set("tab", entry.tab);
  if (entry.group) params.set("group", entry.group);
  return `/admin/b/${encodeURIComponent(slug)}/settings?${params.toString()}`;
}
