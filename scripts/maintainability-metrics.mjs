import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

/**
 * Recursively walk directory and collect matching files.
 * @param {string} dir
 * @param {(name: string) => boolean} filter
 * @param {string[]} out
 * @returns {string[]}
 */
function walk(dir, filter, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip common non-source directories if encountered
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
        continue;
      }
      walk(full, filter, out);
    } else if (!filter || filter(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Collect all maintainability metrics across the repository.
 * @param {string} [rootDir]
 */
/**
 * A direct Supabase client call. The optional group also counts calls behind
 * a cast, `(supabase as any).from(` (often split over two lines), which the
 * first version of this pattern missed.
 */
export const SUPABASE_CALL_PATTERN =
  /(?:supabase|supabaseAdmin|publicSupabase)(?:\s+as\s+\w+\s*\))?\s*\.\s*(?:from|rpc|auth|storage|functions|channel|removeChannel)\b/;

/** How many direct Supabase calls a source text contains. */
export function countDirectSupabaseCalls(content) {
  return (content.match(new RegExp(SUPABASE_CALL_PATTERN.source, "g")) || []).length;
}

/**
 * What gives a Supabase read a bound of its own: a limit, a range, one row, a count with no rows,
 * a list of ids, or the helper that reads a list to its end (`readAll`, src/lib/data/read-all.ts).
 */
const LIST_BOUNDS = [
  ".limit(",
  ".range(",
  ".single(",
  ".maybeSingle(",
  "head: true",
  ", head)",
  '.eq("id"',
  '.in("id"',
];
const LIST_WRITES = [".insert(", ".update(", ".upsert(", ".delete("];

/** Where the statement that starts at `start` ends: its `;`, or the bracket that closes around it. */
function statementEnd(content, start) {
  let depth = 0;
  const stop = Math.min(content.length, start + 4000);
  for (let i = start; i < stop; i += 1) {
    const ch = content[i];
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
      if (depth < 0) return i;
    } else if (ch === ";" && depth === 0) return i;
  }
  return stop;
}

/**
 * A query kept in a variable (`let query = supabase.from(...)`, filters added, then
 * `query.range(from, to)`) takes its bound in a later statement that names the variable.
 */
function boundedLater(content, start, end) {
  const before = content.slice(Math.max(0, start - 120), start);
  const assigned = /(?:let|const)\s+(\w+)\s*=\s*(?:await\s+)?[\w\s().]*$/.exec(before);
  if (!assigned) return false;
  const name = new RegExp(`\\b${assigned[1]}\\b`);
  return content
    .slice(end, end + 1500)
    .split(";")
    .some(
      (statement) =>
        name.test(statement) && (statement.includes(".range(") || statement.includes(".limit(")),
    );
}

/**
 * The list reads in a source text that have no bound of their own, as `{ table, line }`. The API
 * answers such a read with at most its row limit (1,000 rows) and does not say that it stopped:
 * the caller holds a cut list and takes it for the whole. A read whose caller needs every row
 * goes through `readAll`; any other says how many rows it wants.
 */
