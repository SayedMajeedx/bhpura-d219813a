/**
 * The Supabase project the browser talks to, as the build was given it: its address
 * (`VITE_SUPABASE_URL`) and its public key (the publishable key, else the older anon key),
 * in the order the Supabase client reads them.
 *
 * A project's address or key is never written in the code. The database moved from Tokyo
 * to Mumbai on 2026-11-14, and every address written by hand as a fallback had to be found
 * and changed; one still named a project from before Tokyo
 * (`tests/supabase-project-address.test.ts`).
 */

function withScheme(url: string): string {
  return url && !/^https?:\/\//.test(url) ? `https://${url}` : url;
}

/** The project's address with no trailing slash, or "" when the build was given none. */
export function supabaseProjectUrl(): string {
  const url = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return withScheme(String(url)).replace(/\/+$/, "");
}

/** The project's public key, or "" when the build was given none. */
export function supabasePublicKey(): string {
  return String(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      import.meta.env.VITE_SUPABASE_ANON_KEY ||
      import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
  );
}

/** An edge function's address on the project, or "" when the build was given no address. */
export function edgeFunctionUrl(name: string): string {
  const base = supabaseProjectUrl();
  return base ? `${base}/functions/v1/${name}` : "";
}
