import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Search, Languages, LogOut, User, ChevronLeft, ChevronRight } from "lucide-react";
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
  className,
}: OsMenuBarProps) {
  const shortcutLabel = useCommandShortcutLabel();

  return (
    <header
      className={cn(
        "no-print hidden md:flex h-10 border border-[var(--os-border)] os-glass shadow-2xs shrink-0 items-center justify-between px-4 my-2.5 ms-3.5 me-4 rounded-xl transition-all select-none z-30",
        className,
      )}
    >
      {/* Useful route context instead of a static product label. */}
      <div className="flex min-w-0 items-center gap-2">
        <nav
          aria-label={lang === "ar" ? "مسار الصفحة" : "Breadcrumb"}
          className="flex min-w-0 items-center gap-1.5"
        >
          {breadcrumbs.map((item, index) => {
            const isLast = index === breadcrumbs.length - 1;
            const Separator = lang === "ar" ? ChevronLeft : ChevronRight;
            return (
              <React.Fragment key={`${item.label}-${index}`}>
                {index > 0 && <Separator className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
                {item.href && !isLast ? (
                  <Link
                    to={item.href as any}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 text-xs transition-colors hover:text-primary",
                      index === 0
                        ? "font-bold tracking-wider text-primary"
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
                      isLast ? "font-bold text-foreground" : "font-medium text-muted-foreground",
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
        <span className="hidden shrink-0 rounded-full border border-primary/15 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary xl:inline-flex">
          {brandLabel}
        </span>
      </div>

      {/* Right: Global Quick Actions, Search, Language, & Account Menu */}
      <div className="flex items-center gap-2">
        {/* Global Quick Action Trigger (+ جديد) */}
        <OsQuickActions slug={activeSlug ?? null} lang={lang} />

        {/* Spotlight Command Center Trigger */}
        <button
          type="button"
          onClick={onOpenSpotlight}
          aria-label={`${lang === "ar" ? "البحث السريع" : "Quick Search"} (${shortcutLabel})`}
          className="h-6.5 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground bg-background/50 hover:bg-background/90 border border-[var(--os-border)] rounded-md flex items-center transition-all shadow-2xs"
        >
          <Search className="h-3 w-3 text-muted-foreground" />
          <span className="hidden lg:inline text-[11px] font-medium">
            {lang === "ar" ? "البحث السريع..." : "Search OS..."}
          </span>
          <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-0.5 rounded border bg-muted/80 px-1 font-mono text-[9px] font-semibold text-muted-foreground">
            {shortcutLabel}
          </kbd>
        </button>

        <span className="h-3 w-px bg-[var(--os-border)]" />

        {/* Language Switcher */}
        <button
          type="button"
          onClick={() => onSetLang(lang === "en" ? "ar" : "en")}
          aria-label={lang === "en" ? "التحويل للعربية" : "Switch to English"}
          className="h-6.5 px-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground bg-background/40 hover:bg-background/80 border border-[var(--os-border)] rounded-md flex items-center gap-1 transition-colors"
          title={lang === "en" ? "التحويل للعربية" : "Switch to English"}
        >
          <Languages className="h-3 w-3" />
          <span>{lang === "en" ? "AR" : "EN"}</span>
        </button>

        {/* User Account Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label={lang === "ar" ? "حساب المستخدم" : "User Profile"}
              className="h-6.5 w-6.5 rounded-md p-0 text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-transparent hover:border-border/60"
            >
              <User className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 os-surface-elevated rounded-xl">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-xs font-semibold leading-none">{brandLabel}</p>
                {userEmail && (
                  <p className="text-[11px] leading-none text-muted-foreground truncate">
                    {userEmail}
                  </p>
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
