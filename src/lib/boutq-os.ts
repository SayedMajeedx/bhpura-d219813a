import { cn } from "@/lib/utils";
import { DESIGN_TOKENS } from "@/lib/design-tokens";

export { DESIGN_TOKENS };

/**
 * Boutq OS Surface & Token Variants
 */
export type OsSurfaceVariant = "glass" | "glassStrong" | "solid" | "elevated" | "canvas";

export type OsRadius = keyof typeof DESIGN_TOKENS.radii;

export interface OsSurfaceOptions {
  variant?: OsSurfaceVariant;
  radius?: OsRadius;
  border?: boolean;
  interactive?: boolean;
  className?: string;
}

/**
 * Helper to generate standardized Boutq OS class names from central tokens
 */
export function osSurface({
  variant = "glass",
  radius = "lg",
  border = true,
  interactive = false,
  className,
}: OsSurfaceOptions = {}): string {
  const variantClasses: Record<OsSurfaceVariant, string> = {
    canvas: "os-canvas",
    glass: "os-glass",
    glassStrong: "os-glass-strong",
    solid: "os-surface",
    elevated: "os-surface-elevated",
  };

  const radiusClasses: Record<OsRadius, string> = {
    sm: "rounded-lg",
    md: "rounded-xl",
    lg: "rounded-2xl",
    xl: "rounded-3xl",
    control: "rounded-[var(--os-radius-control)]",
    card: "rounded-[var(--os-radius-card)]",
    panel: "rounded-[var(--os-radius-panel)]",
    window: "rounded-[var(--os-radius-window)]",
    dock: "rounded-[var(--os-radius-dock)]",
    full: "rounded-full",
  };

  return cn(
    variantClasses[variant],
    radiusClasses[radius],
    border && "os-hairline",
    interactive && "os-interactive",
    className,
  );
}
