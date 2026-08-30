import crypto from "node:crypto";
import fs from "node:fs/promises";

const artifactPath = process.env.MOBILE_ARTIFACT_PATH;
const appKey = process.env.MOBILE_APP_KEY;
const platform = process.env.MOBILE_PLATFORM;
const versionName = process.env.MOBILE_VERSION_NAME;
const buildNumber = process.env.MOBILE_BUILD_NUMBER;
const secret = process.env.MOBILE_RELEASE_UPLOAD_SECRET;
const endpoint =
  process.env.MOBILE_RELEASE_UPLOAD_URL ||
  "https://boutq.store/api/internal/mobile-releases/upload";
if (!artifactPath || !appKey || !platform || !versionName || !buildNumber || !secret) {
  throw new Error("Mobile release upload environment is incomplete");
}
const artifact = await fs.readFile(artifactPath);
const sha256 = crypto.createHash("sha256").update(artifact).digest("hex");
const response = await fetch(endpoint, {
  method: "PUT",
  headers: {
    "content-type":
      platform === "ios" ? "application/octet-stream" : "application/vnd.android.package-archive",
    "content-length": String(artifact.byteLength),
    "x-release-secret": secret,
    "x-app-key": appKey,
    "x-platform": platform,
    "x-version-name": versionName,
    "x-build-number": String(buildNumber),
    "x-artifact-sha256": sha256,
  },
  body: artifact,
});
if (!response.ok)
  throw new Error(`Release upload failed:${response.status}:${await response.text()}`);
console.log(JSON.stringify({ uploaded: true, ...(await response.json()) }));
