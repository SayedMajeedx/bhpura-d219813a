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
