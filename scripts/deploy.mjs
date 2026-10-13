// `npm run deploy`, after the build: releases the production branch, and only uploads a version
// for any other branch (see deploy-plan.mjs).
import { spawnSync } from "node:child_process";
import { deployPlan } from "./deploy-plan.mjs";

const plan = deployPlan(process.env);
console.log(`[deploy] ${plan.why}`);
console.log(`[deploy] wrangler ${plan.args.join(" ")}`);

const result = spawnSync("npx", ["wrangler", ...plan.args], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (result.error) {
  console.error(`[deploy] could not run wrangler: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
