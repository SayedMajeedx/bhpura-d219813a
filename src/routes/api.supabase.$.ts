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
  
  // Clone incoming request headers
  const headers = new Headers(request.headers);
  
  // Strip host and authorization/origin headers if they match client to avoid SSL/cors issues
  headers.delete("host");
  headers.delete("origin");
  
  // Read request body for modifying requests (POST, PUT, PATCH)
  let body: any = null;
  if (["POST", "PUT", "PATCH"].includes(request.method)) {
    body = await request.clone().arrayBuffer();
  }
  
  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      redirect: "manual", // Prevent automatic redirection following on server side (crucial for OAuth redirects)
    });
    
    // Copy response headers
    const resHeaders = new Headers(response.headers);
    
    // Handle CORS headers to allow requests from client
    resHeaders.set("Access-Control-Allow-Origin", urlObj.origin);
    resHeaders.set("Access-Control-Allow-Credentials", "true");
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: resHeaders,
    });
  } catch (error: any) {
    console.error("Supabase API proxy routing error:", error);
    return new Response(error.message || "Proxy Connection Error", { status: 500 });
  }
}
