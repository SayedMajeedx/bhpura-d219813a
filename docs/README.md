# Boutq OS Documentation Index

Welcome to the Boutq OS engineering documentation. This directory contains architectural specifications, operational runbooks, maintainability roadmaps, and historical records.

---

## 1. Active Architecture & Operational Guides

| Document                                                                                   | Scope & Purpose                                                                                                                                  |
| :----------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| **[`maintainability-roadmap.md`](./maintainability-roadmap.md)**                           | The master 8-phase maintainability and technical debt remediation plan (Phases 0–7). _Stays in `docs/` until all phases are complete._           |
| **[`maintainability.md`](./maintainability.md)**                                           | Baseline metrics recorded in Phase 0 (2026-09-24), ratchet ceilings, and instructions for running `scripts/maintainability-metrics.mjs`.         |
| **[`storefront-architecture.md`](./storefront-architecture.md)**                           | Storefront 2.0 engine architecture, version dispatch (`storefront_design_version: 1 \| 2`), and V1 vs V2 component matrix.                       |
| **[`settings-architecture.md`](./settings-architecture.md)**                               | Single source of truth settings architecture (`SETTINGS_REGISTRY`), ownership model, and the 5-tab merchant settings layout.                     |
| **[`media-video-pipeline.md`](./media-video-pipeline.md)**                                 | In-browser WebCodecs + `mediabunny` video transcoding, fast-start MP4 packaging, and byte-range delivery without recurring infrastructure costs. |
| **[`ci-cd.md`](./ci-cd.md)**                                                               | Continuous integration pipeline jobs, branch protection rules, local validation commands, and production deployment/rollback protocols.          |
| **[`observability-and-reliability.md`](./observability-and-reliability.md)**               | Machine-readable health probes (`/api/health/live`, `/api/health/ready`), background job failure boundaries, and alerting guidelines.            |
| **[`database-recovery.md`](./database-recovery.md)**                                       | Production database migration safety, additive schema rules, restore drills, and drift avoidance.                                                |
| **[`security/credential-rotation-runbook.md`](./security/credential-rotation-runbook.md)** | Operational checklist for rotating production API keys, Supabase credentials, and payment gateway secrets.                                       |
| **[`release/`](./release/)**                                                               | Post-launch QA audits, audit screenshots, and chunk exception documentation.                                                                     |

---

## 2. Archive Directory (`docs/archive/`)

Historical implementation plans, milestone audits, and previous AI handoff notes are preserved in [`docs/archive/`](./archive/):

| Archived File                                                                                                          |   Classification   | Summary & Context                                                                           |
| :--------------------------------------------------------------------------------------------------------------------- | :----------------: | :------------------------------------------------------------------------------------------ |
| **[`archive/addons-platform-audit-2026-09-14.md`](./archive/addons-platform-audit-2026-09-14.md)**                     |  Historical Audit  | Comprehensive architectural audit of the modular addon system conducted on 2026-09-14.      |
| **[`archive/addons-platform-implementation-plan.md`](./archive/addons-platform-implementation-plan.md)**               |   Completed Plan   | Phased implementation plan for the vertical addon platform and runtime slots.               |
| **[`archive/ai-handoff-addons-platform.md`](./archive/ai-handoff-addons-platform.md)**                                 | Historical Handoff | AI session handoff context for core addon engine development.                               |
| **[`archive/ai-handoff-addons-platform-fixes.md`](./archive/ai-handoff-addons-platform-fixes.md)**                     | Historical Handoff | AI session handoff context for addon isolation and slot styling bugfixes.                   |
| **[`archive/ai-handoff-inventory-ledger.md`](./archive/ai-handoff-inventory-ledger.md)**                               | Historical Handoff | AI session handoff context for the immutable stock movement ledger migration.               |
| **[`archive/ai-handoff-prompt.md`](./archive/ai-handoff-prompt.md)**                                                   | Historical Handoff | Standardized AI session prompt template previously used for context transfers.              |
| **[`archive/ai-handoff-store-vertical-modules.md`](./archive/ai-handoff-store-vertical-modules.md)**                   | Historical Handoff | AI session handoff context for store vertical presets (Abayas, Coffee, Perfumes).           |
| **[`archive/ai-handoff-storefront-v2-verification.md`](./archive/ai-handoff-storefront-v2-verification.md)**           | Historical Handoff | AI session handoff context for Storefront 2.0 design token verification.                    |
| **[`archive/ai-handoff-video-webcodecs.md`](./archive/ai-handoff-video-webcodecs.md)**                                 | Historical Handoff | AI session handoff context for the in-browser WebCodecs transcoding integration.            |
| **[`archive/baseline-test-failures.md`](./archive/baseline-test-failures.md)**                                         | Historical Record  | Snapshot of initial test suite failures prior to the major stabilization sprints.           |
| **[`archive/database-baseline-2026-08-29.md`](./archive/database-baseline-2026-08-29.md)**                             | Historical Record  | Database schema snapshot and migration count baseline recorded on 2026-08-29.               |
| **[`archive/inventory-incident-2026-09.md`](./archive/inventory-incident-2026-09.md)**                                 |  Incident Report   | Post-mortem analysis and permanent remediation of the September 2026 inventory count drift. |
| **[`archive/settings-and-brand-wizard-refinement-plan.md`](./archive/settings-and-brand-wizard-refinement-plan.md)**   |   Completed Plan   | Phased implementation plan that created `SETTINGS_REGISTRY` and 5-tab settings.             |
| **[`archive/store-vertical-modules-implementation-plan.md`](./archive/store-vertical-modules-implementation-plan.md)** |   Completed Plan   | Master implementation plan for business vertical modules and category presets.              |
| **[`archive/storefront-2-premium-upgrade-plan.md`](./archive/storefront-2-premium-upgrade-plan.md)**                   |   Completed Plan   | Master implementation plan for Storefront 2.0 premium components (V1 vs V2).                |
| **[`archive/storefront-mode-implementation-plan.md`](./archive/storefront-mode-implementation-plan.md)**               |   Completed Plan   | Implementation plan for catalog-only, inquiry, and e-commerce storefront operating modes.   |
