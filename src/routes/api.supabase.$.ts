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
  
  // Create sanitized headers to avoid intermediate proxy conflicts
  const headers = new Headers();
  const blockedHeaders = [
    "host",
    "connection",
    "keep-alive",
    "content-length",
    "transfer-encoding",
    "accept-encoding",
    "origin",
    "referer",
    "cf-connecting-ip",
    "cf-worker",
    "cf-ray",
    "cf-visitor",
    "x-real-ip",
    "x-forwarded-for",
    "x-forwarded-proto"
  ];
  
  request.headers.forEach((value, key) => {
    if (!blockedHeaders.includes(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  
  // Ensure the apikey header is present (crucial for Supabase auth and routing)
  const apikey = request.headers.get("apikey") || request.headers.get("x-client-info");
  if (apikey) {
    headers.set("apikey", apikey);
  }

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
      redirect: "manual", // Prevent automatic redirection following on server side (crucial for OAuth redirects)
    });
    
    // Copy response headers
    const resHeaders = new Headers();
    response.headers.forEach((value, key) => {
      // Avoid forwarding block-listed or compression mismatching response headers
      if (!["content-encoding", "transfer-encoding", "connection"].includes(key.toLowerCase())) {
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
