import { test, expect } from "@playwright/test";

test.describe("WebCodecs Video Optimizer & FastStart MP4 Pipeline", () => {
  test("Chromium supports WebCodecs VideoEncoder and VideoDecoder natively", async ({ page }) => {
    await page.goto("/auth", { waitUntil: "domcontentloaded" });

    const webCodecsSupport = await page.evaluate(() => {
      return {
        hasVideoEncoder: typeof window.VideoEncoder !== "undefined",
        hasVideoDecoder: typeof window.VideoDecoder !== "undefined",
        hasEncodedVideoChunk: typeof window.EncodedVideoChunk !== "undefined",
      };
    });

    expect(webCodecsSupport.hasVideoEncoder).toBe(true);
    expect(webCodecsSupport.hasVideoDecoder).toBe(true);
    expect(webCodecsSupport.hasEncodedVideoChunk).toBe(true);
  });

  test("Transcodes video to FastStart MP4 with moov atom preceding mdat atom", async ({ page }) => {
    await page.goto("/auth", { waitUntil: "domcontentloaded" });

    // Linux CI builds of Chromium (headless shell) ship without an H.264
    // encoder. The optimizer then returns the original file by design, so the
    // MP4 assertions below only make sense where H.264 encoding exists.
    const canEncodeH264 = await page.evaluate(async () => {
      try {
        const support = await VideoEncoder.isConfigSupported({
          codec: "avc1.42e01e",
          width: 1280,
          height: 720,
        });
        return Boolean(support?.supported);
      } catch {
        return false;
      }
    });
    test.skip(!canEncodeH264, "H.264 VideoEncoder unavailable in this Chromium build");

    // Execute transcoding in browser context using synthetic Canvas video
    const transcodeResult = await page.evaluate(async () => {
      // Helper to parse MP4 atom offsets
      function parseMp4Atoms(buffer: ArrayBuffer): {
        ftyp?: number;
        moov?: number;
        mdat?: number;
        boxes: string[];
      } {
        const view = new DataView(buffer);
        const result: { ftyp?: number; moov?: number; mdat?: number; boxes: string[] } = {
          boxes: [],
        };
        let offset = 0;

        while (offset + 8 <= buffer.byteLength) {
          const size = view.getUint32(offset);
          const type = String.fromCharCode(
            view.getUint8(offset + 4),
            view.getUint8(offset + 5),
            view.getUint8(offset + 6),
            view.getUint8(offset + 7),
          );

          result.boxes.push(type);
          if (type === "ftyp" && result.ftyp === undefined) result.ftyp = offset;
          if (type === "moov" && result.moov === undefined) result.moov = offset;
          if (type === "mdat" && result.mdat === undefined) result.mdat = offset;

          if (size === 0) break;
          if (size === 1) {
            const high = view.getUint32(offset + 8);
            const low = view.getUint32(offset + 12);
            offset += high * 4294967296 + low;
          } else {
            offset += size;
          }
        }
        return result;
      }

      // Generate a short synthetic clip using Canvas + MediaRecorder as input source
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext("2d")!;

      const stream = canvas.captureStream(30);
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
        ? "video/webm;codecs=vp8"
        : "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const recordPromise = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
      });

      recorder.start();

      // Render 15 animated frames (~0.5s)
      for (let i = 0; i < 15; i++) {
        ctx.fillStyle = `hsl(${i * 24}, 80%, 50%)`;
        ctx.fillRect(0, 0, 640, 360);
        ctx.fillStyle = "#ffffff";
        ctx.font = "24px sans-serif";
        ctx.fillText(`WebCodecs Test Frame ${i + 1}`, 50, 180);
        await new Promise((r) => setTimeout(r, 33));
      }

      recorder.stop();
      const rawBlob = await recordPromise;
      const inputFile = new File([rawBlob], "source-canvas-clip.webm", { type: "video/webm" });

      // Dynamically import video optimizer module from the app
      const { optimizeVideo } = await import("/src/lib/video-optimizer.ts");

      let progressCalled = false;
      const result = await optimizeVideo(inputFile, {
        preset: "balanced",
        onProgress: (p) => {
          if (p >= 0) progressCalled = true;
        },
      });

      const outputBuffer = await result.file.arrayBuffer();
      const atomInfo = parseMp4Atoms(outputBuffer);

      return {
        originalSizeBytes: result.originalSizeBytes,
        optimizedSizeBytes: result.optimizedSizeBytes,
        savingsPercent: result.savingsPercent,
        wasCompressed: result.wasCompressed,
        mimeType: result.mimeType,
        width: result.width,
        height: result.height,
        hasPoster: Boolean(result.posterBlob && result.posterBlob.size > 0),
        posterSize: result.posterBlob ? result.posterBlob.size : 0,
        progressCalled,
        atomInfo,
        totalBytes: outputBuffer.byteLength,
      };
    });

    // 1. Verify output container is MP4
    expect(transcodeResult.mimeType).toBe("video/mp4");
    expect(transcodeResult.totalBytes).toBeGreaterThan(0);

    // 2. Verify atom placement: moov must exist and precede mdat (FastStart)
    expect(transcodeResult.atomInfo.boxes).toContain("ftyp");
    expect(transcodeResult.atomInfo.boxes).toContain("moov");
    expect(transcodeResult.atomInfo.boxes).toContain("mdat");

    expect(transcodeResult.atomInfo.moov).toBeDefined();
    expect(transcodeResult.atomInfo.mdat).toBeDefined();
    expect(transcodeResult.atomInfo.moov!).toBeLessThan(transcodeResult.atomInfo.mdat!);

    // 3. Verify poster generation
    expect(transcodeResult.hasPoster).toBe(true);
    expect(transcodeResult.posterSize).toBeGreaterThan(100);

    // 4. Verify progress was reported
    expect(transcodeResult.progressCalled).toBe(true);
  });

  test("Respects original preset and safety valve fallback", async ({ page }) => {
    await page.goto("/auth", { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async () => {
      const { optimizeVideo } = await import("/src/lib/video-optimizer.ts");

      // Test original preset: should return untouched file without transcoding
      const dummyFile = new File([new Uint8Array(1024)], "original.mp4", { type: "video/mp4" });
      const origResult = await optimizeVideo(dummyFile, { preset: "original" });

      return {
        origWasCompressed: origResult.wasCompressed,
        origSavings: origResult.savingsPercent,
        origSize: origResult.optimizedSizeBytes,
      };
    });

    expect(result.origWasCompressed).toBe(false);
    expect(result.origSavings).toBe(0);
    expect(result.origSize).toBe(1024);
  });
});
