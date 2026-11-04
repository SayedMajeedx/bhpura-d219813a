import { BLEED, type Shape } from "./geometry";
import type { CardFontFiles } from "./content";
import { cardFontFamily } from "./type";
import { cardSvg } from "./svg";

/**
 * Printing a card, both sides, as the owner's brief asks: on A6 paper with a deliberate white
 * margin (a home printer cannot print to the edge), on A4 at its true size with its bleed and
 * cut marks (cut on the marks and the colour runs to the edge; a print shop works from the same
 * sheet), or on one side of A4 for a printer that cannot print both (`foldSheet`). Printed from
 * the page's own print dialog, so the text is real text.
 */

export type PrintFormat = "a6" | "a4" | "fold";

const A4 = { w: 210, h: 297 };

/**
 * Where a card sits on a sheet printed on one side only, then folded across its middle with the
 * print outside, glued and cut through both layers: the fold puts the back exactly behind the
 * front, as two-sided printing would, and the cut takes the fold away. An A4 half is too short
 * for a standing A6, so both faces lie on their long side: a portrait card's turn a quarter the
 * same way, a landscape card's back turns upside down, and each reads upright when the finished
 * card is turned over like a page. The sheet stays portrait, so no printer has to turn it.
 */
export function foldSheet(size: { w: number; h: number }) {
  const portrait = size.h > size.w;
  const w = Math.max(size.w, size.h);
  const h = Math.min(size.w, size.h);
  const fold = A4.h / 2;
  const x = (A4.w - w) / 2;
  const y = (fold - h) / 2;
  return {
    fold,
    front: { x, y, w, h, turn: portrait ? 90 : 0 },
    back: { x, y: fold + y, w, h, turn: portrait ? 90 : 180 },
  };
}

