/** A customer-facing field on a product (measurements, notes, uploads...). */
export type CustomField = {
  key: string;
  label_ar: string | null;
  label_en: string | null;
  type: "text" | "number" | "select" | "file";
  options?: string[];
  required?: boolean;
};

/** One gallery item on the product page. */
export type PdpMediaItem = {
  type: "image" | "video";
  url: string;
  stream_uid?: string;
  stream_iframe_url?: string;
  poster_url?: string;
};
