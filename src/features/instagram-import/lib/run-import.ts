import type { InstagramPostPreview, InstagramProductDraft } from "@/lib/instagram-ai-importer";
import type { MergeableDraft } from "./merge-drafts";
import { ImportCancelled, runChunked } from "./chunked";

/**
 * The importer's whole pipeline, run from the browser in small batches: pull the posts, copy their
 * pictures to our storage, read their captions with the AI. Doing it in batches (instead of one
 * request for every post) keeps one slow or failing step from losing the run, shows real progress,
 * lets the merchant cancel, and keeps each AI request small enough that its answer is never cut off.
 */

export type ImportStep = "scraping" | "rehosting" | "analyzing";

/** The server calls the pipeline makes; passed in so the pipeline can be tested without a network. */
export type ImportApi = {
  fetchInstagramPosts: (args: {
    data: { username?: string; urls?: string[]; range: number };
  }) => Promise<{ runId: string; datasetId: string }>;
  checkScraperStatus: (args: { data: { runId: string } }) => Promise<{ status: string }>;
  fetchScraperDataset: (args: { data: { datasetId: string } }) => Promise<InstagramPostPreview[]>;
  batchRehostAllMedia: (args: {
    data: { brandId: string; posts: InstagramPostPreview[] };
  }) => Promise<{ posts: InstagramPostPreview[] }>;
  batchParseCaptionsWithAI: (args: {
    data: { posts: InstagramPostPreview[]; brandId: string };
  }) => Promise<{ drafts: InstagramProductDraft[] }>;
};

export type ImportInput = {
  username?: string;
  urls: string[];
  limit: number;
  brandId: string;
  isAr: boolean;
  api: ImportApi;
  signal?: AbortSignal;
  onStep: (step: ImportStep) => void;
  onStatus: (message: string, percent: number) => void;
  /** For tests. */
  sleep?: (ms: number) => Promise<void>;
};

export type ImportOutcome = {
  drafts: MergeableDraft[];
  /** Posts whose pictures could not be copied (they can be retried picture by picture in review). */
  rehostFailedPosts: number;
  /** Posts the AI could not read (their details are left empty for the merchant). */
  analysisFailedPosts: number;
};

export const REHOST_BATCH_POSTS = 6;
export const REHOST_CONCURRENCY = 3;
export const ANALYZE_BATCH_POSTS = 6;
/** The AI's free tier allows about 15 requests a minute: one request at a time. */
export const ANALYZE_CONCURRENCY = 1;
const POLL_MS = 3000;

