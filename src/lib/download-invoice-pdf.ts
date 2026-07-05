// Client-only helper to render an on-screen invoice element into a downloadable
// PDF that mirrors the live preview exactly (colors, fonts, RTL layout).
// Uses html2pdf.js (html2canvas + jsPDF) dynamically so it never runs during SSR.

export async function downloadInvoicePdf(
  element: HTMLElement | null,
  filename: string,
) {
  if (!element || typeof window === "undefined") return;
  const mod: any = await import("html2pdf.js");
  const html2pdf = mod.default ?? mod;

  const safeName = filename.replace(/[^a-zA-Z0-9-_\.\u0600-\u06FF]+/g, "_");
  const finalName = safeName.toLowerCase().endsWith(".pdf")
    ? safeName
    : `${safeName}.pdf`;

  await html2pdf()
    .set({
      margin: [8, 8, 8, 8],
      filename: finalName,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: null,
        logging: false,
        letterRendering: true,
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    })
    .from(element)
    .save();
}
