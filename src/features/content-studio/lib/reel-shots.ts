/** A piece of the product's media as the studio lists it. */
type MediaItem = { url: string; type: "image" | "video" };

/** The most photos a cut runs through. */
export const MAX_REEL_SHOTS = 4;

/**
 * The photos Reel Cut cuts between: the one the merchant chose first, then
 * the product's other photos in their order (videos are left out: the cut
 * holds stills), at most four. A chosen video leaves the others in order.
 */
export function reelShotUrls(
  media: readonly MediaItem[],
  chosenUrl: string | null,
  max = MAX_REEL_SHOTS,
): string[] {
  const photos = media.filter((item) => item.type === "image").map((item) => item.url);
  const ordered =
    chosenUrl && photos.includes(chosenUrl)
      ? [chosenUrl, ...photos.filter((url) => url !== chosenUrl)]
      : photos;
  return [...new Set(ordered)].slice(0, max);
}