/** How long to wait for the scraper: three minutes, and a few more seconds for every post asked for. */
export function scrapeTimeoutMs(limit: number): number {
  return Math.min(10 * 60_000, 3 * 60_000 + Math.max(0, limit) * 4000);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A post whose pictures could not be copied: each picture is marked failed, to retry in review. */
export function postWithFailedImages(
  post: InstagramPostPreview,
  message: string,
): InstagramPostPreview {
  const images = post.images ?? [];
  return {
    ...post,
    images: images.map((image) =>
      image.r2Url && image.status === "success"
        ? image
        : {
            ...image,
            r2Url: null,
            status: "failed" as const,
            selected: false,
            errorMessage: message,
          },
    ),
    coverImageUrl: images.find((image) => image.r2Url && image.status === "success")?.r2Url ?? "",
  };
}

/** A draft for a post the AI could not read: nothing guessed, everything left for the merchant. */
export function emptyDraftFor(post: InstagramPostPreview): InstagramProductDraft {
  const images = post.images ?? [];
  const good = images.filter((image) => image.status === "success" && image.r2Url);
  return {
    id: post.id,
    url: post.url,
    isSoldOut: post.isSoldOut,
    isVideo: post.isVideo,
    postType: post.postType,
    images,
    coverImageUrl: post.coverImageUrl ?? "",
    imageUploadStatus:
      good.length === images.length && good.length > 0
        ? "all_success"
        : good.length > 0
          ? "partial_success"
          : "failed",
    title: "",
    price: null,
    description: "",
    sizes: [],
    colors: [],
    category: null,
    fieldConfidence: { name: 0, price: 0, description: 0, sizes: 0 },
    fieldSources: { name: "ai", price: "ai", description: "ai", sizes: "ai", category: "ai" },
    issues: ["missing_price", "analysis_failed"],
  };
}

const fatalScrapeMessage = /فشلت عملية سحب|FAILED|ABORTED|TIMED-OUT/i;

async function waitForScraper(input: ImportInput, runId: string): Promise<void> {
  const { api, signal, isAr, onStatus } = input;
  const sleep = input.sleep ?? defaultSleep;
  const deadline = scrapeTimeoutMs(input.limit);
  let waited = 0;
  let transientErrors = 0;
  while (waited < deadline) {
    if (signal?.aborted) throw new ImportCancelled();
    await sleep(POLL_MS);
    waited += POLL_MS;
    try {
      const check = await api.checkScraperStatus({ data: { runId } });
      transientErrors = 0;
      if (check.status === "SUCCEEDED") return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A scraper that failed ends the run; a busy moment (rate limit, network) is waited out.
      if (fatalScrapeMessage.test(message) || ++transientErrors > 3) {
        throw new Error(
          isAr
            ? `فشلت عملية السحب. تأكد من أن الحساب عام (Public). ${message}`
            : `Scraping failed. Make sure the account is public. ${message}`,
        );
      }
    }
    onStatus(
      isAr
        ? `جاري سحب منشورات الحساب... (${Math.round(waited / 1000)} ثانية)`
        : `Pulling the account's posts... (${Math.round(waited / 1000)} s)`,
      Math.min(30, 12 + Math.floor((waited / deadline) * 18)),
    );
  }
  throw new Error(
    isAr
      ? "استغرق سحب المنشورات وقتاً طويلاً. جرّب عدداً أقل من المنشورات أو تأكد من أن الحساب عام."
      : "Pulling the posts took too long. Try fewer posts and make sure the account is public.",
  );
}

export async function runImportPipeline(input: ImportInput): Promise<ImportOutcome> {
  const { api, isAr, brandId, signal, onStep, onStatus } = input;
  const sleep = input.sleep ?? defaultSleep;

  // 1. Pull the posts.
  onStep("scraping");
  onStatus(
    isAr
      ? `بدء سحب المنشورات (المطلوب: ${input.limit})...`
      : `Starting (asking for ${input.limit} posts)...`,
    8,
  );
  const run = await api.fetchInstagramPosts({
    data: {
      username: input.username || undefined,
      urls: input.urls.length > 0 ? input.urls : undefined,
      range: input.limit,
    },
  });
  await waitForScraper(input, run.runId);
  onStatus(isAr ? "قراءة المنشورات..." : "Reading the posts...", 32);
  const posts = await api.fetchScraperDataset({ data: { datasetId: run.datasetId } });
  if (posts.length === 0) {
    throw new Error(
      isAr
        ? "لم يتم العثور على أي منشورات عامة في هذا الحساب."
        : "No public posts found for this account.",
    );
  }

  // 2. Copy the pictures to our storage, a few posts at a time.
  onStep("rehosting");
  const rehosted = await runChunked(posts, {
    size: REHOST_BATCH_POSTS,
    concurrency: REHOST_CONCURRENCY,
    signal,
    sleep,
    worker: (batch) => api.batchRehostAllMedia({ data: { brandId, posts: batch } }),
    onProgress: (done, total) =>
      onStatus(
        isAr
          ? `نسخ الصور إلى المخزن: ${done} من ${total} منشور`
          : `Copying pictures: ${done} of ${total} posts`,
        35 + Math.round((done / total) * 35),
      ),
  });
  let rehostFailedPosts = 0;
  const hosted: InstagramPostPreview[] = [];
  rehosted.results.forEach((result, index) => {
    const batch = posts.slice(index * REHOST_BATCH_POSTS, (index + 1) * REHOST_BATCH_POSTS);
    if (result) {
      hosted.push(...result.posts);
    } else {
      rehostFailedPosts += batch.length;
      const message = isAr ? "تعذر نسخ الصورة، أعد المحاولة" : "Could not copy the picture, retry";
      hosted.push(...batch.map((post) => postWithFailedImages(post, message)));
    }
  });

  // 3. Read the captions with the AI, a few posts at a time, one request after another.
  onStep("analyzing");
  const analyzed = await runChunked(hosted, {
    size: ANALYZE_BATCH_POSTS,
    concurrency: ANALYZE_CONCURRENCY,
    retries: 2,
    backoffMs: [4000, 12000],
    signal,
    sleep,
    worker: (batch) => api.batchParseCaptionsWithAI({ data: { posts: batch, brandId } }),
    onProgress: (done, total) =>
      onStatus(
        isAr
          ? `قراءة الأسماء والأسعار بالذكاء الاصطناعي: ${done} من ${total}`
          : `Reading names and prices with AI: ${done} of ${total}`,
        70 + Math.round((done / total) * 28),
      ),
  });
  let analysisFailedPosts = 0;
  const drafts: InstagramProductDraft[] = [];
  analyzed.results.forEach((result, index) => {
    const batch = hosted.slice(index * ANALYZE_BATCH_POSTS, (index + 1) * ANALYZE_BATCH_POSTS);
    if (result) {
      drafts.push(...result.drafts);
    } else {
      analysisFailedPosts += batch.length;
      drafts.push(...batch.map(emptyDraftFor));
    }
  });

  // Each draft remembers when and with what words its post was written, to suggest merges.
  const source = new Map(hosted.map((post) => [post.id, post]));
  const withSource = drafts.map((draft): MergeableDraft => {
    const post = source.get(draft.id);
    return { ...draft, postedAt: post?.postedAt, caption: post?.caption?.slice(0, 600) };
  });

  onStatus(isAr ? "تم تجهيز المسودات" : "Drafts are ready", 100);
  return { drafts: withSource, rehostFailedPosts, analysisFailedPosts };
}
