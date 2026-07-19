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
  
  // Forward essential database headers + standard browser headers
  // Stripping cookies, cf-headers, and host headers to prevent security & TLS handshake conflicts
  const headers = new Headers();
  const allowedHeaders = [
    "apikey",
    "authorization",
    "content-type",
    "prefer",
    "range",
    "x-client-info",
    "user-agent",
    "accept",
    "accept-language",
    "sec-ch-ua",
    "sec-ch-ua-mobile",
    "sec-ch-ua-platform",
    "sec-fetch-dest",
    "sec-fetch-mode",
    "sec-fetch-site",
    "sec-fetch-user"
  ];
  
  request.headers.forEach((value, key) => {
    if (allowedHeaders.includes(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  // Ensure the apikey is present for standard Supabase routing
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
      redirect: "manual", // Prevent automatic redirection following (crucial for passing OAuth redirects back to client)
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
