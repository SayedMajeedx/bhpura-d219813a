# Bug Backlog

Real bugs found during the maintainability refactors (Phases 4–5). Refactors must preserve behaviour, so these were **recorded, not fixed**. Fix each in its own small PR with a test that fails before the fix.

When you fix one, delete its entry (the PR is the record). When a refactor finds a new one, add it here instead of fixing it in the refactor PR.

Line numbers are as of 2026-09-24 and may drift; search for the quoted code.

---

Every bug found up to #51 is fixed.

## #52. The storefront's language cookie is not read on the server

Found 2026-11-14 while building the store-page edge cache (`src/lib/storefront-page-cache.ts`). A shopper who chose English (`boutq_lang_<slug>=en` or `boutq_lang=en`) is sent the Arabic page by the server (`<html lang="ar">`, the Arabic title), and the browser switches it to English after it starts: the live site does it (`curl -H "Cookie: boutq_lang_pura=en" https://pura.boutq.store/pura`). `readStorefrontLangCookie` (`src/lib/storefront-cookies.server.ts`) reads the cookie through `import("vinxi/http")`; `vinxi` is not installed (no `node_modules/vinxi`, not in `package.json`), so the import throws, its `catch` returns nothing, and `resolveInitialLang` falls back to Arabic. **The same import is in four other places, each likely failing quietly the same way**: `src/integrations/supabase/auth-middleware.ts` (twice), `src/integrations/supabase/client.server.ts`, `src/lib/impersonation-cookies.server.ts` and `src/lib/onboarding.functions.ts`. Check what each falls back to before fixing. Fix: read requests with Start's own helpers (`getCookie`, `getRequestHeader`, `getRequest` from `@tanstack/react-start/server`, which re-exports `@tanstack/start-server-core`), test them through `tests/helpers/server-fn.ts`, and add a guard that fails on `vinxi/http` in `src/`. The edge cache already keys a page by the language cookie, so nothing there changes.