export function findUnboundedListReads(content) {
  const found = [];
  const from = /\.from\(\s*["']([a-z_]+)["']\s*\)/g;
  for (let match = from.exec(content); match; match = from.exec(content)) {
    const chain = content.slice(match.index, statementEnd(content, match.index));
    if (!chain.includes(".select(")) continue;
    if (LIST_WRITES.some((write) => chain.includes(write))) continue;
    if (LIST_BOUNDS.some((bound) => chain.includes(bound))) continue;
    if (boundedLater(content, match.index, statementEnd(content, match.index))) continue;
    found.push({
      table: match[1],
      line: content.slice(0, match.index).split(/\r?\n/).length,
    });
  }
  return found;
}

export function collectMaintainabilityMetrics(rootDir = REPO_ROOT) {
  const srcDir = path.join(rootDir, "src");
  const testsDir = path.join(rootDir, "tests");

  const isExcluded = (rel) => {
    return (
      rel.endsWith("routeTree.gen.ts") ||
      rel.endsWith("src/integrations/supabase/types.ts") ||
      rel.endsWith("routeTree.gen.tsx")
    );
  };

  const srcFiles = walk(srcDir, (name) => /\.(tsx?|jsx?)$/.test(name))
    .map((full) => {
      const rel = path.relative(rootDir, full).replace(/\\/g, "/");
      return { full, rel };
    })
    .filter((f) => !isExcluded(f.rel))
    .sort((a, b) => a.rel.localeCompare(b.rel));

  const fileLineCounts = {};
  const filesOver1000 = [];

  let asAny = 0;
  let colonAny = 0;
  let asNever = 0;
  let tsIgnore = 0;
  let tsExpectError = 0;
  let eslintDisable = 0;

  for (const { full, rel } of srcFiles) {
    const content = fs.readFileSync(full, "utf8");
    const lines = content.trimEnd().length === 0 ? 0 : content.trimEnd().split(/\r?\n/).length;
    fileLineCounts[rel] = lines;
    if (lines > 1000) {
      filesOver1000.push({ file: rel, lines });
    }

    asAny += (content.match(/\bas\s+any\b/g) || []).length;
    colonAny += (content.match(/:\s*any\b/g) || []).length;
    asNever += (content.match(/\bas\s+never\b/g) || []).length;
    tsIgnore += (content.match(/@ts-ignore\b/g) || []).length;
    tsExpectError += (content.match(/@ts-expect-error\b/g) || []).length;
    eslintDisable += (content.match(/eslint-disable\b/g) || []).length;
  }

  filesOver1000.sort((a, b) => b.lines - a.lines);

  // Direct Supabase calls in src/routes, src/components, src/features
  const supabaseCallPattern = new RegExp(SUPABASE_CALL_PATTERN.source, "g");

  const directSupabaseByDir = {
    "src/routes": 0,
    "src/components": 0,
    "src/features": 0,
  };
  let directSupabaseCalls = 0;

  for (const { full, rel } of srcFiles) {
    let dirKey = null;
    if (rel.startsWith("src/routes/")) dirKey = "src/routes";
    else if (rel.startsWith("src/components/")) dirKey = "src/components";
    else if (rel.startsWith("src/features/")) dirKey = "src/features";

    if (dirKey) {
      const content = fs.readFileSync(full, "utf8");
      const matches = content.match(supabaseCallPattern);
      if (matches) {
        directSupabaseByDir[dirKey] += matches.length;
        directSupabaseCalls += matches.length;
      }
    }
  }

  // List reads with no bound of their own, anywhere in src
  const unboundedListReads = [];
  for (const { full, rel } of srcFiles) {
    if (rel.startsWith("src/integrations/")) continue;
    for (const read of findUnboundedListReads(fs.readFileSync(full, "utf8"))) {
      unboundedListReads.push(`${rel}:${read.line} ${read.table}`);
    }
  }

  // Test files that use readFileSync to inspect source files (brittle tests)
  const testFiles = walk(testsDir, (name) => /\.(tsx?|jsx?|mjs|cjs)$/.test(name))
    .map((full) => {
      const rel = path.relative(rootDir, full).replace(/\\/g, "/");
      return { full, rel };
    })
    .filter((f) => !f.rel.endsWith("maintainability-ratchet.test.ts"))
    .sort((a, b) => a.rel.localeCompare(b.rel));

  const readFileSyncPattern = /\breadFileSync\s*\(/;
  const readFileSyncTestFiles = [];
  for (const { full, rel } of testFiles) {
    const content = fs.readFileSync(full, "utf8");
    if (readFileSyncPattern.test(content)) {
      readFileSyncTestFiles.push(rel);
    }
  }

  return {
    timestamp: new Date().toISOString(),
    summary: {
      totalSourceFiles: srcFiles.length,
      filesOver1000: filesOver1000.length,
      asAny,
      colonAny,
      asNever,
      tsIgnore,
      tsExpectError,
      eslintDisable,
      directSupabaseCalls,
      readFileSyncTestFiles: readFileSyncTestFiles.length,
      unboundedListReads: unboundedListReads.length,
    },
    directSupabaseCalls: {
      total: directSupabaseCalls,
      byDir: directSupabaseByDir,
    },
    typeEscapes: {
      asAny,
      colonAny,
      asNever,
      tsIgnore,
      tsExpectError,
      eslintDisable,
    },
    filesOver1000,
    readFileSyncTestFiles,
    unboundedListReads,
    fileLineCounts,
  };
}

// When executed directly, print JSON to stdout
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  const metrics = collectMaintainabilityMetrics();
  if (process.argv.includes("--write-baseline")) {
    const baselinePath = path.resolve(REPO_ROOT, "scripts/maintainability-baseline.json");
    fs.writeFileSync(baselinePath, JSON.stringify(metrics, null, 2) + "\n", "utf8");
    console.error(`Baseline written to ${baselinePath}`);
  }
  process.stdout.write(JSON.stringify(metrics, null, 2) + "\n");
}
