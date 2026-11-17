// The CI dependency audit: fails on any high or critical advisory, except one listed in
// scripts/audit-allowlist.json with its reason, and only until its review date. An advisory
// can be widened to every version with no patched release (picomatch, 2026-11-17): every
// branch then failed CI with nothing to upgrade to. The list keeps the audit strict for
// everything else, and an entry left past its date fails again so it is looked at.
//
// Exit codes: 0 clean, 1 a finding, 2 the audit could not be read (the caller asks again).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BLOCKING = new Set(["high", "critical"]);

/** The advisories in an `npm audit --json` report, one per address. */
export function advisoriesOf(report) {
  const found = new Map();
  for (const [name, entry] of Object.entries(report?.vulnerabilities ?? {})) {
    for (const via of entry.via ?? []) {
      if (typeof via !== "object" || !via?.url) continue;
      if (!found.has(via.url)) {
        found.set(via.url, {
          url: via.url,
          package: via.name ?? name,
          severity: via.severity,
          title: via.title ?? "",
        });
      }
    }
  }
  return [...found.values()];
}

/** What fails the audit: blocking advisories not excused today, and excuses past their date. */
export function auditFindings(report, allowlist, today) {
  const excused = new Map((allowlist?.advisories ?? []).map((entry) => [entry.url, entry]));
  const findings = [];
  for (const advisory of advisoriesOf(report)) {
    if (!BLOCKING.has(advisory.severity)) continue;
    const excuse = excused.get(advisory.url);
    if (!excuse) {
      findings.push({ ...advisory, why: "not excused" });
    } else if (!(excuse.reviewBy >= today)) {
      findings.push({ ...advisory, why: `excused until ${excuse.reviewBy}: review it again` });
    }
  }
  return findings;
}

function main() {
  let raw;
  try {
    raw = execFileSync("npm", ["audit", "--json"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      shell: process.platform === "win32",
    });
  } catch (error) {
    // npm audit exits non-zero whenever it finds anything; the report is still on stdout.
    raw = error?.stdout ?? "";
  }
  let report;
  try {
    report = JSON.parse(raw);
  } catch {
    console.error("The audit answered nothing readable.");
    process.exit(2);
  }
  if (report?.error || !report?.vulnerabilities) {
    console.error("The audit failed:", report?.error?.summary ?? "no report");
    process.exit(2);
  }
  const allowlist = JSON.parse(
    readFileSync(new URL("./audit-allowlist.json", import.meta.url), "utf8"),
  );
  const today = new Date().toISOString().slice(0, 10);
  const findings = auditFindings(report, allowlist, today);
  for (const entry of allowlist.advisories) {
    console.log(`Excused until ${entry.reviewBy}: ${entry.package} ${entry.url}`);
  }
  if (findings.length === 0) {
    console.log("No high or critical advisory left.");
    process.exit(0);
  }
  for (const finding of findings) {
    console.error(
      `${finding.severity}: ${finding.package} ${finding.url} (${finding.why}) ${finding.title}`,
    );
  }
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
