import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getEnvVariableAsync } from "@/integrations/supabase/auth-middleware";
import {
  MAX_INVOICE_ASSET_BYTES,
  invoiceAssetAllowed,
  invoiceAssetHosts,
  readCapped,
} from "@/lib/invoice-asset-rules";

const inputSchema = z.object({ url: z.string().url().max(2048) });

export const getInvoiceAssetDataUrl = createServerFn({ method: "POST" })
  .validator((value: unknown) => inputSchema.parse(value))
  .handler(async ({ data }) => {
    const url = new URL(data.url);
    const hosts = invoiceAssetHosts({
      supabaseUrl: await getEnvVariableAsync("SUPABASE_URL"),
      mediaBaseUrl: await getEnvVariableAsync("R2_PUBLIC_BASE_URL"),
    });
    if (!invoiceAssetAllowed(url, hosts)) throw new Error("Invoice asset host is not allowed");
    // A redirect would leave the hosts just checked, so it is refused, not followed.
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("Unable to load invoice asset");
    const contentType = response.headers.get("content-type") || "image/png";
    if (!contentType.startsWith("image/")) throw new Error("Invalid invoice image");
    const bytes = await readCapped(response, MAX_INVOICE_ASSET_BYTES);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return `data:${contentType};base64,${btoa(binary)}`;
  });
