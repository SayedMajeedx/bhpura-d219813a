import * as React from "react";
import { useState, useEffect } from "react";

export type SettingsLevel = "basic" | "advanced";

const STORAGE_KEY = "boutq_settings_level";

export function getStoredSettingsLevel(): SettingsLevel {
  if (typeof window === "undefined") return "basic";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "advanced" ? "advanced" : "basic";
  } catch {
    return "basic";
  }
}

export function setStoredSettingsLevel(level: SettingsLevel): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, level);
    window.dispatchEvent(new CustomEvent("boutq:settings-level-change", { detail: level }));
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

export type SettingsLevelResult = [SettingsLevel, (level: SettingsLevel) => void] & {
  level: SettingsLevel;
  setLevel: (level: SettingsLevel) => void;
  toggleLevel: () => void;
  isAdvanced: boolean;
};

export function useSettingsLevel(): SettingsLevelResult {
  const [level, setLevelState] = useState<SettingsLevel>(getStoredSettingsLevel);

  useEffect(() => {
    const handleLevelChange = (e: Event) => {
      const customEvent = e as CustomEvent<SettingsLevel>;
      if (customEvent.detail) {
        setLevelState(customEvent.detail);
      }
    };

    window.addEventListener("boutq:settings-level-change", handleLevelChange);
    return () => {
      window.removeEventListener("boutq:settings-level-change", handleLevelChange);
    };
  }, []);

  const setLevel = (newLevel: SettingsLevel) => {
    setLevelState(newLevel);
    setStoredSettingsLevel(newLevel);
  };

  const toggleLevel = () => {
    setLevel(level === "basic" ? "advanced" : "basic");
  };

  const result = [level, setLevel] as any;
  result.level = level;
  result.setLevel = setLevel;
  result.toggleLevel = toggleLevel;
  result.isAdvanced = level === "advanced";

  return result as SettingsLevelResult;
}

export function SettingsLevelProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
