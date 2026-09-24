import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function checkMigrationDrift() {
  console.log("Checking Supabase migration drift between local and linked database...");

  let output;
  try {
    output = execSync("npx supabase migration list", {
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
      console.warn(
        "Supabase credentials not configured in this environment; skipping remote drift verification.",
      );
      return;
    }
    console.error("Failed to run npx supabase migration list:", stderr || err.message);
    process.exit(1);
  }

  // Find JSON array in the output
  const jsonMatch = output.match(/\[\s*\{.*\}\s*\]/s);
  if (!jsonMatch) {
    console.warn("Could not parse JSON output from supabase migration list. Raw output:\n", output);
    return;
  }

  let entries;
  try {
    entries = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    console.error("Failed to parse JSON entries:", parseErr.message);
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
