import { describe, expect, it } from "vitest";
import configToml from "../supabase/config.toml?raw";
import linkedRef from "../supabase/.temp/project-ref?raw";
import linkedProject from "../supabase/.temp/linked-project.json?raw";
import poolerUrl from "../supabase/.temp/pooler-url?raw";

/**
 * The Supabase project is named in one place: the build's environment (`VITE_SUPABASE_URL`,
 * read through `src/lib/supabase-project.ts`), and for the CLI `supabase/config.toml` with the
 * link the CLI keeps in `supabase/.temp`.
 *
 * The database moved from Tokyo to Mumbai on 2026-11-14. Afterwards an address written in the
 * code as a fallback still named a project from before Tokyo, the tracking call carried the
 * new project's address and key by hand, and the committed link still named Tokyo while
 * `config.toml` named Mumbai, so a fresh checkout was linked to the old project.
 */

const PROJECT_ADDRESS = /\b[a-z0-9]{20}\.supabase\.(co|in)\b/g;
const PUBLIC_KEY = /\bsb_(publishable|secret)_[A-Za-z0-9_-]{16,}/g;
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/g;

const sources = import.meta.glob(
  [
    "../src/**/*.{ts,tsx}",
    "../supabase/functions/**/*.ts",
    "../apps/boutq-os-mobile/src/**/*.{ts,tsx}",
    "../apps/boutq-os-mobile/{app,eas}.json",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

function offenders(pattern: RegExp): string[] {
  const found: string[] = [];
  for (const [file, text] of Object.entries(sources)) {
    for (const match of text.matchAll(pattern)) found.push(`${file}: ${match[0].slice(0, 32)}`);
  }
  return found;
}

describe("the Supabase project is named in one place", () => {
  it("reads the sources it guards", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(500);
    expect(Object.keys(sources)).toContain("../src/lib/supabase-project.ts");
    expect(Object.keys(sources)).toContain("../supabase/functions/send-order-email/index.ts");
  });

  it("writes no project's address in the app, the edge functions or the phone app", () => {
    expect(offenders(PROJECT_ADDRESS)).toEqual([]);
  });

  it("writes no project key in them either", () => {
    expect(offenders(PUBLIC_KEY)).toEqual([]);
    expect(offenders(JWT)).toEqual([]);
  });

  it("links the CLI to the project config.toml names", () => {
    const ref = configToml.match(/^project_id\s*=\s*"([a-z0-9]{20})"/m)?.[1];
    expect(ref).toBeTruthy();
    expect(linkedRef.trim()).toBe(ref);
    expect((JSON.parse(linkedProject) as { ref: string }).ref).toBe(ref);
    expect(poolerUrl).toContain(`postgres.${ref}@`);
  });
});
