import type { Ctx } from "../../src/addons/post-kit/lib/types";

export type CanvasCall = { name: string; args: unknown[]; state: Record<string, unknown> };

/**
 * A canvas context that keeps what it was asked to draw: every call, with the colours and font in
 * force at the time. A word is measured at half its font size a letter. jsdom draws nothing, so a
 * drawing is tested by what it asked for.
 */
export function canvasRecorder() {
  const calls: CanvasCall[] = [];
  const state: Record<string, unknown> = { font: "400 40px sans-serif" };
  const ctx = new Proxy(state, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === "measureText") {
        return (text: string) => {
          const size = parseFloat(/([\d.]+)px/.exec(String(target.font))?.[1] ?? "40");
          return { width: text.length * size * 0.5 };
        };
      }
      if (key === "createPattern") return () => ({});
      return (...args: unknown[]) => {
        calls.push({ name: key, args, state: { ...target } });
      };
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  }) as unknown as Ctx;
  const texts = () => calls.filter((c) => c.name === "fillText").map((c) => String(c.args[0]));
  return { ctx, calls, texts };
}
