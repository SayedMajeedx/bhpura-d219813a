import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const migrationsDirectory = path.resolve("supabase", "migrations");
// Historical Supabase-generated migrations use UUID names with hyphens. Keep
// accepting them while enforcing a timestamp, safe characters and uniqueness.
const migrationPattern = /^(\d{14})_([A-Za-z0-9_-]+)\.sql$/;
const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql"));
const problems = [];
const versions = new Map();

for (const file of files) {
  const match = migrationPattern.exec(file);
  if (!match) {
    problems.push(`${file}: filename must be YYYYMMDDHHMMSS_<safe-name>.sql`);
    continue;
  }

  const [, version] = match;
  const earlier = versions.get(version);
  if (earlier) {
    problems.push(`duplicate migration version ${version}: ${earlier}, ${file}`);
  } else {
    versions.set(version, file);
  }

  const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
  if (sql.trim().length === 0) problems.push(`${file}: migration is empty`);
  if (/\bBEGIN\s*;/i.test(sql) !== /\bCOMMIT\s*;/i.test(sql)) {
    problems.push(`${file}: explicit transaction must contain both BEGIN and COMMIT`);
  }
}

if (problems.length > 0) {
  console.error("Migration integrity check failed:\n- " + problems.join("\n- "));
  process.exit(1);
}

console.log(`Migration integrity check passed (${files.length} unique migrations).`);
