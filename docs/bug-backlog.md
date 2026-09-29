# Bug Backlog

Real bugs found during the maintainability refactors (Phases 4–5). Refactors must preserve behaviour, so these were **recorded, not fixed**. Fix each in its own small PR with a test that fails before the fix.

When you fix one, delete its entry (the PR is the record). When a refactor finds a new one, add it here instead of fixing it in the refactor PR.

Line numbers are as of 2026-09-24 and may drift; search for the quoted code.

---

Every bug found up to #34 is fixed.

## #35 WhatsApp button breaks hydration in the embedded storefront preview

`src/features/storefront-shell/components/WhatsAppFab.tsx` decides during render whether the storefront is embedded (`typeof window !== "undefined" && (window.self !== window.top || …preview=1)`). The server renders the button; the client inside an iframe (the onboarding page's live preview of Pura) renders nothing, so React throws "Hydration failed … didn't match" and regenerates the tree. Seen on `/onboard` on 2026-09-29. Fix: read "embedded" with `useSyncExternalStore` (server snapshot `false`) or after mount, so the first client render matches the server; test by rendering it with `hydrateRoot` inside a fake frame.
