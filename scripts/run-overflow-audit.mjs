#!/usr/bin/env node
/**
 * The overflow audits, on demand: every storefront page and every admin screen at phone width,
 * in Arabic and English, pressing buttons to open dialogs, drawers, menus and tabs, and measuring
 * that nothing is cut off at the side. Long (about half an hour for everything), so it is not part
 * of the pull-request checks.
 *
 *   npm run audit:overflow                         everything, the Pura store
 *   npm run audit:overflow -- --stores=zh,pura     other stores
 *   npm run audit:overflow -- --screens=orders,settings,/admin/brands   a few admin screens only
 *   npm run audit:overflow -- --admin | --storefront                    one side only
 *
 * Reads the live store and writes nothing: every write is answered in the browser.
 */
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const value = (name) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;

const env = { ...process.env, OVERFLOW_AUDIT: "1" };
if (value("stores")) env.OVERFLOW_AUDIT_SLUGS = value("stores");
if (value("screens")) env.AUDIT_SCREENS = value("screens");

const specs = [];
if (!args.includes("--storefront")) specs.push("tests/admin-overflow-audit.spec.ts");
if (!args.includes("--admin")) specs.push("tests/storefront-overflow-audit.spec.ts");

const result = spawnSync("npx", ["playwright", "test", ...specs], {
  stdio: "inherit",
  env,
  shell: true,
});
process.exit(result.status ?? 1);
