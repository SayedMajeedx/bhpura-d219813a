import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SUPABASE_CLI } from "./supabase-cli.mjs";
import { onMissingCredentials } from "./credentials.mjs";

/**
 * The rows of `supabase migration list`: each version as the repository and the database have it.
 *
 * The CLI prints a table (`Local | Remote | Time (UTC)`), with or without `-o json`, except
 * under an AI agent (AI_AGENT, CLAUDECODE), where it prints `{"migrations":[{local, remote}]}`.
 * This check once read the JSON only, and finding none it warned and passed: CI's run compared
 * nothing (found 2026-11-22, the first run CI had the credentials for). A version on one side only
 * leaves the other cell empty. Anything else reads as no rows, and the check fails.
 */
export function migrationEntries(output) {
  const isVersion = (v) => typeof v === "string" && /^\d{14}$/.test(v);
  const entry = (local, remote) => ({
    local: isVersion(local) ? local : null,
    remote: isVersion(remote) ? remote : null,
  });
  const start = output.indexOf("{");
  if (start >= 0) {
    try {
      const parsed = JSON.parse(output.slice(start, output.lastIndexOf("}") + 1));
      if (Array.isArray(parsed.migrations)) {
        return parsed.migrations
          .filter((m) => isVersion(m.local) || isVersion(m.remote))
          .map((m) => entry(m.local, m.remote));
      }
    } catch {
      // Not the agent's JSON: read the table.
    }
  }
  const version = (cell) => cell.replace(/`/g, "").trim();
  return output.split("\n").flatMap((line) => {
    const cells = line.split("|");
    if (cells.length < 3) return [];
    const local = version(cells[0]);
    const remote = version(cells[1]);
    if (!isVersion(local) && !isVersion(remote)) return [];
    return [entry(local, remote)];
  });
}

export function checkMigrationDrift() {
  console.log("Checking Supabase migration drift between local and linked database...");

  let output;
  try {
    output = execSync(`${SUPABASE_CLI} migration list --linked`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    const stderr = err.stderr ? String(err.stderr) : "";
    const stdout = err.stdout ? String(err.stdout) : "";
    if (
      stderr.includes("Access token not provided") ||
      stdout.includes("Access token not provided") ||
      stderr.includes("not linked")
    ) {
      onMissingCredentials("the remote drift verification");
      return;
    }
    console.error("Failed to run supabase migration list:", stderr || err.message);
    process.exit(1);
  }

  const entries = migrationEntries(output);
  if (!entries.length) {
    console.error(
      "Could not read any migration from supabase migration list. Raw output:\n",
      output,
    );
    process.exit(1);
  }

  const localOnly = [];
  const remoteOnly = [];

  for (const entry of entries) {
    if (entry.local && !entry.remote) {
      localOnly.push(entry.local);
    } else if (!entry.local && entry.remote) {
      remoteOnly.push(entry.remote);
    }
  }

  if (localOnly.length > 0 || remoteOnly.length > 0) {
    console.error(`Migration drift detected!`);
    if (localOnly.length > 0) {
      console.error(`Local-only migrations (${localOnly.length}):`, localOnly);
    }
    if (remoteOnly.length > 0) {
      console.error(`Remote-only migrations (${remoteOnly.length}):`, remoteOnly);
    }
    console.error("Consult docs/database-recovery.md for ledger repair instructions.");
    process.exit(1);
  }

  console.log(`Zero migration drift verified across ${entries.length} recorded versions.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  checkMigrationDrift();
}
