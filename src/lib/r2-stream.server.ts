import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

let getEventFn: any = null;
import(/* @vite-ignore */ "vinxi/http")
  .then((m) => {
    getEventFn = m.getEvent;
  })
  .catch(() => {});

function getPlatformEnv(name: string): string | undefined {
  const viteName = name.startsWith("VITE_") ? name : `VITE_${name}`;
  const unprefixed = name.startsWith("VITE_") ? name.slice(5) : name;

  try {
    if (getEventFn) {
      const event = getEventFn();
      const env = event?.context?.cloudflare?.env || 
                  event?.context?.env || 
                  event?.context?.cloudflare || 
                  event?.context?.cloudflare?.env;
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

export function r2Client() {
  const accountId = getPlatformEnv("R2_ACCOUNT_ID")?.trim();
  const accessKeyId = getPlatformEnv("R2_ACCESS_KEY_ID")?.trim();
  const secretAccessKey = getPlatformEnv("R2_SECRET_ACCESS_KEY")?.trim();
  const bucket = getPlatformEnv("R2_BUCKET_NAME")?.trim();

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(`Missing R2 environment variables. AccountId: ${!!accountId}, AccessKey: ${!!accessKeyId}, SecretAccessKey: ${!!secretAccessKey}, Bucket: ${!!bucket}`);
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

export async function handleR2Stream(brandId: string, kind: string, filename: string): Promise<Response> {
  const key = `brands/${brandId}/${kind}/${filename}`;

  // Debug Info payload
  const debugInfo: any = {
    hasGetEventFn: !!getEventFn,
    globalThisKeys: Object.keys(globalThis).filter(k => k.toLowerCase().includes("env") || k.toLowerCase().includes("cloudflare")),
    cloudflareEnvKeys: (globalThis as any).__CLOUDFLARE_ENV__ ? Object.keys((globalThis as any).__CLOUDFLARE_ENV__) : null,
    envKeys: (globalThis as any).__env__ ? Object.keys((globalThis as any).__env__) : null,
  };

  try {
    const { client, bucket } = r2Client();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await client.send(command);
    if (!response.Body) {
      return new Response("Not Found", { status: 404 });
    }

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
    console.error(`Error streaming R2 asset for key "${key}":`, error);
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      return new Response("Object Not Found", { status: 404 });
    }
    return new Response(`Internal Server Error: ${error.message} - ${error.stack}\nDebug Info: ${JSON.stringify(debugInfo, null, 2)}`, { status: 500 });
  }
}
