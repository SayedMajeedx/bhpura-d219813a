import crypto from "node:crypto";
import fs from "node:fs/promises";

const event = JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const buildId = event?.client_payload?.build_id;
const buildToken = event?.client_payload?.build_token;
if (!buildId || !buildToken) throw new Error("Scoped build credentials are required");
const apkPath = "apps/pura-line-mobile/android/app/build/outputs/apk/release/app-release.apk";
const apk = await fs.readFile(apkPath);
const sha256 = crypto.createHash("sha256").update(apk).digest("hex");
const endpoint =
  process.env.WHITE_LABEL_UPLOAD_URL ||
  "https://boutq.store/api/internal/white-label-builds/upload";
const response = await fetch(endpoint, {
  method: "PUT",
  headers: {
    "content-type": "application/vnd.android.package-archive",
    "content-length": String(apk.byteLength),
    "x-build-id": buildId,
    "x-build-token": buildToken,
    "x-apk-sha256": sha256,
  },
  body: apk,
});
if (!response.ok)
  throw new Error(`Permanent APK upload failed:${response.status}:${await response.text()}`);
const result = await response.json();
await fs.writeFile(".white-label-upload.json", JSON.stringify(result));
console.log(JSON.stringify({ uploaded: true, size: result.size, sha256: result.sha256 }));
