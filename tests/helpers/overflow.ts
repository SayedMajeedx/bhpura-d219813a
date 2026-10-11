import type { Page } from "@playwright/test";

/**
 * Content a visitor cannot reach because it lies beyond the side of the screen.
 *
 * The app hides sideways overflow on html, body and the page shells, so a block that grows wider
 * than the screen is not scrolled to: it is cut off. `document.scrollWidth` stays equal to the
 * screen's width in that case and says nothing, so this measures the boxes themselves.
 *
 * Reported: a visible box that is partly on screen and reaches past its left or right edge.
 * Not reported: boxes wholly off screen (a closed drawer), boxes inside a region made to scroll
 * sideways (a table wrapper, a rail of chips), decorations (no text, no pointer events), and what
 * a component clips on purpose: a picture cropped by its frame, a carousel's moving track, a
 * layer placed over a frame, a line cut short with an ellipsis. A block of ordinary content that a card or a page wrapper clips is
 * reported: that is content the visitor loses. Only the outermost box of each block is listed.
 */
export type CutOff = {
  element: string;
  /** The boxes that hold it, nearest first: where to look in the source. */
  within: string;
  left: number;
  right: number;
  width: number;
  text: string;
};

export async function findCutOffContent(page: Page): Promise<CutOff[]> {
  return page.evaluate(() => {
    const screenWidth = document.documentElement.clientWidth;
    const screenHeight = window.innerHeight;
    const beyond = (r: DOMRect) => r.left < -1 || r.right > screenWidth + 1;
    /** The page itself or a wrapper as large as the screen: what it clips is lost, not designed. */
    const isPageShell = (el: Element, r: DOMRect) =>
      el === document.body ||
      el === document.documentElement ||
      (r.width >= screenWidth - 1 && r.height >= screenHeight - 1);

    const scrollsSideways = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const overflowX = getComputedStyle(p).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") return true;
      }
      return false;
    };

    /** A frame that clips what it holds on purpose, and holds this box directly or one level down. */
    const clippedOnPurpose = (el: Element) => {
      const style = getComputedStyle(el);
      const parentStyle = el.parentElement ? getComputedStyle(el.parentElement) : null;
      const placed =
        /^(img|video|canvas|svg|picture|iframe)$/i.test(el.tagName) ||
        style.position === "absolute" ||
        style.position === "fixed" ||
        style.transform !== "none" ||
        (parentStyle !== null && parentStyle.transform !== "none");
      for (const frame of [el.parentElement, el.parentElement?.parentElement]) {
        if (!frame || frame === document.body) continue;
        const frameStyle = getComputedStyle(frame);
        const overflowX = frameStyle.overflowX;
        if (overflowX !== "hidden" && overflowX !== "clip") continue;
        // A line cut short with an ellipsis clips its text whatever the text is made of.
        if (!placed && frameStyle.textOverflow !== "ellipsis") continue;
        const r = frame.getBoundingClientRect();
        if (!isPageShell(frame, r) && !beyond(r)) return true;
      }
      return false;
    };

    // A box that hides its overflow can still be scrolled sideways by focus (a dialog taking
    // focus does it). Put each back, so the block that is too wide is reported, not the shift.
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      if (el.scrollLeft !== 0 && /hidden|clip/.test(getComputedStyle(el).overflowX)) {
        el.scrollLeft = 0;
      }
    }

    const cut = new Set<Element>();
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right <= 0 || r.left >= screenWidth) continue;
      if (!beyond(r)) continue;
      const style = getComputedStyle(el);
      // Hidden by itself or by a box that holds it (a bar that fades in, a closed panel).
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      if (style.pointerEvents === "none" && !(el.textContent ?? "").trim()) continue;
      if (scrollsSideways(el)) continue;
      cut.add(el);
    }

    return Array.from(cut)
      .filter((el) => !el.parentElement || !cut.has(el.parentElement))
      .filter((el) => !clippedOnPurpose(el))
      .map((el) => {
        const r = el.getBoundingClientRect();
        const name = (node: Element, most: number) => {
          const classes =
            typeof node.className === "string"
              ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, most)
              : [];
          return `${node.tagName.toLowerCase()}${classes.length ? "." + classes.join(".") : ""}`;
        };
        const holders: string[] = [];
        for (let p = el.parentElement; p && p !== document.body && holders.length < 3;) {
          holders.push(name(p, 4));
          p = p.parentElement;
        }
        return {
          element: name(el, 8),
          within: holders.join(" < "),
          left: Math.round(r.left),
          right: Math.round(r.right),
          width: Math.round(r.width),
          text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60),
        };
      });
  });
}

/** One line per cut-off block, for an assertion message. */
export function describeCutOff(found: CutOff[]): string {
  return found
    .map(
      (c) =>
        `  ${c.element} [${c.left}..${c.right}, ${c.width}px wide] "${c.text}"
      in ${c.within}`,
    )
    .join("\n");
}

/**
 * Nothing the page does reaches the app's own server with a write: an audit that presses buttons
 * must not save, send or delete. Supabase calls are answered by each spec's own routes.
 */
export async function blockAppWrites(page: Page) {
  await page.route(
    (url) => !/\/(rest|auth|storage|functions)\/v1\//.test(url.pathname),
    (route) => {
      if (["GET", "HEAD", "OPTIONS"].includes(route.request().method())) return route.fallback();
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    },
  );
}

const TRIGGERS = [
  'button[aria-haspopup="dialog"]',
  'button[aria-haspopup="menu"]',
  "header button",
  "main button",
  'main [role="button"]',
].join(", ");
const OVERLAYS = '[role="dialog"], [role="alertdialog"], [role="menu"]';

/** Back to the page being audited; a navigation still in flight is given one more try. */
async function reopen(page: Page, url: string) {
  await page.goto(url).catch(() => page.goto(url).catch(() => undefined));
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(800);
}

/**
 * Presses the page's buttons one by one and measures the page after each press, so what a press
 * reveals is audited too: a dialog, a drawer, a menu, another tab, an opened panel. Returns one
 * entry per distinct finding. A press that leaves the page is undone by loading it again.
 */
export async function auditOverlays(
  page: Page,
  label: string,
  options: { presses?: number } = {},
): Promise<string[]> {
  const problems: string[] = [];
  const home = page.url();
  const seen = new Set<string>();
  const presses = Math.min(await page.locator(TRIGGERS).count(), options.presses ?? 30);

  for (let i = 0; i < presses; i++) {
    const trigger = page.locator(TRIGGERS).nth(i);
    if (!(await trigger.isVisible().catch(() => false))) continue;
    if (await trigger.isDisabled().catch(() => true)) continue;
    const name = (
      (await trigger.getAttribute("aria-label").catch(() => null)) ||
      (await trigger.innerText().catch(() => "")) ||
      `button ${i}`
    )
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 40);

    await trigger.click({ timeout: 1_500 }).catch(() => undefined);
    // Sheets slide in: measure them where they come to rest.
    await page.waitForTimeout(650);

    if (page.url() !== home) {
      await reopen(page, home);
      continue;
    }

    const cut = await findCutOffContent(page).catch(() => []);
    const finding = cut.map((c) => `${c.element}|${c.text}`).join("\n");
    if (cut.length > 0 && !seen.has(finding)) {
      seen.add(finding);
      problems.push(`${label}, after "${name}"\n${describeCutOff(cut)}`);
    }

    const overlay = page.locator(OVERLAYS).last();
    if (!(await overlay.isVisible().catch(() => false))) continue;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    if (await overlay.isVisible().catch(() => false)) await reopen(page, home);
  }
  return problems;
}
