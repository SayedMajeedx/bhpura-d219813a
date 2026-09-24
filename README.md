# Boutq OS (bhpura)

Boutq OS is a multi-tenant e-commerce and brand operations platform designed specifically for luxury boutiques, designer brands, abaya ateliers, perfumeries, and specialty roasteries across the Arabian Gulf (GCC).

---

## Architecture & Tech Stack

- **Web Application (`src/`)**: Built on **React 19.2**, **TanStack Start** (Vinxi / Vite), **Tailwind CSS v4**, and deployed to **Cloudflare Workers**.
- **Mobile Merchant App (`apps/boutq-os-mobile/`)**: Native merchant application built on **React 19.1**, **React Native 0.81**, and **Expo 54**.
- **Backend & Database**: **Supabase** (PostgreSQL 15 with Row Level Security, pgvector, Edge Functions on Deno) and **Cloudflare R2** for public media and private documents.
- **Design System**: Strict semantic OKLCH color tokens, Shadcn UI primitives, and dual-version storefront engine (V1 classic and V2 premium).

---

## Getting Started

### Prerequisites

- Node.js 20+ (LTS)
- npm 10+

### Installation & Development

```bash
# Install web dependencies
npm install

# Start web development server
npm run dev

# Start mobile development app
cd apps/boutq-os-mobile
npm install
npm run start
```

---

## Core Commands & Quality Gates

Every pull request must pass the automated repository quality gates:

```bash
# Run all core checks locally (typecheck, lint, format check, and tests)
npm run check

# Individual quality checks
npm run typecheck           # TypeScript validation (tsc --noEmit)
npm run lint                # ESLint with --max-warnings 0
npm run format:check        # Prettier formatting verification
npm test                    # Vitest test suite execution
npm run db:migrations:check # SQL migration integrity and sequencing check

# Architecture & maintainability metrics
node scripts/maintainability-metrics.mjs
```

---

## Developer & Agent Guidelines

For comprehensive architecture rules, domain concepts (variant axes, store verticals, hero media, vocabulary), quality ratchets, and agent skills:

👉 **Please read [`AGENTS.md`](./AGENTS.md)**.
