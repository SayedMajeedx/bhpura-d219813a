import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/supabase/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleProxy(request, params._splat),
      POST: async ({ request, params }) => handleProxy(request, params._splat),
      PUT: async ({ request, params }) => handleProxy(request, params._splat),
      DELETE: async ({ request, params }) => handleProxy(request, params._splat),
      PATCH: async ({ request, params }) => handleProxy(request, params._splat),
      OPTIONS: async ({ request, params }) => handleProxy(request, params._splat),
    },
  },
});

async function handleProxy(request: Request, path: string) {
  // Resolve the real backend URL
  const realUrl = "https://ikciahnuqhemvnyfbyp.supabase.co";
  
  // Construct the target destination URL with search queries preserved
  const urlObj = new URL(request.url);
  const targetUrl = `${realUrl}/${path}${urlObj.search}`;
  
  const headers = new Headers();
  
  // Fetch standard public anon key to act as context identity for top-level OAuth pages
  const SUPABASE_PUBLISHABLE_KEY =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrY2lhaG51cWhlbXZueWZieXAiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTcyNzA4NjQyOCwiZXhwIjoyMDQyNjYyNDI4fQ.n-u09H9vj7S96N1H8pW6bE5B8_Yc7f_1350_5-m_864"; // Direct secure fallback if not loaded in env context

  // Always append standard routing context headers so Supabase knows which project is requesting
  headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);

  // Copy ONLY standard allowed browser client headers
  // We explicitly exclude "sec-fetch-*" headers which trigger security handshakes & TypeError inside Cloudflare Workers
  const allowedHeaders = [
    "authorization",
    "content-type",
    "prefer",
    "range",
    "x-client-info",
    "user-agent",
    "accept",
    "accept-language"
  ];
  
  request.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (allowedHeaders.includes(lowerKey)) {
      headers.set(key, value);
    }
  });

  // Read request body for modifying requests (POST, PUT, PATCH)
  let body: any = null;
  if (["POST", "PUT", "PATCH"].includes(request.method)) {
    try {
      body = await request.clone().arrayBuffer();
    } catch (e) {
      console.warn("Could not parse request body for proxy:", e);
    }
  }
  
  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      redirect: "manual", // Prevent automatic redirection following (crucial for passing OAuth redirects back to client)
    });
    
    // Copy response headers
    const resHeaders = new Headers();
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      // Avoid forwarding block-listed or compression mismatching response headers
      if (!["content-encoding", "transfer-encoding", "connection", "set-cookie"].includes(lowerKey)) {
        resHeaders.set(key, value);
      }
    });
    
    // Add CORS headers explicitly to resolve preflight checks in proxy environments
    resHeaders.set("Access-Control-Allow-Origin", urlObj.origin);
    resHeaders.set("Access-Control-Allow-Credentials", "true");
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: resHeaders,
    });
  } catch (error: any) {
    console.error("Supabase API proxy routing error:", error);
    return new Response(`Proxy Connection Error: ${error.message || String(error)}`, { status: 502 });
  }
}
