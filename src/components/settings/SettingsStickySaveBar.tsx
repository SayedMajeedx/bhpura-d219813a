import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SettingsStickySaveBarProps {
  activeTab: string;
  isDirty?: boolean;
  dirtyCount?: number;
  isSaving: boolean;
  onSave: () => void | Promise<void>;
  onDiscard?: () => void;
  isAr?: boolean;
  className?: string;
}

export function SettingsStickySaveBar({
  activeTab,
  isDirty = true,
  dirtyCount,
  isSaving,
  onSave,
  onDiscard,
  isAr = true,
  className,
}: SettingsStickySaveBarProps) {
  // Global Ctrl+S / Cmd+S shortcut to save changes when dirty
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (isDirty && !isSaving) {
          void onSave();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDirty, isSaving, onSave]);

  const isVisible = isDirty || isSaving;

  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      aria-live="polite"
      className={cn(
        "fixed bottom-6 end-6 sm:bottom-6 sm:end-8 z-50 transition-all duration-300 ease-out",
        isVisible
          ? "translate-y-0 opacity-100 pointer-events-auto scale-100"
          : "translate-y-12 opacity-0 pointer-events-none scale-95",
        className,
      )}
    >
      <div className="flex items-center gap-2.5 sm:gap-3.5 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-full bg-card/95 dark:bg-card/90 backdrop-blur-xl border border-border shadow-2xl ring-1 ring-border/50 max-w-[94vw] sm:max-w-md">
        {/* Unsaved indicator with pulsing status dot */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
          </span>
          <span className="text-xs font-medium text-foreground tracking-tight select-none">
            {isAr
              ? dirtyCount && dirtyCount > 0
                ? `${dirtyCount} تغييرات غير محفوظة`
                : "تغييرات غير محفوظة"
              : dirtyCount && dirtyCount > 0
                ? `${dirtyCount} unsaved change${dirtyCount > 1 ? "s" : ""}`
                : "Unsaved changes"}
          </span>
        </div>

        <div className="h-4 w-px bg-border/80 shrink-0" />

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onDiscard && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDiscard}
              disabled={isSaving}
              className="h-8 px-2.5 sm:px-3 text-xs font-normal text-muted-foreground hover:text-foreground rounded-full transition-colors"
            >
              <Undo2 className="h-3.5 w-3.5 me-1 text-muted-foreground" />
              <span>{isAr ? "تراجع" : "Discard"}</span>
            </Button>
          )}

          <Button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            size="sm"
            className="h-8 sm:h-8.5 px-3.5 sm:px-4 text-xs font-medium rounded-full shadow-sm gap-1.5 transition-transform active:scale-95"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                <span>{isAr ? "جارٍ الحفظ..." : "Saving..."}</span>
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5 shrink-0" />
                <span>{isAr ? "حفظ" : "Save"}</span>
                <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono opacity-60 bg-primary-foreground/20 rounded px-1 ms-1">
                  ⌘S
                </kbd>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
