/**
 * The Supabase CLI every database check runs, pinned to one version.
 *
 * The CLI is not a dependency of the app (it would download its binary on every install, the
 * Workers build included), so the checks fetch it with npx. Unpinned, npx took the newest one:
 * on 2026-11-03 that became 3.0.0, whose `migration list` reads a local database instead of the
 * linked project, and every pull request's drift check failed connecting to 127.0.0.1:54322.
 * Move this to a new version on purpose, after running the three checks with it.
 */
export const SUPABASE_CLI = "npx --yes supabase@2.122.0";

/**
 * The rows `supabase db query -o json` prints.
 *
 * The CLI prints a bare array, except under an AI agent (AI_AGENT, CLAUDECODE), where it wraps
 * them as { boundary, rows, warning }. The checks read only the wrapped shape, so they passed when
 * run from an agent and failed in CI ("Unexpected non-whitespace character after JSON") the first
 * time CI had the credentials to run them (2026-11-22). Whatever comes before the JSON ("Initialising
 * login role...") or after it is not read.
 */
export function queryRows(output) {
  const start = output.search(/[[{]/);
  if (start < 0) throw new Error(`The Supabase CLI printed no JSON:\n${output}`);
  const end = output.lastIndexOf(output[start] === "[" ? "]" : "}");
  const parsed = JSON.parse(output.slice(start, end + 1));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.rows)) return parsed.rows;
  throw new Error(`The Supabase CLI printed JSON with no rows:\n${output}`);
}
