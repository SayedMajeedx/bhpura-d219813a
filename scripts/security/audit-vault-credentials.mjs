import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .flatMap((line) => {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (!match) return [];
        const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
        return [[match[1], value]];
      })
  );
}

const localEnv = readEnv(path.resolve(".env"));
const env = { ...localEnv, ...process.env };
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing Supabase URL or Anon key in environment");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("=== Auditing Integration Credentials Vault Storage ===");

  // Direct table query via anon client (must fail or return 0 rows due to RLS)
  const { data: anonRows, error: anonError } = await supabase
    .from("integration_credentials")
    .select("id, provider, api_key, webhook_secret, api_key_secret_id, last_rotated_at");

  if (anonError) {
    console.log("✔ RLS Check Passed: Anonymous direct access correctly denied:", anonError.message);
  } else if (!anonRows || anonRows.length === 0) {
    console.log("✔ RLS Check Passed: Anonymous direct access returned 0 rows (table isolated).");
  } else {
    console.error("✖ RLS VIOLATION: Anonymous client was able to read integration_credentials rows!");
    process.exit(1);
  }

  // Attempt to call RPC get_brand_categories_with_counts anonymously (must be rejected)
  const dummyBrandId = "00000000-0000-0000-0000-000000000000";
  const { error: rpcError } = await supabase.rpc("get_brand_categories_with_counts", {
    p_brand_id: dummyBrandId,
  });

  if (rpcError) {
    console.log("✔ Category RPC Permissions Passed: Anonymous execution rejected:", rpcError.message);
  } else {
    console.error("✖ PERMISSION VIOLATION: Anonymous client was able to execute get_brand_categories_with_counts!");
    process.exit(1);
  }

  console.log("\n✔ All security and isolation checks passed successfully.");
}

main().catch((err) => {
  console.error("Fatal error during audit:", err);
  process.exit(1);
});
