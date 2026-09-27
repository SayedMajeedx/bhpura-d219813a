/**
 * A product video's exact length in seconds: the element's own duration when
 * it is known, else the MP4 `mvhd` atom read from the file (0 when unknown).
 */
export async function getExactVideoDuration(
  videoElement: HTMLVideoElement,
  url: string,
): Promise<number> {
  // 1. Direct finite duration on element if already fully loaded
  if (videoElement.duration && isFinite(videoElement.duration) && videoElement.duration > 0) {
    return videoElement.duration;
  }

  // 2. Fast MP4 mvhd atom parser directly from file header / body (accurate to milliseconds)
  try {
    const response = await fetch(url);
    const reader = response.body?.getReader();
    if (reader) {
      let totalLen = 0;
      const chunks: Uint8Array[] = [];
      // Read up to 256KB to locate the moov/mvhd atom
      while (totalLen < 256 * 1024) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        totalLen += value.length;

        const merged = new Uint8Array(totalLen);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.length;
        }

        for (let i = 0; i < merged.length - 32; i++) {
          if (
            merged[i] === 0x6d &&
            merged[i + 1] === 0x76 &&
            merged[i + 2] === 0x68 &&
            merged[i + 3] === 0x64
          ) {
            // 'mvhd' atom
            const ver = merged[i + 4];
            const dv = new DataView(merged.buffer, i);
            const timescale = ver === 1 ? dv.getUint32(24) : dv.getUint32(16);
            const dur = ver === 1 ? Number(dv.getBigUint64(28)) : dv.getUint32(20);
            reader.cancel().catch(() => {});
            if (timescale > 0 && dur > 0) {
              const secs = dur / timescale;
              if (isFinite(secs) && secs > 0) return secs;
            }
            break;
          }
        }
      }
    }
  } catch (err) {
    console.warn("Could not parse MP4 mvhd duration via stream", err);
  }

  // 3. If stream reader didn't find mvhd (e.g. moov at end of file), read full arrayBuffer
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const u8 = new Uint8Array(buf);
    for (let i = 0; i < u8.length - 32; i++) {
      if (u8[i] === 0x6d && u8[i + 1] === 0x76 && u8[i + 2] === 0x68 && u8[i + 3] === 0x64) {
        const ver = u8[i + 4];
        const dv = new DataView(buf, i);
        const timescale = ver === 1 ? dv.getUint32(24) : dv.getUint32(16);
        const dur = ver === 1 ? Number(dv.getBigUint64(28)) : dv.getUint32(20);
        if (timescale > 0 && dur > 0) {
          const secs = dur / timescale;
          if (isFinite(secs) && secs > 0) return secs;
        }
        break;
      }
    }
  } catch (err) {
    console.warn("Could not parse MP4 mvhd duration from full buffer", err);
  }

  return 0;
}
