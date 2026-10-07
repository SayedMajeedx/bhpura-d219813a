import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Which database functions a browser can call.
 *
 * Supabase lets every API caller (the public key, a visitor: `anon`; any signed-in account,
 * shoppers included: `authenticated`) execute a SECURITY DEFINER function unless the migration that
 * made it takes the grant away. An audit found functions that returned stored payment keys, marked
 * orders paid and rewrote stock to anyone. `supabase/function-grants.json` lists every such function
 * that is meant to be callable from a browser, and why; this check reads the live database and
 * fails when a function can be called by `anon` or `authenticated` and is not listed, or is listed
 * for fewer callers than can really call it.
 *
 * Migrations are applied before a pull request is opened, so the check sees a pull request's new
 * functions in CI. A new function that only the server calls needs
 *   REVOKE EXECUTE ON FUNCTION public.name(args) FROM PUBLIC, anon, authenticated;
 * in the migration that creates it. One a browser must call needs a line in the allowlist and a
 * check of the caller inside the function (never `IF auth.uid() IS NOT NULL AND NOT ...`, which an
 * anonymous caller skips).
 */

const ALLOWLIST_FILE = "supabase/function-grants.json";

export const LIVE_GRANTS_QUERY = `
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as signature,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and p.prorettype <> 'trigger'::regtype
  and (has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
order by 1`;

/**
 * What the live database lets a browser do that the allowlist does not.
 * `live`: [{ signature, anon, authenticated }]; `allowlist`: { [signature]: { anon, authenticated } }.
 */
export function diffGrants(live, allowlist) {
  const problems = [];
  const liveSignatures = new Set();
  for (const row of live) {
    liveSignatures.add(row.signature);
    const allowed = allowlist[row.signature];
    if (!allowed) {
      const who = [row.anon && "anon", row.authenticated && "authenticated"].filter(Boolean);
      problems.push({ signature: row.signature, kind: "not-listed", to: who });
      continue;
    }
    const wider = [
      row.anon && !allowed.anon && "anon",
      row.authenticated && !allowed.authenticated && "authenticated",
    ].filter(Boolean);
    if (wider.length)
      problems.push({ signature: row.signature, kind: "wider-than-listed", to: wider });
  }
  const stale = Object.keys(allowlist).filter((signature) => !liveSignatures.has(signature));
  return { problems, stale };
}

function readLive() {
  let output;
  try {
    output = execSync(
      `npx supabase db query --linked -o json "${LIVE_GRANTS_QUERY.replace(/\s+/g, " ").trim()}"`,
      {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  } catch (err) {
    const text = `${err.stderr ?? ""}${err.stdout ?? ""}`;
    if (/access token|not linked|login/i.test(text)) {
      console.warn(
        "Supabase credentials are not configured here; skipping the function grants check.",
      );
      return null;
    }
    console.error(
      "Could not read the function grants from the linked database:",
      text || err.message,
    );
    process.exit(1);
  }
  const start = output.indexOf("{");
  return JSON.parse(output.slice(start)).rows;
}

export function checkFunctionGrants() {
  console.log("Checking which database functions a browser can call...");
  const live = readLive();
  if (!live) return;
  const allowlist = JSON.parse(readFileSync(ALLOWLIST_FILE, "utf8")).functions;
  const { problems, stale } = diffGrants(live, allowlist);

  if (stale.length) {
    console.warn(
      `${stale.length} listed function(s) are gone or no longer callable by a browser (remove them from ${ALLOWLIST_FILE}):`,
    );
    for (const signature of stale) console.warn(`  - ${signature}`);
  }
  if (problems.length) {
    console.error(
      `\n${problems.length} function(s) a browser can call are not allowed by ${ALLOWLIST_FILE}:`,
    );
    for (const p of problems) console.error(`  - ${p.signature}: ${p.kind} (${p.to.join(", ")})`);
    console.error(
      "\nIf only the server calls it: REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon, authenticated; in its migration.\n" +
        "If a browser must call it: check the caller inside the function, then list it with a reason.",
    );
    process.exit(1);
  }
  console.log(`Verified ${live.length} browser-callable functions against the allowlist.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  checkFunctionGrants();
}
