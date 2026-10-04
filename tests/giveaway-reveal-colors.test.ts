import { describe, expect, it } from "vitest";
import { stageColors } from "../src/features/giveaways/lib/reveal-colors";

describe("the stage colours", () => {
  it("uses the store's colour with white text when it is dark", () => {
    expect(stageColors("#330a0a")).toEqual({ background: "#330a0a", foreground: "white" });
    expect(stageColors("#000")).toEqual({ background: "#000", foreground: "white" });
    expect(stageColors("#1e3a8a")?.foreground).toBe("white");
  });

  it("uses black text when the store's colour is light", () => {
    expect(stageColors("#ffffff")?.foreground).toBe("black");
    expect(stageColors("#fde7c9")?.foreground).toBe("black");
    expect(stageColors("#FACC15")?.foreground).toBe("black");
  });

  it("reads three-digit colours and ignores surrounding space and case", () => {
    expect(stageColors(" #FFF ")).toEqual({ background: "#FFF", foreground: "black" });
    expect(stageColors("#abc")?.background).toBe("#abc");
  });

  it("returns nothing for a missing or unreadable colour, so the theme's own is used", () => {
    expect(stageColors(null)).toBeNull();
    expect(stageColors(undefined)).toBeNull();
    expect(stageColors("")).toBeNull();
    expect(stageColors("maroon")).toBeNull();
    expect(stageColors("#12")).toBeNull();
    expect(stageColors("#12345g")).toBeNull();
    expect(stageColors("rgb(0,0,0)")).toBeNull();
  });
});
