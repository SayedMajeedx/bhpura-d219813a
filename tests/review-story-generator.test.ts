import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const storySource = readFileSync("src/components/reviews/ReviewStoryDialog.tsx", "utf8");
const reviewsPage = readFileSync("src/routes/_authenticated/admin.b.$slug.reviews.tsx", "utf8");

describe("customer review story generator", () => {
  it("exports a full-resolution Instagram story from every review card", () => {
    expect(storySource).toContain("const STORY_WIDTH = 1080");
    expect(storySource).toContain("const STORY_HEIGHT = 1920");
    expect(storySource).toContain('canvasRef.current?.toBlob(resolve, "image/png", 1)');
    expect(reviewsPage).toContain("onCreateStory={() => setStoryReview(review)}");
  });

  it("keeps private order and reward details outside the story renderer", () => {
    const renderer = storySource.slice(
      storySource.indexOf("function drawStory"),
      storySource.indexOf("export function ReviewStoryDialog"),
    );
    expect(renderer).not.toContain("invoice_number");
    expect(renderer).not.toContain("customer_phone");
    expect(renderer).not.toContain("reward_code");
  });

  it("offers three branded templates and privacy controls", () => {
    expect(storySource).toContain('type StoryTemplate = "classic" | "editorial" | "midnight"');
    expect(storySource).toContain("setShowName");
    expect(storySource).toContain("setShowHighlights");
  });
});
