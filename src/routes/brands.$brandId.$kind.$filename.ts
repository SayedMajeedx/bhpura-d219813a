import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

function getPlatformEnv(event: any, name: string): string | undefined {
  const viteName = name.startsWith("VITE_") ? name : `VITE_${name}`;
  const unprefixed = name.startsWith("VITE_") ? name.slice(5) : name;

  try {
    if (event) {
      const env = event.context?.cloudflare?.env || 
                  event.context?.env || 
                  event.context?.cloudflare || 
                  event.context?.cloudflare?.env;
      if (env) {
        if (env[name]) return env[name];
        if (env[viteName]) return env[viteName];
        if (env[unprefixed]) return env[unprefixed];
      }
    }
  } catch {}

  try {
    const g = globalThis as any;
    const liveEnv = g["__CLOUDFLARE_ENV__"] || g["process"]?.["env"] || process.env;
    if (liveEnv) {
      if (liveEnv[name]) return liveEnv[name];
      if (liveEnv[viteName]) return liveEnv[viteName];
      if (liveEnv[unprefixed]) return liveEnv[unprefixed];
    }
  } catch {}

  return undefined;
}

function r2Client(event: any) {
  const accountId = getPlatformEnv(event, "R2_ACCOUNT_ID")?.trim();
  const accessKeyId = getPlatformEnv(event, "R2_ACCESS_KEY_ID")?.trim();
  const secretAccessKey = getPlatformEnv(event, "R2_SECRET_ACCESS_KEY")?.trim();
  const bucket = getPlatformEnv(event, "R2_BUCKET_NAME")?.trim();

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Missing R2 environment variables");
  }

  return {
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
  };
}

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/brands/$brandId/$kind/$filename")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { brandId, kind, filename } = params;
        const key = `brands/${brandId}/${kind}/${filename}`;

        let event: any = null;
        try {
          const { getEvent } = await import("vinxi/http");
          event = getEvent();
        } catch {}

        const debugInfo: any = {
          hasEvent: !!event,
          eventKeys: event ? Object.keys(event) : null,
          contextKeys: event?.context ? Object.keys(event.context) : null,
          cloudflareKeys: event?.context?.cloudflare ? Object.keys(event.context.cloudflare) : null,
          cloudflareEnvKeys: event?.context?.cloudflare?.env ? Object.keys(event.context.cloudflare.env) : null,
          globalThisKeys: Object.keys(globalThis).filter(k => k.toLowerCase().includes("env") || k.toLowerCase().includes("cloudflare")),
        };

        try {
          const { client, bucket } = r2Client(event);
          const command = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
          });

          const response = await client.send(command);
          if (!response.Body) {
            return new Response("Not Found", { status: 404 });
          }

          // Read stream into a response
          const headers = new Headers();
          if (response.ContentType) {
            headers.set("Content-Type", response.ContentType);
          }
          if (response.CacheControl) {
            headers.set("Cache-Control", response.CacheControl);
          } else {
            headers.set("Cache-Control", "public, max-age=31536000, immutable");
          }
          if (response.ContentLength) {
            headers.set("Content-Length", response.ContentLength.toString());
          }

          return new Response(response.Body as any, {
            status: 200,
            headers,
          });
        } catch (error: any) {
          console.error(`Error fetching R2 object for key "${key}":`, error);
          if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
            return new Response("Object Not Found", { status: 404 });
          }
          return new Response(`Internal Server Error: ${error.message} - ${error.stack}\nDebug Info: ${JSON.stringify(debugInfo, null, 2)}`, { status: 500 });
        }
      },
    },
  },
});
