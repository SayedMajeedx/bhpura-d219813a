import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const buildId = process.env.WHITE_LABEL_BUILD_ID;
const buildToken = process.env.WHITE_LABEL_BUILD_TOKEN;
const api =
  process.env.WHITE_LABEL_BUILD_API ||
  "https://ikciahnuqhemvnyfvbyp.supabase.co/functions/v1/white-label-build-api";
if (!buildId || !buildToken)
  throw new Error("WHITE_LABEL_BUILD_ID and WHITE_LABEL_BUILD_TOKEN are required");
const configResponse = await fetch(api, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ action: "config", build_id: buildId, build_token: buildToken }),
});
if (!configResponse.ok)
  throw new Error(`build config:${configResponse.status}:${await configResponse.text()}`);
const { build, app, brand } = await configResponse.json();
const mobile = path.join(root, "apps", "pura-line-mobile");
const assets = path.join(mobile, "assets");
await fs.mkdir(assets, { recursive: true });
async function asset(remote, fallback, out, size) {
  if (!remote) return fs.copyFile(path.join(mobile, "assets", fallback), out);
  const response = await fetch(remote);
  if (!response.ok) throw new Error(`asset:${response.status}`);
  return sharp(Buffer.from(await response.arrayBuffer()))
    .resize(size.width, size.height, { fit: "contain", background: size.background })
    .png()
    .toFile(out);
}
await asset(app.icon_url, "pura-line-icon.png", path.join(assets, "white-label-icon.png"), {
  width: 1024,
  height: 1024,
  background: app.background_color || "#FFFFFF",
});
await asset(
  app.splash_logo_url || app.icon_url,
  "pura-line-logo.png",
  path.join(assets, "white-label-splash.png"),
  { width: 1200, height: 500, background: { r: 0, g: 0, b: 0, alpha: 0 } },
);
await fs.writeFile(
  path.join(mobile, "google-services.json"),
  JSON.stringify(app.firebase_config, null, 2),
);
const config = {
  expo: {
    name: app.app_name,
    slug: `boutq-${brand.slug}-store`,
    version: app.version_name,
    orientation: "portrait",
    icon: "./assets/white-label-icon.png",
    scheme: `boutq${brand.slug.replace(/[^a-z0-9]/g, "")}`,
    userInterfaceStyle: "light",
    newArchEnabled: false,
    android: {
      googleServicesFile: "./google-services.json",
      package: app.android_package,
      versionCode: app.version_code,
      predictiveBackGestureEnabled: false,
      adaptiveIcon: {
        backgroundColor: app.background_color || "#FFFFFF",
        foregroundImage: "./assets/white-label-icon.png",
      },
      permissions: ["POST_NOTIFICATIONS"],
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          backgroundColor: app.background_color || "#FFFFFF",
          image: "./assets/white-label-splash.png",
          imageWidth: 220,
        },
      ],
      [
        "expo-notifications",
        { color: app.primary_color || "#330A0A", defaultChannel: "pura-orders" },
      ],
    ],
    extra: { router: {} },
  },
};
await fs.writeFile(path.join(mobile, "app.json"), JSON.stringify(config, null, 2));
await fs.writeFile(
  path.join(mobile, ".env.production"),
  [
    `EXPO_PUBLIC_STOREFRONT_URL=${app.storefront_url}`,
    `EXPO_PUBLIC_APP_NAME=${app.app_name}`,
    `EXPO_PUBLIC_BRAND_SLUG=${brand.slug}`,
    `EXPO_PUBLIC_BRAND_COLOR=${app.primary_color}`,
  ].join("\n") + "\n",
);
console.log(
  JSON.stringify({
    appId: app.id,
    buildId,
    packageName: app.android_package,
    versionCode: app.version_code,
  }),
);
