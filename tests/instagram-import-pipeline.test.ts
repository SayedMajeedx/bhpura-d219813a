import { describe, expect, it, vi } from "vitest";
import type { InstagramPostPreview, InstagramProductDraft } from "../src/lib/instagram-ai-importer";
import { ImportCancelled, runChunked } from "../src/features/instagram-import/lib/chunked";
import {
  ANALYZE_BATCH_POSTS,
  REHOST_BATCH_POSTS,
  emptyDraftFor,
  postWithFailedImages,
  runImportPipeline,
  scrapeTimeoutMs,
  type ImportApi,
} from "../src/features/instagram-import/lib/run-import";

// The importer used to copy every picture and ask the AI about every post in one request each, so
// one failure lost the run and 99 captions in one AI answer could be cut off. It now works in small
// batches, a few at a time, with retries, real progress and a cancel.

const noWait = async () => undefined;

describe("runChunked", () => {
  it("splits in order, keeps the order of the results, and reports progress up to the total", async () => {
    const progress: Array<[number, number]> = [];
    const { results, failures } = await runChunked([1, 2, 3, 4, 5, 6, 7], {
      size: 3,
      concurrency: 2,
      sleep: noWait,
      worker: async (batch) => batch.map((n) => n * 10),
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(results).toEqual([[10, 20, 30], [40, 50, 60], [70]]);
    expect(failures).toEqual([]);
    expect(progress[0]).toEqual([0, 7]);
    expect(progress.at(-1)).toEqual([7, 7]);
    expect(progress.map(([done]) => done)).toEqual(
      [...progress.map(([done]) => done)].sort((a, b) => a - b),
    );
  });

  it("never runs more batches at once than asked", async () => {
    let running = 0;
    let most = 0;
    await runChunked(
      Array.from({ length: 20 }, (_, i) => i),
      {
        size: 2,
        concurrency: 3,
        sleep: noWait,
        worker: async () => {
          running++;
          most = Math.max(most, running);
          await new Promise((resolve) => setTimeout(resolve, 2));
          running--;
        },
      },
    );
    expect(most).toBe(3);
  });

  it("retries a failing batch with a growing wait, then succeeds", async () => {
    const waits: number[] = [];
    let calls = 0;
    const { results, failures } = await runChunked(["a"], {
      size: 1,
      concurrency: 1,
      retries: 2,
      backoffMs: [100, 300],
      sleep: async (ms) => void waits.push(ms),
      worker: async () => {
        if (++calls < 3) throw new Error("busy");
        return "ok";
      },
    });
    expect(results).toEqual(["ok"]);
    expect(failures).toEqual([]);
    expect(waits).toEqual([100, 300]);
  });

  it("gives up on a batch that keeps failing, reports it, and keeps the rest", async () => {
    const { results, failures } = await runChunked([1, 2, 3, 4], {
      size: 2,
      concurrency: 1,
      retries: 1,
      sleep: noWait,
      worker: async (batch) => {
        if (batch[0] === 1) throw new Error("always");
        return batch;
      },
    });
    expect(results).toEqual([undefined, [3, 4]]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ index: 0, items: [1, 2] });
    expect((failures[0].error as Error).message).toBe("always");
  });

  it("stops between batches when cancelled, and does not retry a cancel", async () => {
    const controller = new AbortController();
    const worker = vi.fn(async (batch: number[]) => {
      if (batch[0] === 3) controller.abort();
      return batch;
    });
    await expect(
      runChunked([1, 2, 3, 4, 5, 6], {
        size: 2,
        concurrency: 1,
        signal: controller.signal,
        sleep: noWait,
        worker,
      }),
    ).rejects.toBeInstanceOf(ImportCancelled);
    expect(worker).toHaveBeenCalledTimes(2);
  });
});

const post = (n: number): InstagramPostPreview => ({
  id: `p${n}`,
  url: `https://instagram.com/p/p${n}/`,
  images: [{ url: `i${n}.jpg`, r2Url: null, isCover: true, status: "pending" }],
  coverImageUrl: "",
  caption: `caption ${n}`,
  isSoldOut: false,
  date: "2026-10-01",
  postType: "image",
});

const hosted = (p: InstagramPostPreview): InstagramPostPreview => ({
  ...p,
  images: p.images.map((i) => ({ ...i, r2Url: `r2/${i.url}`, status: "success" as const })),
  coverImageUrl: `r2/${p.images[0].url}`,
});

const draftFor = (p: InstagramPostPreview): InstagramProductDraft => ({
  ...emptyDraftFor(p),
  title: `title ${p.id}`,
  price: 20,
  issues: [],
});

function makeApi(count: number, over: Partial<ImportApi> = {}) {
  const posts = Array.from({ length: count }, (_, i) => post(i));
  const calls = { rehost: [] as number[], analyze: [] as number[], polls: 0 };
  let analyzing = 0;
  let mostAnalyzing = 0;
  const api: ImportApi = {
    fetchInstagramPosts: async () => ({ runId: "run", datasetId: "ds" }),
    checkScraperStatus: async () => {
      calls.polls++;
      return { status: calls.polls < 3 ? "RUNNING" : "SUCCEEDED" };
    },
    fetchScraperDataset: async () => posts,
    batchRehostAllMedia: async ({ data }) => {
      calls.rehost.push(data.posts.length);
      return { posts: data.posts.map(hosted) };
    },
    batchParseCaptionsWithAI: async ({ data }) => {
      analyzing++;
      mostAnalyzing = Math.max(mostAnalyzing, analyzing);
      calls.analyze.push(data.posts.length);
      await new Promise((resolve) => setTimeout(resolve, 1));
      analyzing--;
      return { drafts: data.posts.map(draftFor) };
    },
    ...over,
  };
  return { api, posts, calls, mostAnalyzing: () => mostAnalyzing };
}

const baseInput = (api: ImportApi) => ({
  username: "abaya.zh",
  urls: [] as string[],
  limit: 100,
  brandId: "brand-1",
  isAr: false,
  api,
  sleep: noWait,
  onStep: () => undefined,
  onStatus: () => undefined,
});

describe("runImportPipeline", () => {
  it("takes 99 posts through in small batches and returns 99 drafts in order", async () => {
    const { api, calls, mostAnalyzing } = makeApi(99);
    const steps: string[] = [];
    const percents: number[] = [];
    const outcome = await runImportPipeline({
      ...baseInput(api),
      onStep: (step) => steps.push(step),
      onStatus: (_message, percent) => percents.push(percent),
    });
    expect(outcome.drafts).toHaveLength(99);
    expect(outcome.drafts.map((d) => d.id)).toEqual(Array.from({ length: 99 }, (_, i) => `p${i}`));
    expect(outcome.rehostFailedPosts).toBe(0);
    expect(outcome.analysisFailedPosts).toBe(0);
    // 17 requests of at most 6 posts for each step (never one request for all 99).
    expect(calls.rehost).toHaveLength(Math.ceil(99 / REHOST_BATCH_POSTS));
    expect(Math.max(...calls.rehost)).toBe(REHOST_BATCH_POSTS);
    expect(calls.analyze).toHaveLength(Math.ceil(99 / ANALYZE_BATCH_POSTS));
    expect(Math.max(...calls.analyze)).toBe(ANALYZE_BATCH_POSTS);
    // The AI is asked one request at a time.
    expect(mostAnalyzing()).toBe(1);
    expect([...new Set(steps)]).toEqual(["scraping", "rehosting", "analyzing"]);
    expect(percents.at(-1)).toBe(100);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(calls.polls).toBe(3);
  });

  it("waits out a busy moment of the scraper, but stops when it says the run failed", async () => {
    let n = 0;
    const flaky = makeApi(2, {
      checkScraperStatus: async () => {
        if (++n === 1) throw new Error("Apify rate limit, wait a little");
        return { status: "SUCCEEDED" };
      },
    });
    expect((await runImportPipeline(baseInput(flaky.api))).drafts).toHaveLength(2);

    const failed = makeApi(2, {
      checkScraperStatus: async () => {
        throw new Error("فشلت عملية سحب منشورات إنستغرام بحالة: FAILED");
      },
    });
    await expect(runImportPipeline(baseInput(failed.api))).rejects.toThrow(/Scraping failed/);

    let consecutive = 0;
    const down = makeApi(2, {
      checkScraperStatus: async () => {
        consecutive++;
        throw new Error("network down");
      },
    });
    await expect(runImportPipeline(baseInput(down.api))).rejects.toThrow(/Scraping failed/);
    expect(consecutive).toBe(4);
  });

  it("explains an empty account and a scraper that takes too long", async () => {
    await expect(runImportPipeline(baseInput(makeApi(0).api))).rejects.toThrow(
      /No public posts found/,
    );
    const slow = makeApi(2, { checkScraperStatus: async () => ({ status: "RUNNING" }) });
    await expect(runImportPipeline({ ...baseInput(slow.api), limit: 1 })).rejects.toThrow(
      /took too long/,
    );
    expect(scrapeTimeoutMs(1)).toBe(3 * 60_000 + 4000);
    expect(scrapeTimeoutMs(100)).toBe(9 * 60_000 + 40_000);
    expect(scrapeTimeoutMs(10_000)).toBe(10 * 60_000);
  });

  it("keeps going when pictures cannot be copied, marking those posts for a retry in review", async () => {
    let call = 0;
    const { api } = makeApi(14, {
      batchRehostAllMedia: async ({ data }) => {
        // The second batch of six fails on every attempt.
        if (data.posts[0].id === "p6") {
          call++;
          throw new Error("R2 down");
        }
        return { posts: data.posts.map(hosted) };
      },
    });
    const outcome = await runImportPipeline(baseInput(api));
    expect(call).toBe(3); // the first try and two retries
    expect(outcome.rehostFailedPosts).toBe(6);
    expect(outcome.drafts).toHaveLength(14);
    const failed = outcome.drafts.find((d) => d.id === "p7")!;
    expect(failed.images[0]).toMatchObject({ status: "failed", selected: false, r2Url: null });
    expect(failed.imageUploadStatus).toBe("failed");
    expect(outcome.drafts.find((d) => d.id === "p0")!.imageUploadStatus).toBe("all_success");
  });

  it("leaves a post the AI could not read empty for the merchant, and keeps the others", async () => {
    const { api } = makeApi(14, {
      batchParseCaptionsWithAI: async ({ data }) => {
        if (data.posts[0].id === "p6") throw new Error("Gemini down");
        return { drafts: data.posts.map(draftFor) };
      },
    });
    const outcome = await runImportPipeline(baseInput(api));
    expect(outcome.analysisFailedPosts).toBe(6);
    expect(outcome.drafts).toHaveLength(14);
    const empty = outcome.drafts.find((d) => d.id === "p8")!;
    expect(empty).toMatchObject({ title: "", price: null });
    expect(empty.issues).toEqual(["missing_price", "analysis_failed"]);
    expect(empty.images[0].r2Url).toBe("r2/i8.jpg");
    expect(outcome.drafts.find((d) => d.id === "p0")!.title).toBe("title p0");
  });

  it("can be cancelled between batches", async () => {
    const controller = new AbortController();
    const { api } = makeApi(30, {
      batchRehostAllMedia: async ({ data }) => {
        controller.abort();
        return { posts: data.posts.map(hosted) };
      },
    });
    await expect(
      runImportPipeline({ ...baseInput(api), signal: controller.signal }),
    ).rejects.toBeInstanceOf(ImportCancelled);
  });

  it("speaks Arabic in its progress when asked to", async () => {
    const { api } = makeApi(3);
    const messages: string[] = [];
    await runImportPipeline({
      ...baseInput(api),
      isAr: true,
      onStatus: (message) => messages.push(message),
    });
    expect(messages.some((m) => m.includes("نسخ الصور"))).toBe(true);
    expect(messages.some((m) => m.includes("بالذكاء الاصطناعي"))).toBe(true);
  });
});

describe("the fallbacks", () => {
  it("marks every picture that is not safely copied as failed, and keeps the ones that are", () => {
    const mixed: InstagramPostPreview = {
      ...post(1),
      images: [
        { url: "ok.jpg", r2Url: "r2/ok.jpg", isCover: false, status: "success", selected: true },
        { url: "bad.jpg", r2Url: null, isCover: true, status: "pending" },
      ],
    };
    const result = postWithFailedImages(mixed, "retry");
    expect(result.images[0].status).toBe("success");
    expect(result.images[1]).toMatchObject({
      status: "failed",
      errorMessage: "retry",
      selected: false,
    });
    expect(result.coverImageUrl).toBe("r2/ok.jpg");
    expect(emptyDraftFor(result).imageUploadStatus).toBe("partial_success");
  });
});
