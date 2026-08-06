# AGENTS.md — Design System & UX Rules

This file is the shared contract for any agent or subagent editing the
storefront or admin surfaces. It is derived from the Visual & UX Design
Audit. Read this in full before editing any component, style, or layout
file. Applies to both `src/components/storefront/**` and
`src/components/admin/**` unless a rule says otherwise.

## 1. Tokens — never hardcode

- Never introduce a raw hex value (`#8C6D58`, `#2563eb`, etc.) in JSX,
  CSS, or Tailwind arbitrary-value classes (`bg-[#...]`, `border-[#...]`).
- Always use semantic tokens: `bg-primary`, `text-primary`,
  `border-primary`, `bg-destructive`, `bg-muted`, `border-border`.
- If a needed semantic token doesn't exist yet, add it to the shared
  token file rather than hardcoding — flag this in your summary, don't
  silently invent a one-off value.
- Sale/destructive badges use `--color-destructive` (or the closest
  existing destructive/success OKLCH token), not custom maroon/slate hex.

## 2. Buttons & interactive elements

- Never use a raw `<button>` with hand-rolled Tailwind for anything that
  behaves like a button. Use the shared `<Button>` component
  (shadcn/ui) with the appropriate `variant` and `size` prop.
- All storefront fill buttons: `--color-primary` background, `8px`
  border radius, unless the component already defines a documented
  exception.
- Minimum touch target: `44px` height on any interactive mobile
  storefront control (buttons, icon toggles, wishlist hearts, etc.).
  Use `size="icon"` variants sized accordingly, not ad hoc `h-11 w-11`.

## 3. Focus states

- Never define a component- or page-scoped focus outline override
  (no hardcoded `outline: 3px solid #...`, no `!important`).
- All focus-visible states go through
  `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
  uniformly, storefront and admin alike.
- If you find an existing hardcoded override, remove it as part of your
  task rather than adding a second competing rule on top.

## 4. Spacing

- Base unit is 4px. Prefer the 8-point scale for section-level spacing:
  `spacing-2` (8px), `spacing-4` (16px), `spacing-8` (32px).
- Admin forms/modals: standardize vertical rhythm to `16px`/`20px`
  between fields and groups — don't introduce new arbitrary values
  (`pt-6`, `pt-8`, etc.) without checking if an existing scale value
  already fits.
- Border/divider colors: use `border-border`, never
  `border-neutral-100/50` or similar opacity-hacked neutrals.

## 5. Images

- Product grid images: apply a strict `aspect-ratio` with
  `object-fit: cover`. Don't let card heights vary based on natural
  image dimensions.

## 6. Surfaces & glass effects

- Reserve glassmorphic tokens (`--os-glass`, `backdrop-blur-*`,
  `bg-card/60`, gradient overlays) for floating elements only: nav
  bars, modals, tooltips, popovers.
- Data-heavy panels (dashboard metric cards, tables) use solid
  `--os-surface` or `--card` backgrounds — no blur, no transparency.
  This is a contrast/scannability requirement, not just a style
  preference — don't relitigate it per-component.

## 7. Radius

- Admin: `radius-md`.
- Storefront: `radius-xl` (intentionally more expressive — this is not
  an inconsistency to "fix", it's a documented surface distinction).
- Both derive from the shared `--radius` base; don't hardcode pixel
  radii.

## 8. Scope discipline (for subagents specifically)

- Touch only the files relevant to your assigned roadmap item. If a fix
  requires editing a file another subagent is likely also touching
  (e.g. `styles.css`, `product-card.tsx`), note the conflict in your
  summary instead of guessing at a merge.
- Do not "improve while you're in there" — no drive-by refactors
  outside your assigned scope. Flag adjacent issues instead of fixing
  them.
- Every change must be a diff you can explain in one sentence tied back
  to a specific roadmap item.

## 9. Safety / guardrails

- Do not run destructive git operations (force-push, hard reset,
  branch deletion) without explicit user confirmation.
- Do not modify `package.json` dependencies as a side effect of a
  styling task.
- Do not delete or rewrite tests to make a task "pass."
- If a fix is ambiguous (e.g. no clear existing token fits), stop and
  ask rather than inventing a new pattern unilaterally.
