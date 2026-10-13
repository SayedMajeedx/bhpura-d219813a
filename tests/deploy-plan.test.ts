import { describe, expect, it } from "vitest";
import { PRODUCTION_BRANCH, deployPlan } from "../scripts/deploy-plan.mjs";
import packageJson from "../package.json";

// Only the production branch is released. Cloudflare builds every pushed branch and ran the same
// deploy script for each, so every push of any branch replaced what was live.

describe("what `npm run deploy` does", () => {
  it("releases a build of the production branch", () => {
    const plan = deployPlan({ WORKERS_CI: "1", WORKERS_CI_BRANCH: "main" });
    expect(plan.release).toBe(true);
    expect(plan.args).toEqual(["deploy", "--config", "dist/server/wrangler.json"]);
    expect(PRODUCTION_BRANCH).toBe("main");
  });

  it("only uploads a version for any other branch: nothing live changes", () => {
    for (const branch of ["fix/something", "refactor/a-page", "Main", "main-copy", "release"]) {
      const plan = deployPlan({ WORKERS_CI: "1", WORKERS_CI_BRANCH: branch });
      expect(plan.release).toBe(false);
      expect(plan.args).toEqual(["versions", "upload", "--config", "dist/server/wrangler.json"]);
      expect(plan.args).not.toContain("deploy");
      expect(plan.why).toContain(branch);
    }
  });

  it("releases when a person runs it outside Cloudflare's builds, as before", () => {
    expect(deployPlan({}).release).toBe(true);
    expect(deployPlan({ WORKERS_CI_BRANCH: "  " }).release).toBe(true);
    expect(deployPlan({}).args[0]).toBe("deploy");
  });

  it("follows another production branch when the build names one", () => {
    const env = { WORKERS_CI_BRANCH: "production", PRODUCTION_BRANCH: "production" };
    expect(deployPlan(env).release).toBe(true);
    expect(deployPlan({ ...env, WORKERS_CI_BRANCH: "main" }).release).toBe(false);
  });

  it("is what the deploy script runs: the package script never calls wrangler deploy itself", () => {
    expect(packageJson.scripts.deploy).toBe("npm run build && node scripts/deploy.mjs");
    for (const script of Object.values(packageJson.scripts)) {
      expect(script).not.toMatch(/wrangler deploy/);
    }
  });
});
