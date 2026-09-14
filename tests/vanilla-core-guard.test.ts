import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

describe("Vanilla Core Guard Tests", () => {
  const rootDir = path.resolve(__dirname, "..");
  const srcDir = path.join(rootDir, "src");

  // Allowed wrappers and bridge files
  const allowedAddonImports = new Set([
    path.normalize("src/lib/addons/addon-presets.ts"),
    path.normalize("src/lib/addons/addon-registry.ts"),
    path.normalize("src/routes/$slug.size-guide.tsx"),
    path.normalize("src/routes/_authenticated/admin.b.$slug.size-guides.tsx"),
  ]);

  it("prohibits any core file from directly importing @/addons/*", () => {
    const allSrcFiles = getAllFiles(srcDir);
    const violations: { file: string; line: number; importStatement: string }[] = [];

    for (const file of allSrcFiles) {
      const relPath = path.normalize(path.relative(rootDir, file));
      // Addons directory itself is allowed to import from addons
      if (relPath.startsWith(path.normalize("src/addons/"))) {
        continue;
      }
      if (allowedAddonImports.has(relPath)) {
        continue;
      }

      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");

      lines.forEach((line, idx) => {
        // Match import statements from @/addons/* or relative path into addons
        if (
          /import\s+.*from\s+['"](@\/addons\/|(?:\.\.\/)+addons\/)/.test(line) &&
          !line.trim().startsWith("//")
        ) {
          violations.push({
            file: relPath,
            line: idx + 1,
            importStatement: line.trim(),
          });
        }
      });
    }

    expect(
      violations,
      `Found unauthorized @/addons/* imports in core:\n${JSON.stringify(violations, null, 2)}`,
    ).toEqual([]);
  });

  it("verifies size-guide and fit-passport are decoupled from core components and routes", () => {
    const coreDirs = [
      path.join(srcDir, "components"),
      path.join(srcDir, "routes"),
      path.join(srcDir, "lib"),
    ];

    const forbiddenImports = [
      "SizeGuideModal",
      "SizeGuideInline",
      "StorefrontFitPassport",
      "CustomerFitPassport",
      "SizeGuideStudioPage",
      "SizeGuideStandalonePage",
    ];

    const violations: { file: string; token: string }[] = [];

    for (const dir of coreDirs) {
      const files = getAllFiles(dir);
      for (const file of files) {
        const relPath = path.normalize(path.relative(rootDir, file));
        if (
          allowedAddonImports.has(relPath) ||
          relPath.startsWith(path.normalize("src/lib/addons/"))
        ) {
          continue;
        }

        const content = fs.readFileSync(file, "utf-8");
        for (const token of forbiddenImports) {
          // Check for import of the forbidden component token
          const importRegex = new RegExp(`import\\s+{[^}]*\\b${token}\\b[^}]*}\\s+from`, "m");
          const defaultImportRegex = new RegExp(`import\\s+${token}\\s+from`, "m");
          if (importRegex.test(content) || defaultImportRegex.test(content)) {
            violations.push({ file: relPath, token });
          }
        }
      }
    }

    expect(
      violations,
      `Core files must not import extracted vertical components:\n${JSON.stringify(violations, null, 2)}`,
    ).toEqual([]);
  });

  it("verifies that fashion vertical keyword 'عباية' does not leak into vanilla core files", () => {
    const coreDirs = [
      path.join(srcDir, "components"),
      path.join(srcDir, "routes"),
      path.join(srcDir, "lib"),
    ];

    const violations: { file: string; line: number; text: string }[] = [];

    for (const dir of coreDirs) {
      const files = getAllFiles(dir);
      for (const file of files) {
        const relPath = path.normalize(path.relative(rootDir, file));
        // Skip addon bridge, onboarding activity definition, and legacy backward-compat sets
        if (
          relPath.startsWith(path.normalize("src/lib/addons/")) ||
          relPath.endsWith("store-profile.ts") || // STORE_ACTIVITIES lists 'abayas' as a valid onboarding business type
          relPath.endsWith("settings.tsx") // LEGACY_SETTINGS_NAMES backward-compatibility check
        ) {
          continue;
        }

        const content = fs.readFileSync(file, "utf-8");
        const lines = content.split("\n");
        lines.forEach((line, idx) => {
          // Check for Arabic 'عباية'
          if (
            line.includes("عباية") &&
            !line.trim().startsWith("//") &&
            !line.trim().startsWith("/*")
          ) {
            violations.push({
              file: relPath,
              line: idx + 1,
              text: line.trim(),
            });
          }
        });
      }
    }

    expect(
      violations,
      `Core files must remain vanilla and vertical-agnostic:\n${JSON.stringify(violations, null, 2)}`,
    ).toEqual([]);
  });
});
