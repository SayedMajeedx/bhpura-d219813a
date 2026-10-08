import {
  batchParseCaptionsWithAI,
  batchRehostAllMedia,
  checkScraperStatus,
  fetchInstagramPosts,
  fetchScraperDataset,
} from "@/lib/instagram-ai-importer";
import type { ImportApi } from "./lib/run-import";

/** The importer's server calls, as the browser pipeline uses them. */
export const importApi: ImportApi = {
  fetchInstagramPosts,
  checkScraperStatus,
  fetchScraperDataset,
  batchRehostAllMedia,
  batchParseCaptionsWithAI,
};
