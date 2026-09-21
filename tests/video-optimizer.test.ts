import { describe, expect, it } from "vitest";
import {
  calculateTargetDimensions,
  getStoredVideoPreset,
  setStoredVideoPreset,
  VIDEO_PRESETS,
  MAX_VIDEO_INPUT_SIZE,
  isWebCodecsSupported,
  optimizeVideo,
} from "../src/lib/video-optimizer";

describe("calculateTargetDimensions", () => {
  it("scales 1080p landscape down to 720p with even dimensions when capped to 1280", () => {
    const { width, height } = calculateTargetDimensions(1920, 1080, 1280);
    expect(width).toBe(1280);
    expect(height).toBe(720);
    expect(width % 2).toBe(0);
    expect(height % 2).toBe(0);
  });

  it("scales 1080p portrait down to 720x1280 with even dimensions when capped to 1280", () => {
    const { width, height } = calculateTargetDimensions(1080, 1920, 1280);
    expect(width).toBe(720);
    expect(height).toBe(1280);
    expect(width % 2).toBe(0);
    expect(height % 2).toBe(0);
  });

  it("scales 4K down to max 1920 (1080p) maintaining aspect ratio", () => {
    const { width, height } = calculateTargetDimensions(3840, 2160, 1920);
    expect(width).toBe(1920);
    expect(height).toBe(1080);
    expect(width % 2).toBe(0);
    expect(height % 2).toBe(0);
  });

  it("leaves smaller resolutions unscaled while ensuring even dimensions", () => {
    const { width, height } = calculateTargetDimensions(640, 480, 1280);
    expect(width).toBe(640);
    expect(height).toBe(480);
  });

  it("converts odd dimensions to even numbers for codec compliance", () => {
    const { width, height } = calculateTargetDimensions(641, 481, 1280);
    expect(width % 2).toBe(0);
    expect(height % 2).toBe(0);
    expect(width).toBe(640);
    expect(height).toBe(480);
  });

  it("handles empty or degenerate source dimensions safely", () => {
    const { width, height } = calculateTargetDimensions(0, 0, 1280);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    expect(width % 2).toBe(0);
    expect(height % 2).toBe(0);
  });
});

describe("VIDEO_PRESETS", () => {
  it("defines high, balanced, and original presets with proper configurations", () => {
    expect(VIDEO_PRESETS.high).toBeDefined();
    expect(VIDEO_PRESETS.balanced).toBeDefined();
    expect(VIDEO_PRESETS.original).toBeDefined();

    expect(VIDEO_PRESETS.high.maxDimension).toBe(1920);
    expect(VIDEO_PRESETS.high.targetBitrate).toBe(2_500_000);
    expect(VIDEO_PRESETS.high.audioBitrate).toBe(128_000);
    expect(VIDEO_PRESETS.high.fps).toBe(30);

    expect(VIDEO_PRESETS.balanced.maxDimension).toBe(1280);
    expect(VIDEO_PRESETS.balanced.targetBitrate).toBe(1_500_000);
    expect(VIDEO_PRESETS.balanced.audioBitrate).toBe(96_000);

    expect(VIDEO_PRESETS.original.maxDimension).toBe(Infinity);
  });

  it("provides bilingual labels for all presets", () => {
    for (const key of ["high", "balanced", "original"] as const) {
      const preset = VIDEO_PRESETS[key];
      expect(preset.labelAr).toBeTruthy();
      expect(preset.labelEn).toBeTruthy();
      expect(preset.descriptionAr).toBeTruthy();
      expect(preset.descriptionEn).toBeTruthy();
    }
  });
});

describe("Preset Storage", () => {
  it("returns default preset 'high' when nothing stored or brandId undefined", () => {
    expect(getStoredVideoPreset()).toBe("high");
    expect(getStoredVideoPreset("test-brand")).toBe("high");
  });

  it("persists and reads preset per brand", () => {
    setStoredVideoPreset("brand-xyz", "balanced");
    expect(getStoredVideoPreset("brand-xyz")).toBe("balanced");

    setStoredVideoPreset("brand-xyz", "original");
    expect(getStoredVideoPreset("brand-xyz")).toBe("original");
  });
});

