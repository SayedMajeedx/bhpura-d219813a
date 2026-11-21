/**
 * What a database check does when it cannot reach the linked database for want of credentials.
 *
 * On a contributor's machine with no Supabase login it skips, as before. In this repository's CI it
 * fails: the checks once skipped there for a week ("Supabase credentials are not configured here")
 * while the live database, restored in Mumbai on 2026-11-14, let any visitor call 365 functions and
 * read product costs (migration 20261216100000). A check that cannot run is not a check that passed.
 * Set the repository secrets SUPABASE_ACCESS_TOKEN and SUPABASE_DB_PASSWORD for the live project;
 * ALLOW_SKIP_DB_CHECKS=1 lets a run skip on purpose.
 */

/** "skip" or "fail", from the environment (`env` is `process.env` by default). */
export function missingCredentials(env = process.env) {
  const inCi = env.GITHUB_ACTIONS === "true" || env.CI === "true";
  if (!inCi || env.ALLOW_SKIP_DB_CHECKS === "1") return "skip";
  return "fail";
}

/**
 * Says the check could not run, and stops a CI run. Returns only when the check may be skipped.
 * `what` names the check ("the function grants check").
 */
export function onMissingCredentials(what, env = process.env) {
  if (missingCredentials(env) === "skip") {
    console.warn(`Supabase credentials are not configured here; skipping ${what}.`);
    return;
  }
  console.error(
    `Supabase credentials are not configured in CI, so ${what} cannot run. Set the repository ` +
      "secrets SUPABASE_ACCESS_TOKEN and SUPABASE_DB_PASSWORD for the live project " +
      "(or ALLOW_SKIP_DB_CHECKS=1 to skip on purpose).",
  );
  process.exit(1);
}
