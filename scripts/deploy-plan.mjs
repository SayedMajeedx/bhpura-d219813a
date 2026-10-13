/**
 * What `npm run deploy` does, decided by where it runs.
 *
 * Cloudflare builds every pushed branch (Workers Builds) and ran this same script for each of
 * them, so every push of any branch replaced what was live: unreviewed code went out on push, and
 * a branch behind main rolled production back until the next push. Found on 2026-10-13 in the
 * health log, which changed its behaviour two minutes after a branch was pushed and five hours
 * before its pull request was merged.
 *
 * Only the production branch is released now. Any other branch is uploaded as a version: it can
 * be previewed and nothing that is live changes. A run outside Cloudflare's builds (a person at
 * a terminal) releases, as before.
 */

/** The branch whose builds are released. */
export const PRODUCTION_BRANCH = "main";

const CONFIG = ["--config", "dist/server/wrangler.json"];

/**
 * @param {Record<string, string | undefined>} env the build's environment
 * @returns {{ release: boolean, branch: string | null, args: string[], why: string }}
 */
export function deployPlan(env) {
  // Workers Builds names the branch it is building; nothing else sets this.
  const branch = (env.WORKERS_CI_BRANCH ?? "").trim() || null;
  const production = (env.PRODUCTION_BRANCH ?? "").trim() || PRODUCTION_BRANCH;

  if (branch === null) {
    return {
      release: true,
      branch,
      args: ["deploy", ...CONFIG],
      why: "not a Cloudflare branch build: releasing, as asked",
    };
  }
  if (branch === production) {
    return {
      release: true,
      branch,
      args: ["deploy", ...CONFIG],
      why: `a build of ${production}: releasing`,
    };
  }
  return {
    release: false,
    branch,
    args: ["versions", "upload", ...CONFIG],
    why: `a build of the branch "${branch}", not ${production}: uploading a version to preview, nothing live changes`,
  };
}