describe("optimizeVideo safety guards", () => {
  it("enforces MAX_VIDEO_INPUT_SIZE of 100 MB", async () => {
    const oversizedFile = new File([new Uint8Array(10)], "huge.mp4", { type: "video/mp4" });
    Object.defineProperty(oversizedFile, "size", {
      value: MAX_VIDEO_INPUT_SIZE + 1024,
    });

    await expect(optimizeVideo(oversizedFile)).rejects.toThrow("100");
  });

  it("checks WebCodecs support safely in non-browser environment", async () => {
    const supported = await isWebCodecsSupported();
    expect(typeof supported).toBe("boolean");
  });

  it("safely falls back to untouched original when WebCodecs is unsupported", async () => {
    const sampleFile = new File(["dummy video data"], "sample.mp4", {
      type: "video/mp4",
    });

    const result = await optimizeVideo(sampleFile, { preset: "high" });
    expect(result.wasCompressed).toBe(false);
    expect(result.file).toBe(sampleFile);
    expect(result.originalSizeBytes).toBe(sampleFile.size);
    expect(result.optimizedSizeBytes).toBe(sampleFile.size);
  });

  it("returns original untouched with wasCompressed false when original preset is selected", async () => {
    const sampleFile = new File(["dummy video data"], "sample.mp4", {
      type: "video/mp4",
    });

    const result = await optimizeVideo(sampleFile, { preset: "original" });
    expect(result.wasCompressed).toBe(false);
    expect(result.preset).toBe("original");
  });
});

describe("FastStart MP4 Box Structure", () => {
  function parseMp4Atoms(buffer: ArrayBuffer): {
    ftyp?: number;
    moov?: number;
    mdat?: number;
    isFastStart: boolean;
  } {
    const view = new DataView(buffer);
    let ftyp: number | undefined;
    let moov: number | undefined;
    let mdat: number | undefined;
    let offset = 0;

    while (offset + 8 <= buffer.byteLength) {
      const size = view.getUint32(offset);
      const type = String.fromCharCode(
        view.getUint8(offset + 4),
        view.getUint8(offset + 5),
        view.getUint8(offset + 6),
        view.getUint8(offset + 7),
      );

      if (type === "ftyp" && ftyp === undefined) ftyp = offset;
      if (type === "moov" && moov === undefined) moov = offset;
      if (type === "mdat" && mdat === undefined) mdat = offset;

      if (size <= 0) break;
      offset += size;
    }

    const isFastStart = Boolean(moov !== undefined && mdat !== undefined && moov < mdat);
    return { ftyp, moov, mdat, isFastStart };
  }

  function createMockBox(type: string, payloadLength: number): Uint8Array {
    const totalSize = 8 + payloadLength;
    const box = new Uint8Array(totalSize);
    const view = new DataView(box.buffer);
    view.setUint32(0, totalSize);
    for (let i = 0; i < 4; i++) {
      box[4 + i] = type.charCodeAt(i);
    }
    return box;
  }

  it("identifies FastStart layout when moov precedes mdat", () => {
    const ftypBox = createMockBox("ftyp", 16);
    const moovBox = createMockBox("moov", 32);
    const mdatBox = createMockBox("mdat", 64);

    const combined = new Uint8Array(ftypBox.length + moovBox.length + mdatBox.length);
    combined.set(ftypBox, 0);
    combined.set(moovBox, ftypBox.length);
    combined.set(mdatBox, ftypBox.length + moovBox.length);

    const parsed = parseMp4Atoms(combined.buffer);
    expect(parsed.isFastStart).toBe(true);
    expect(parsed.moov!).toBeLessThan(parsed.mdat!);
  });

  it("rejects non-FastStart layout when mdat precedes moov", () => {
    const ftypBox = createMockBox("ftyp", 16);
    const mdatBox = createMockBox("mdat", 64);
    const moovBox = createMockBox("moov", 32);

    const combined = new Uint8Array(ftypBox.length + mdatBox.length + moovBox.length);
    combined.set(ftypBox, 0);
    combined.set(mdatBox, ftypBox.length);
    combined.set(moovBox, ftypBox.length + mdatBox.length);

    const parsed = parseMp4Atoms(combined.buffer);
    expect(parsed.isFastStart).toBe(false);
    expect(parsed.mdat!).toBeLessThan(parsed.moov!);
  });
});
