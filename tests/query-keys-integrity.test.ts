import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

function getAllTsFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllTsFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

describe("Query Keys Integrity & Single Source of Truth", () => {
  const rootDir = path.resolve(__dirname, "..");
  const srcDir = path.join(rootDir, "src");

  it("strictly enforces that queryKeys.brand.businessSettings is never used with a partial .select() projection", () => {
    const allFiles = getAllTsFiles(srcDir);
    const violations: { file: string; line: number; statement: string }[] = [];

    for (const file of allFiles) {
      const relPath = path.normalize(path.relative(rootDir, file));
      const content = fs.readFileSync(file, "utf-8");

      if (!content.includes("queryKeys.brand.businessSettings")) {
        continue;
      }

      // Find usages of queryKeys.brand.businessSettings and verify queries select "*"
      const lines = content.split("\n");
      lines.forEach((line, idx) => {
        if (line.includes("queryKeys.brand.businessSettings")) {
          // Look ahead in subsequent lines for queryFn select call
          const windowSize = 25;
          const subsequent = lines.slice(idx, idx + windowSize).join("\n");
          const selectMatch = subsequent.match(/\.select\(\s*["'`]([^"'`]*)["'`]\s*\)/);
          if (selectMatch) {
            const selectArg = selectMatch[1].trim();
            if (selectArg !== "*") {
              violations.push({
                file: relPath,
                line: idx + 1,
                statement: selectMatch[0],
              });
            }
          }
        }
      });
    }

    expect(
      violations,
      `queryKeys.brand.businessSettings must only select "*" to preserve query cache shape integrity.\nFound violations:\n${JSON.stringify(violations, null, 2)}`,
    ).toEqual([]);
  });

  it("ensures StoreProfileCard does not query businessSettings directly and does not write to store_modules", () => {
    const cardPath = path.join(srcDir, "components", "settings", "StoreProfileCard.tsx");
    const content = fs.readFileSync(cardPath, "utf-8");

    // Must not query businessSettings directly (uses useAdminStoreProfile instead)
    expect(content.includes("queryKeys.brand.businessSettings")).toBe(false);

    // Must not write store_modules to business_settings
    expect(/store_modules\s*:/.test(content)).toBe(false);
  });

  it("ensures addons page route uses useAdminStoreProfile instead of polling businessSettings with partial select", () => {
    const addonsRoutePath = path.join(
      srcDir,
      "routes",
      "_authenticated",
      "admin.b.$slug.addons.tsx",
    );
    const content = fs.readFileSync(addonsRoutePath, "utf-8");

    expect(content.includes("queryKeys.brand.businessSettings")).toBe(false);
    expect(content.includes("useAdminStoreProfile")).toBe(true);
  });

  it("verifies useAdminStoreProfile default fallback vertical is 'general' and fitProfiles is empty", () => {
    const hookPath = path.join(srcDir, "hooks", "use-store-profile.ts");
    const content = fs.readFileSync(hookPath, "utf-8");

    // TRANSITIONAL_FALLBACK check
    expect(content).toMatch(/vertical:\s*["']general["']/);
    expect(content).toMatch(/fitProfiles:\s*\[\]/);
  });
});
