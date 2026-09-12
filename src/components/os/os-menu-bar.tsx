import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  Search,
  Languages,
  LogOut,
  User,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OsQuickActions } from "./os-quick-actions";
import { OsThemeToggle } from "./os-theme-toggle";
import { cn } from "@/lib/utils";
import { useCommandShortcutLabel } from "@/lib/platform-shortcut";

export interface OsMenuBarProps {
  brandLabel: string;
  breadcrumbs: Array<{ label: string; href?: string }>;
  lang: "en" | "ar";
  onSetLang: (lang: "en" | "ar") => void;
  onOpenSpotlight: () => void;
  onSignOut: () => void;
  activeSlug?: string | null;
  userEmail?: string;
  actions?: React.ReactNode;
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
  className?: string;
}

export function OsMenuBar({
  brandLabel,
  breadcrumbs,
  lang,
  onSetLang,
  onOpenSpotlight,
  onSignOut,
  activeSlug,
  userEmail,
  actions,
  isFocusMode = false,
  onToggleFocusMode,
  className,
}: OsMenuBarProps) {
  const shortcutLabel = useCommandShortcutLabel();

  return (
    <header
      className={cn(
        "no-print hidden md:flex h-11 border border-border bg-card/80 backdrop-blur-md shadow-xs shrink-0 items-center justify-between px-4 my-2 ms-3.5 me-4 rounded-xl transition-all select-none z-30",
        className,
      )}
    >
      {/* Useful route context instead of a static product label. */}
      <div className="flex min-w-0 items-center gap-2.5">
        <nav
          aria-label={lang === "ar" ? "مسار الصفحة" : "Breadcrumb"}
          className="flex min-w-0 items-center gap-1.5"
        >
          {breadcrumbs.map((item, index) => {
            const isLast = index === breadcrumbs.length - 1;
            const Separator = lang === "ar" ? ChevronLeft : ChevronRight;
            return (
              <React.Fragment key={`${item.label}-${index}`}>
                {index > 0 && <Separator className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                {item.href && !isLast ? (
                  <Link
                    to={item.href as any}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 text-xs transition-colors hover:text-primary",
                      index === 0
                        ? "font-semibold text-primary"
                        : "font-medium text-muted-foreground",
                    )}
                  >
                    {index === 0 && (
                      <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    )}
                    {item.label}
                  </Link>
                ) : (
                  <span
                    className={cn(
                      "truncate text-xs",
                      isLast
                        ? "font-semibold text-foreground"
                        : "font-medium text-muted-foreground",
                    )}
                  >
                    {index === 0 && breadcrumbs.length === 1 && (
                      <span className="me-1 inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
                    )}
                    {item.label}
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </nav>
        <span className="hidden shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary xl:inline-flex">
          {brandLabel}
        </span>
      </div>

      {/* Right: Consolidated Actions & Controls */}
      <div className="flex items-center gap-2">
        {/* Custom page-level or shell actions (e.g., View Storefront) */}
        {actions}

        {/* Global Quick Action Trigger (+ جديد) */}
        <OsQuickActions slug={activeSlug ?? null} lang={lang} />

        {/* Spotlight Command Center Trigger */}
        <button
          type="button"
          onClick={onOpenSpotlight}
          aria-label={`${lang === "ar" ? "البحث السريع" : "Quick Search"} (${shortcutLabel})`}
          className="h-8 px-2.5 gap-2 text-xs text-muted-foreground hover:text-foreground bg-background/60 hover:bg-background border border-border rounded-lg flex items-center transition-all shadow-2xs"
        >
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="hidden lg:inline text-xs font-medium">
            {lang === "ar" ? "البحث السريع..." : "Search OS..."}
          </span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted/80 px-1.5 font-mono text-xs font-semibold text-muted-foreground">
            {shortcutLabel}
          </kbd>
        </button>

        <span className="h-4 w-px bg-border" />

        {/* Appearance (light / dark / follow system) */}
        <OsThemeToggle lang={lang} className="h-8 w-8" />

        {/* Language Switcher */}
        <button
          type="button"
          onClick={() => onSetLang(lang === "en" ? "ar" : "en")}
          aria-label={lang === "en" ? "التحويل للعربية" : "Switch to English"}
          className="h-8 px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground bg-background/60 hover:bg-background border border-border rounded-lg flex items-center gap-1.5 transition-colors"
          title={lang === "en" ? "التحويل للعربية" : "Switch to English"}
        >
          <Languages className="h-3.5 w-3.5" />
          <span>{lang === "en" ? "AR" : "EN"}</span>
        </button>

        {/* Focus Mode Toggle */}
        {onToggleFocusMode && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleFocusMode}
            aria-label={
              isFocusMode
                ? lang === "ar"
                  ? "الخروج من وضع التركيز"
                  : "Exit Focus Mode"
                : lang === "ar"
                  ? "وضع التركيز"
                  : "Focus Mode"
            }
            title={
              isFocusMode
                ? lang === "ar"
                  ? "الخروج من وضع التركيز"
                  : "Exit Focus Mode"
                : lang === "ar"
                  ? "وضع التركيز"
                  : "Focus Mode"
            }
            className="h-8 w-8 rounded-lg p-0 text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border"
          >
            {isFocusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        )}

        {/* User Account Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label={lang === "ar" ? "حساب المستخدم" : "User Profile"}
              className="h-8 w-8 rounded-lg p-0 text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border"
            >
              <User className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 os-surface-elevated rounded-xl">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-xs font-semibold leading-none">{brandLabel}</p>
                {userEmail && (
                  <p className="text-xs leading-none text-muted-foreground truncate">{userEmail}</p>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onSignOut}
              className="text-destructive focus:text-destructive text-xs font-semibold cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5 me-2" />
              {lang === "ar" ? "تسجيل الخروج" : "Sign Out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
