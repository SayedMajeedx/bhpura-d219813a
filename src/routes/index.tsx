import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: IndexRedirector,
});

function IndexComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-[#800020]" />
        <p className="text-zinc-400 text-sm font-light tracking-wide animate-pulse">
          Resolving boutique storefront...
        </p>
      </div>
    </div>
  );
}

function IndexRedirector() {
  const navigate = useNavigate();

  useEffect(() => {
    const resolveRouting = async () => {
      try {
        const hostname = window.location.hostname.toLowerCase();
        
        // List of known platform domains that should go to the Super Admin / Merchant login
        const isPlatformDomain = 
          hostname === "localhost" || 
          hostname === "127.0.0.1" || 
          hostname.endsWith(".pura.bh") || 
          hostname === "pura.bh" || 
          hostname.endsWith(".pages.dev") || 
          hostname.endsWith(".workers.dev") || 
          hostname.endsWith(".vercel.app");

        if (isPlatformDomain) {
          void navigate({ to: "/admin" });
          return;
        }

        // Custom Domain Mapping: Check if this custom hostname is bound to a boutique brand
        const { data: brand } = await supabase
          .from("brands")
          .select("slug")
          .eq("custom_domain", hostname)
          .eq("is_active", true)
          .maybeSingle();

        if (brand?.slug) {
          void navigate({ 
            to: "/$slug", 
            params: { slug: brand.slug } 
          });
        } else {
          void navigate({ to: "/admin" });
        }
      } catch (err) {
        console.error("Custom domain resolution failed:", err);
        void navigate({ to: "/admin" });
      }
    };

    void resolveRouting();
  }, [navigate]);

  return <IndexComponent />;
}
export default IndexRedirector;