/** The card's faces as the print page loads them (`/fonts/...` on the page's own host). */
/** A font address made safe to write inside CSS's url("..."). */
const cssUrl = (url: string) => url.replace(/["'()\\\s<>]/g, "");

/** The store's own card fonts, as @font-face rules under the names the card's text asks for. */
function customFaces(fonts: CardFontFiles | null | undefined): { css: string; loads: string[] } {
  const faces = (["ar", "en"] as const).flatMap((lang) => {
    const url = fonts?.[lang];
    return url ? [{ family: cardFontFamily(lang, url), url: cssUrl(url) }] : [];
  });
  return {
    css: faces
      .map(
        (f) =>
          `@font-face{font-family:"${f.family}";src:url("${f.url}");font-weight:100 900;font-style:normal;font-display:block}`,
      )
      .join(""),
    loads: faces.map((f) => `400 40px "${f.family}"`),
  };
}

function fontFaces(origin: string): string {
  const face = (family: string, file: string, weight: string, format = "woff2") =>
    `@font-face{font-family:"${family}";src:url("${origin}/fonts/${file}") format("${format}");font-weight:${weight};font-style:normal;font-display:block}`;
  return [
    face("29LT Azer", "azerextralight.woff2", "200"),
    face("29LT Kaff", "kafflight.woff2", "300"),
    face("Readex Pro", "variable/readex-pro-hexp-wght.woff2", "160 700", "woff2-variations"),
    face(
      "Plus Jakarta Sans",
      "variable/plus-jakarta-sans-wght.woff2",
      "200 800",
      "woff2-variations",
    ),
  ].join("");
}

const WORDS = {
  ar: {
    title: "بطاقة هدية",
    a4: "اطبع بالحجم الفعلي (100%) ثم قصّ على العلامات. يُفضّل ورق مطفي سميك (300 غرام تقريبًا) وطباعة على الوجهين.",
    a6: "اطبع على ورق A6 بالحجم الفعلي. يُفضّل ورق مطفي سميك وطباعة على الوجهين.",
    foldBefore: [
      "1. اطبع على وجه واحد بالحجم الفعلي (100%). يُفضّل ورق مطفي مطلي من 160 إلى 200 غرام.",
      "2. اطوِ على الخط المتقطع والطباعة للخارج، وتأكد أمام الضوء أن علامات الوجهين فوق بعضها.",
    ],
    foldAfter: [
      "3. الصق الظهرين الفارغين معًا. ولبطاقة أسمك ضع بينهما ورقًا مقوّى.",
      "4. قصّ الأطراف الأربعة على العلامات.",
    ],
  },
  en: {
    title: "Gift card",
    a4: "Print at actual size (100%), then cut on the marks. Heavy matte paper (about 300 gsm), both sides.",
    a6: "Print on A6 paper at actual size. Heavy matte paper, both sides.",
    foldBefore: [
      "1. Print on one side at actual size (100%). Coated matte paper, 160 to 200 gsm, is best.",
      "2. Fold on the dashed line, print outside, and check against the light that the marks meet.",
    ],
    foldAfter: [
      "3. Glue the two blank sides together. For a thicker card, put card stock between them.",
      "4. Cut all four edges on the marks.",
    ],
  },
};

/** The lines of cut marks just outside the bleed at the four corners of the trim. */
function cutLines(x: number, y: number, w: number, h: number): string[] {
  const gap = BLEED + 1.5;
  const len = 6;
  const lines: string[] = [];
  for (const cx of [x, x + w]) {
    lines.push(
      `M${cx} ${y - gap}L${cx} ${y - gap - len}`,
      `M${cx} ${y + h + gap}L${cx} ${y + h + gap + len}`,
    );
  }
  for (const cy of [y, y + h]) {
    lines.push(
      `M${x - gap} ${cy}L${x - gap - len} ${cy}`,
      `M${x + w + gap} ${cy}L${x + w + gap + len} ${cy}`,
    );
  }
  return lines;
}

/** Marks over a whole A4 sheet. */
function sheetMarks(lines: string[], extra = ""): string {
  return `<svg class="marks" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${A4.w} ${A4.h}" width="${A4.w}mm" height="${A4.h}mm"><path d="${lines.join("")}" stroke="#000" stroke-width="0.2" fill="none"/>${extra}</svg>`;
}

/** One A4 page holding both faces, the fold between them and the steps either side of it. */
function foldPage(
  faces: { front: Shape[]; back: Shape[] },
  size: { w: number; h: number },
  lang: "ar" | "en",
): string {
  const sheet = foldSheet(size);
  const art = (shapes: Shape[], at: ReturnType<typeof foldSheet>["front"], id: string) => {
    const left = at.x + at.w / 2 - size.w / 2 - BLEED;
    const top = at.y + at.h / 2 - size.h / 2 - BLEED;
    const turn = at.turn ? `;transform:rotate(${at.turn}deg)` : "";
    return cardSvg(shapes, size, { bleed: true, idPrefix: id }).replace(
      "<svg ",
      `<svg class="card-art" style="left:${left}mm;top:${top}mm${turn}" `,
    );
  };
  const lines = [sheet.front, sheet.back].flatMap((at) => cutLines(at.x, at.y, at.w, at.h));
  const foldLine = `<path d="M6 ${sheet.fold}L${A4.w - 6} ${sheet.fold}" stroke="#000" stroke-width="0.25" stroke-dasharray="2.5 1.5" fill="none"/>`;
  const dir = lang === "ar" ? "rtl" : "ltr";
  const steps = (place: string, words: string[]) =>
    `<p class="steps ${place}" dir="${dir}">${words.join("<br>")}</p>`;
  return `<section class="page">${art(faces.front, sheet.front, "p0")}${art(
    faces.back,
    sheet.back,
    "p1",
  )}${sheetMarks(lines, foldLine)}${steps("steps-above", WORDS[lang].foldBefore)}${steps(
    "steps-below",
    WORDS[lang].foldAfter,
  )}</section>`;
}

/**
 * The print page for a card: the card alone on two pages (front, then back), or on one sheet to
 * fold.
 */
export function cardPrintHtml(opts: {
  front: Shape[];
  back: Shape[];
  size: { w: number; h: number };
  format: PrintFormat;
  lang: "ar" | "en";
  origin: string;
  /** The store's own card fonts, when it uploaded them. */
  fonts?: CardFontFiles | null;
}): string {
  const { size, format, lang } = opts;
  const custom = customFaces(opts.fonts);
  const words = WORDS[lang];
  let pageCss: string;
  let pages: string;
  if (format === "a6") {
    const margin = 6;
    const scale = Math.min((size.w - margin * 2) / size.w, (size.h - margin * 2) / size.h);
    pageCss = `@page{size:${size.w}mm ${size.h}mm;margin:0}.page{width:${size.w}mm;height:${size.h}mm}.page svg{width:${size.w * scale}mm;height:${size.h * scale}mm}`;
    pages = [opts.front, opts.back]
      .map(
        (shapes, i) =>
          `<section class="page">${cardSvg(shapes, size, { idPrefix: `p${i}` })}</section>`,
      )
      .join("");
  } else if (format === "fold") {
    pageCss = `@page{size:${A4.w}mm ${A4.h}mm;margin:0}.page{width:${A4.w}mm;height:${A4.h}mm;position:relative}.page>svg.card-art{position:absolute}.marks{position:absolute;left:0;top:0}.steps{position:absolute;left:36mm;right:36mm;margin:0;font:8pt/1.35 "Readex Pro","Plus Jakarta Sans",sans-serif;color:#555;text-align:center}.steps-above{bottom:150mm}.steps-below{top:150mm}`;
    pages = foldPage(opts, size, lang);
  } else {
    const x = (210 - size.w) / 2;
    const y = (297 - size.h) / 2;
    pageCss = `@page{size:210mm 297mm;margin:0}.page{width:210mm;height:297mm;position:relative}.page>svg.card-art{position:absolute;left:${x - BLEED}mm;top:${y - BLEED}mm}.marks{position:absolute;left:0;top:0}.note{position:absolute;left:15mm;right:15mm;bottom:12mm;margin:0;font:9pt "Readex Pro","Plus Jakarta Sans",sans-serif;color:#555;text-align:center}`;
    const marks = sheetMarks(cutLines(x, y, size.w, size.h));
    pages = [opts.front, opts.back]
      .map(
        (shapes, i) =>
          `<section class="page">${cardSvg(shapes, size, {
            bleed: true,
            idPrefix: `p${i}`,
          }).replace(
            "<svg ",
            '<svg class="card-art" ',
          )}${marks}${i === 0 ? `<p class="note" dir="${lang === "ar" ? "rtl" : "ltr"}">${words.a4}</p>` : ""}</section>`,
      )
      .join("");
  }
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${words.title}</title><style>${fontFaces(
    opts.origin,
  )}${custom.css}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{display:flex;align-items:center;justify-content:center;page-break-after:always;break-after:page;overflow:hidden}.page:last-child{page-break-after:auto;break-after:auto}svg{display:block}${pageCss}@media screen{body{background:#eee}.page{background:#fff;margin:12px auto;box-shadow:0 1px 4px rgba(0,0,0,.15)}}</style></head><body>${pages}<script>
(function(){
  var faces=['200 40px "29LT Azer"','300 40px "29LT Kaff"','400 40px "Readex Pro"','300 40px "Plus Jakarta Sans"','600 40px "Plus Jakarta Sans"'].concat(${JSON.stringify(
    custom.loads,
  )});
  var loads=faces.map(function(f){return document.fonts?document.fonts.load(f).catch(function(){}):null;});
  var pics=Array.prototype.map.call(document.querySelectorAll('image'),function(el){
    return new Promise(function(done){var im=new Image();im.onload=im.onerror=function(){done();};im.src=el.getAttribute('href');});
  });
  Promise.all(loads.concat(pics)).then(function(){return document.fonts?document.fonts.ready:null;}).then(function(){
    setTimeout(function(){window.focus();window.print();},300);
  });
})();
</script></body></html>`;
}
