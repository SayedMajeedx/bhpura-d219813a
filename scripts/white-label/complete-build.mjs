import fs from "node:fs/promises";

const event = JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const buildId = event?.client_payload?.build_id;
const buildToken = event?.client_payload?.build_token;
const api =
  process.env.WHITE_LABEL_BUILD_API ||
  "https://ikciahnuqhemvnyfvbyp.supabase.co/functions/v1/white-label-build-api";
if (!buildId || !buildToken) throw new Error("Build callback environment is incomplete");
let upload = null;
try {
  upload = JSON.parse(await fs.readFile(".white-label-upload.json", "utf8"));
} catch {}
const response = await fetch(api, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    action: "complete",
    build_id: buildId,
    build_token: buildToken,
    outcome: process.env.BUILD_OUTCOME || "failed",
    run_url: process.env.BUILD_RUN_URL || null,
    run_id: process.env.GITHUB_RUN_ID || null,
    apk_url: upload?.apk_url || null,
    apk_object_key: upload?.object_key || null,
    apk_sha256: upload?.sha256 || null,
    apk_size_bytes: upload?.size || null,
  }),
});
if (!response.ok)
  throw new Error(`Build callback failed:${response.status}:${await response.text()}`);
