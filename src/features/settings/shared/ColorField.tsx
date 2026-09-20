import * as React from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export interface ColorFieldProps {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  description?: string;
}

export function ColorField({ label, value, onChange, description }: ColorFieldProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background p-1.5">
        <label
          className="relative h-8 w-12 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border shadow-sm"
          style={{ backgroundColor: value ?? "#ffffff" }}
        >
          <input
            type="color"
            value={value ?? "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={label}
          />
        </label>
        <span className="min-w-0 flex-1 truncate px-1 font-mono text-xs text-muted-foreground">
          {value?.toUpperCase() ?? (isAr ? "اللون الافتراضي" : "Default color")}
        </span>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => onChange(null)}
          >
            {isAr ? "افتراضي" : "Reset"}
          </Button>
        )}
      </div>
    </div>
  );
}
