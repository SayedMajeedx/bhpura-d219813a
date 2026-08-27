import fs from "node:fs";
const file = "app/build.gradle";
let source = fs.readFileSync(file, "utf8");
source = source.replace(
  "signingConfigs {",
  `signingConfigs {
        release {
            storeFile file(BOUTQ_UPLOAD_STORE_FILE)
            storePassword BOUTQ_UPLOAD_STORE_PASSWORD
            keyAlias BOUTQ_UPLOAD_KEY_ALIAS
            keyPassword BOUTQ_UPLOAD_KEY_PASSWORD
        }`,
);
source = source.replace(
  /release \{([\s\S]*?)signingConfig signingConfigs\.debug/,
  "release {$1signingConfig signingConfigs.release",
);
fs.writeFileSync(file, source);
