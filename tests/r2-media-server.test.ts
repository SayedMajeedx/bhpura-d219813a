import { describe, expect, it, vi } from "vitest";
import { handleR2MediaRequest } from "../src/lib/r2-media-server";

describe("handleR2MediaRequest range and streaming", () => {
  it("returns 200 for full video request via R2 bucket binding", async () => {
    const mockR2Binding = {
      get: vi.fn().mockResolvedValue({
        size: 1000000,
        httpMetadata: { contentType: "video/mp4" },
        httpEtag: '"mock-etag"',
        body: new ReadableStream(),
      }),
    };

    const env = {
      R2_PUBLIC_BUCKET: mockR2Binding,
    } as unknown as Cloudflare.Env;

    const request = new Request("https://media.boutq.store/brands/brand-1/hero/sample.mp4", {
      method: "GET",
    });

    const response = await handleR2MediaRequest(request, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Content-Length")).toBe("1000000");
    expect(response.headers.get("Content-Range")).toBeNull();
  });

  it("returns 206 Partial Content when range is satisfied via R2 bucket binding", async () => {
    const mockR2Binding = {
      get: vi.fn().mockImplementation((_key, options) => {
        expect(options.range).toBeDefined();
        return Promise.resolve({
          size: 1000000,
          range: { offset: 0, length: 1024 },
          httpMetadata: { contentType: "video/mp4" },
          httpEtag: '"mock-etag"',
          body: new ReadableStream(),
        });
      }),
    };

    const env = {
      R2_PUBLIC_BUCKET: mockR2Binding,
    } as unknown as Cloudflare.Env;

    const request = new Request("https://media.boutq.store/brands/brand-1/hero/sample.mp4", {
      method: "GET",
      headers: {
        Range: "bytes=0-1023",
      },
    });

    const response = await handleR2MediaRequest(request, env);
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Content-Length")).toBe("1024");
    expect(response.headers.get("Content-Range")).toBe("bytes 0-1023/1000000");
  });

  it("returns 206 for HEAD request with byte range", async () => {
    const mockR2Binding = {
      get: vi.fn().mockResolvedValue({
        size: 500000,
        range: { offset: 100, length: 200 },
        httpMetadata: { contentType: "video/mp4" },
        httpEtag: '"mock-etag"',
      }),
    };

    const env = {
      R2_PUBLIC_BUCKET: mockR2Binding,
    } as unknown as Cloudflare.Env;

    const request = new Request("https://media.boutq.store/brands/brand-1/hero/sample.mp4", {
      method: "HEAD",
      headers: {
        Range: "bytes=100-299",
      },
    });

    const response = await handleR2MediaRequest(request, env);
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Length")).toBe("200");
    expect(response.headers.get("Content-Range")).toBe("bytes 100-299/500000");
  });
});
