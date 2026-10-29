import { describe, expect, it } from "vitest";
import { heroButtonStyle } from "../src/lib/hero-headline";
import { storyBackground } from "../src/lib/brand-templates/brand-story";

describe("a slide's button colours", () => {
  it("keeps the store's primary colour until the slide chooses", () => {
    expect(heroButtonStyle({})).toBeUndefined();
    expect(heroButtonStyle({ button_color: "", button_text_color: "" })).toBeUndefined();
    expect(heroButtonStyle({ button_color: "red" })).toBeUndefined();
  });

  it("takes the chosen colours and picks readable text for a lone background", () => {
    expect(heroButtonStyle({ button_color: "#ffffff" })).toEqual({
      backgroundColor: "#ffffff",
      color: "#111111",
    });
    expect(heroButtonStyle({ button_color: "#4a0a0a" })).toEqual({
      backgroundColor: "#4a0a0a",
      color: "#ffffff",
    });
    expect(heroButtonStyle({ button_color: "#4a0a0a", button_text_color: "#ffd700" })).toEqual({
      backgroundColor: "#4a0a0a",
      color: "#ffd700",
    });
  });
});

describe("the brand story's background", () => {
  it("is the store's colour only when it is a valid hex", () => {
    expect(storyBackground({ story_background: " #112233 " })).toBe("#112233");
    expect(storyBackground({ story_background: "blue" })).toBeNull();
    expect(storyBackground({ story_points: [] })).toBeNull();
    expect(storyBackground(null)).toBeNull();
  });
});
