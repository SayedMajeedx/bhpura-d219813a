import React, { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { X } from "lucide-react";

/** Shown when the storefront cannot load or the brand does not exist. */
export function StorefrontError({ error }: { error?: any }) {
  useEffect(() => {
    if (error) {
      console.error("STOREFRONT_ERROR:", error);
    }
  }, [error]);

  const errorMsg =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null
        ? error.message || JSON.stringify(error)
        : String(error || "");

  return (
    <div className="min-h-screen grid place-items-center p-8">
      <Card className="p-8 text-center max-w-md">
        <div className="mx-auto mb-4 h-10 w-10 rounded-full bg-muted grid place-items-center">
          <X className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-display mb-2">Storefront unavailable</h1>
        <p className="text-muted-foreground mb-2">
          This brand doesn't have an active storefront yet.
        </p>
        {error && (
          <div className="mt-4 p-3 bg-destructive/10 text-xs font-mono text-start rounded overflow-auto max-h-40 text-destructive border border-destructive/20 select-all">
            <div className="font-bold mb-1">Diagnostic Info:</div>
            {errorMsg}
          </div>
        )}
      </Card>
    </div>
  );
}
