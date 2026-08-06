/**
 * Central Boutq OS & Storefront Design Tokens
 *
 * Direct shared source of truth for semantic colors, radii, spacing,
 * focus ring utilities, surface glass tokens, and touch target invariants.
 *
 * Rules (from AGENTS.md):
 * 1. Tokens - never hardcode raw hex in JSX/CSS. Always use semantic tokens.
 * 2. Minimum touch target: 44px on mobile interactive storefront controls.
 * 3. Focus states: focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2.
 * 4. Spacing: 4px base, 8-point scale (2=8px, 4=16px, 8=32px). Admin rhythm 16px/20px.
 * 5. Surfaces: Glassmorphism for floating only; solid --os-surface for data-heavy panels.
 * 6. Radius: Admin radius-md, Storefront radius-xl, Boutq OS custom control/card/panel/window/dock.
 */

export const DESIGN_TOKENS = {
  /** Semantic Colors mapped to CSS variable tokens */
  colors: {
    primary: "var(--primary)",
    primaryForeground: "var(--primary-foreground)",
    secondary: "var(--secondary)",
    secondaryForeground: "var(--secondary-foreground)",
    muted: "var(--muted)",
    mutedForeground: "var(--muted-foreground)",
    accent: "var(--accent)",
    accentForeground: "var(--accent-foreground)",
    destructive: "var(--destructive)",
    destructiveForeground: "var(--destructive-foreground)",
    background: "var(--background)",
    foreground: "var(--foreground)",
    card: "var(--card)",
    cardForeground: "var(--card-foreground)",
    popover: "var(--popover)",
    popoverForeground: "var(--popover-foreground)",
    border: "var(--border)",
    input: "var(--input)",
    ring: "var(--ring)",
    sidebar: "var(--sidebar)",
    sidebarForeground: "var(--sidebar-foreground)",
  },

  /** Boutq OS Glass & Canvas Surface Tokens */
  osColors: {
    canvas: "var(--os-canvas)",
    canvasSecondary: "var(--os-canvas-secondary)",
    glass: "var(--os-glass)",
    glassStrong: "var(--os-glass-strong)",
    surface: "var(--os-surface)",
    surfaceElevated: "var(--os-surface-elevated)",
    border: "var(--os-border)",
    highlight: "var(--os-highlight)",
    accentGlow: "var(--os-accent-glow)",
    textPrimary: "var(--os-text-primary)",
    textSecondary: "var(--os-text-secondary)",
  },

  /** Standardized Radii across Admin, Storefront, and Boutq OS */
  radii: {
    sm: "calc(var(--radius) - 4px)", // 4px / 0.25rem
    md: "calc(var(--radius) - 2px)", // 6px / 0.375rem (Admin Default)
    lg: "var(--radius)", // 8px / 0.5rem
    xl: "calc(var(--radius) + 4px)", // 12px / 0.75rem (Storefront Default)
    control: "var(--os-radius-control)", // 10px / 0.625rem
    card: "var(--os-radius-card)", // 18px / 1.125rem
    panel: "var(--os-radius-panel)", // 22px / 1.375rem
    window: "var(--os-radius-window)", // 24px / 1.5rem
    dock: "var(--os-radius-dock)", // 28px / 1.75rem
    full: "9999px",
  },

  /**
   * Spacing tokens (4px base / 8-point section scale)
   */
  spacing: {
    1: "0.25rem", // 4px
    2: "0.5rem", // 8px
    3: "0.75rem", // 12px
    4: "1rem", // 16px (Standard admin field spacing)
    5: "1.25rem", // 20px (Standard admin group rhythm)
    6: "1.5rem", // 24px
    8: "2rem", // 32px
    10: "2.5rem", // 40px
    12: "3rem", // 48px
    16: "4rem", // 64px
  },

  /** Standard Touch Target constraint (44px min for mobile controls) */
  touchTarget: {
    minHeight: "44px",
    minWidth: "44px",
    className: "min-h-[44px] min-w-[44px]",
  },

  /** Standard Focus-Visible Ring (AGENTS.md Rule 3) */
  focusRing: {
    universal: "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    primary: "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    os: "os-focus-ring",
  },

  /** Storefront & OS Typography font families */
  typography: {
    hero: "var(--font-hero)",
    heading: "var(--font-heading)",
    product: "var(--font-product)",
    ui: "var(--font-ui)",
    display: "var(--font-display)",
    sans: "var(--font-sans)",
  },

  /** OS Drop Shadows */
  shadows: {
    os: "var(--os-shadow)",
    window: "var(--os-window-shadow)",
    dock: "var(--os-dock-shadow)",
  },
} as const;

/** Re-usable Focus Visible Class Constant */
export const FOCUS_RING_CLASS = DESIGN_TOKENS.focusRing.universal;

/** Re-usable Mobile Touch Target Class Constant */
export const MOBILE_TOUCH_TARGET_CLASS = DESIGN_TOKENS.touchTarget.className;

/** Standard Admin Form Vertical Rhythm Utility */
export const ADMIN_FORM_RHYTHM = {
  fieldGap: "space-y-4", // 16px
  groupGap: "space-y-5", // 20px
  modalPadding: "p-5 sm:p-6",
} as const;

export type DesignTokens = typeof DESIGN_TOKENS;
