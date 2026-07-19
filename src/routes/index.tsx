import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    // 1. Detect environment and current hostname
    if (typeof window === "undefined") return; // SSR Safety

    const hostname = window.location.hostname.toLowerCase();
    
    // List of known platform domains that should go to the Super Admin / Merchant login
    const isPlatformDomain = 
      hostname === "localhost" || 
      hostname === "127.0.0.1" || 
      hostname.endsWith(".pura.bh") || 
      hostname === "pura.bh" || 
      hostname.endsWith(".pages.dev") || // Cloudflare free preview domains
      hostname.endsWith(".vercel.app");  // Vercel fallback domains

    if (isPlatformDomain) {
      // Direct platform visitors to the merchant portal
      throw redirect({ to: "/admin" });
    }

    // 2. Custom Domain Mapping: Check if this custom hostname is bound to a boutique brand
    try {
      const { data: brand, error } = await supabase
        .from("brands")
        .select("slug")
        .eq("custom_domain", hostname)
        .eq("is_active", true)
        .maybeSingle();

      if (brand?.slug) {
        // Dynamic edge redirection: transparently direct the visitor to the brand's storefront route
        throw redirect({ 
          to: "/$slug", 
          params: { slug: brand.slug } 
        });
      }
    } catch (err) {
      console.error("Custom domain resolution failed:", err);
    }

    // If no matching brand is found for this custom domain, redirect to platform main admin
    throw redirect({ to: "/admin" });
  },
});
