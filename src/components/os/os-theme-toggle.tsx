import { Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme, type ThemePreference } from "@/lib/theme-context";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{
  value: ThemePreference;
  icon: typeof Sun;
  labelEn: string;
  labelAr: string;
}> = [
  { value: "light", icon: Sun, labelEn: "Light", labelAr: "فاتح" },
  { value: "dark", icon: Moon, labelEn: "Dark", labelAr: "داكن" },
  { value: "system", icon: Monitor, labelEn: "Match system", labelAr: "حسب النظام" },
];

export function OsThemeToggle({ lang, className }: { lang: "en" | "ar"; className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const TriggerIcon = resolvedTheme === "dark" ? Moon : Sun;
  const triggerLabel = lang === "ar" ? "مظهر الواجهة" : "Appearance";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={triggerLabel}
          title={triggerLabel}
          className={cn(
            "h-8 w-8 flex items-center justify-center rounded-control text-muted-foreground hover:text-foreground bg-background/40 hover:bg-background/80 border border-[var(--os-border)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            className,
          )}
        >
          <TriggerIcon className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 os-surface-elevated rounded-card">
        {OPTIONS.map(({ value, icon: Icon, labelEn, labelAr }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className={cn(
              "cursor-pointer gap-2 text-sm",
              theme === value && "font-semibold text-primary",
            )}
          >
            <Icon className="h-4 w-4" />
            {lang === "ar" ? labelAr : labelEn}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
