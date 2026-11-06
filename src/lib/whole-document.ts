/**
 * A page is sent only once it is whole. The first render on a freshly started server copy can make
 * React's stream fail ("A previously unvisited boundary must have exactly one root segment") after
 * the head has gone out, and the browser was handed a document with an empty body: a white page
 * with no script to recover it and, in the installed app, no way to reload. A quiet store's server
 * copy is often a fresh one, so this was the usual way to open the admin (the owner's report of
 * 2026-11-06). The second render is fine, so the document is read to its end here and rendered
 * again if it stopped short. Nothing on the site streams content late, so nothing is given up.
 */

/** Renders tried after the first, before giving up. */
export const DOCUMENT_RETRIES = 2;

export const isWholeDocument = (html: string) => /<\/body>\s*<\/html>\s*$/i.test(html);

const isDocument = (response: Response) =>
  (response.headers.get("content-type") ?? "").toLowerCase().includes("text/html");

async function readToEnd(response: Response): Promise<string | null> {
  try {
    return await response.text();
  } catch {
    // The stream failed partway: an unfinished document, as above.
    return null;
  }
}

export async function wholeDocument({
  request,
  first,
  render,
  givenUp,
  onIncomplete,
}: {
  request: Pick<Request, "method" | "signal">;
  first: Response;
  /** Renders the page again. */
  render: () => Promise<Response>;
  /** What to send when no render was whole: a page that can reload itself. */
  givenUp: () => Response;
  onIncomplete?: (attempt: number) => void;
}): Promise<Response> {
  if (request.method !== "GET") return first;
  let response = first;
  for (let attempt = 0; ; attempt += 1) {
    // A redirect, a file or an API answer is not a document, whichever render it came from.
    if (!isDocument(response) || !response.body) return response;
    const html = await readToEnd(response);
    if (html !== null && isWholeDocument(html)) {
      const headers = new Headers(response.headers);
      // Each page names the files of its own release, and a release removes the last one's: a page
      // kept by the browser could only fail. Whoever set their own rule keeps it.
      if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-cache");
      return new Response(html, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    onIncomplete?.(attempt);
    if (attempt >= DOCUMENT_RETRIES || request.signal.aborted) return givenUp();
    response = await render();
  }
}
