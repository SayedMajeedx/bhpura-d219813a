// Run after `npm run build`. `vinxi/http` exists only on the server, so a browser that asks for it
// always fails. The production build announces that failure as `vite:preloadError`, which unit
// tests and the dev server never see. Fails when a file sent to browsers can reach the import
// without first checking that it is on the server.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SERVER_ONLY = "vinxi/http";
/** How far before the import its guard may sit in minified code. */
const GUARD_WITHIN = 60;

/** The places in one file's code that ask for the module with no server check before them. */
export function unguardedImports(code) {
  const found = [];
  for (let at = code.indexOf(SERVER_ONLY); at !== -1; at = code.indexOf(SERVER_ONLY, at + 1)) {
    const before = code.slice(Math.max(0, at - GUARD_WITHIN), at);
    if (!before.includes("typeof window")) found.push(at);
  }
  return found;
}

function main() {
  const dir = join("dist", "client", "assets");
  const bad = readdirSync(dir)
    .filter((name) => name.endsWith(".js"))
    .flatMap((name) =>
      unguardedImports(readFileSync(join(dir, name), "utf8")).map((at) => `${name} at ${at}`),
    );
  if (bad.length > 0) {
    console.error(`"${SERVER_ONLY}" can run in the browser:\n  ${bad.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`Client bundle clean: no unguarded "${SERVER_ONLY}".`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
