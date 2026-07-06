import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { formatMoney } from "@/lib/format";

type BarcodeSvgProps = {
  value: string;
  height?: number;
  width?: number;
  fontSize?: number;
  displayValue?: boolean;
  margin?: number;
};

export function BarcodeSvg({
  value,
  height = 40,
  width = 1.4,
  fontSize = 12,
  displayValue = true,
  margin = 2,
}: BarcodeSvgProps) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        height,
        width,
        fontSize,
        displayValue,
        margin,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch {
      // invalid value; ignore
    }
  }, [value, height, width, fontSize, displayValue, margin]);
  return <svg ref={ref} />;
}

export type LabelData = {
  code: string;
  productName?: string | null;
  size?: string | null;
  color?: string | null;
  price?: number | null;
  businessName?: string | null;
};

export function openLabelPrintWindow() {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    window.alert("Please allow pop-ups to print barcode labels.");
    return null;
  }

  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=800, initial-scale=1" /><title>Preparing labels</title></head><body style="margin:0;font-family:system-ui,sans-serif;color:#000;background:#fff;">Preparing barcode labels...</body></html>`);
  printWindow.document.close();
  return printWindow;
}

export function PrintableLabel({ data }: { data: LabelData }) {
  const meta = [data.size, data.color].filter(Boolean).join(" · ");
  return (
    <div className="label-card">
      {data.businessName && <div className="label-biz">{data.businessName}</div>}
      {data.productName && <div className="label-name">{data.productName}</div>}
      {meta && <div className="label-meta">{meta}</div>}
      <div className="label-barcode">
        <BarcodeSvg value={data.code} height={70} width={2.2} fontSize={14} margin={8} />
      </div>
      {data.price != null && <div className="label-price">{formatMoney(Number(data.price))}</div>}
    </div>
  );
}

/**
 * Prints one or more sticker labels in a dedicated temporary window. Mobile
 * browsers such as Brave block background iframe printing, so this flow writes
 * a clean standalone document and prints only the 50mm × 30mm labels.
 */
export function printLabels(labels: LabelData[], targetWindow?: Window | null) {
  if (!labels.length) return;

  const printWindow = targetWindow ?? openLabelPrintWindow();
  if (!printWindow) return;

  // Render barcodes off-DOM as SVG strings using a temp svg element in the current doc.
  const svgs = labels.map((l) => {
    const tmp = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    try {
      JsBarcode(tmp, l.code, {
        format: "CODE128",
        height: 60,
        width: 2,
        fontSize: 12,
        displayValue: true,
        margin: 4,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch {
      /* skip invalid codes */
    }
    return tmp.outerHTML;
  });

  const labelHtml = labels
    .map((l, i) => {
      const info = buildLabelInfo(l);
      return `<div class="barcode-card">
        <div class="barcode-image">${svgs[i] ?? ""}</div>
        <div class="barcode-text">${escapeHtml(info)}</div>
      </div>`;
    })
    .join("");

  const styles = `
    @page { size: 50mm 30mm; margin: 0; }
    * { box-sizing: border-box !important; -webkit-text-size-adjust: none !important; text-size-adjust: none !important; }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 50mm !important;
      min-width: 50mm !important;
      max-width: 50mm !important;
      background: #fff !important;
      color: #000 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
    }
    .barcode-card {
      width: 50mm !important;
      height: 30mm !important;
      min-width: 50mm !important;
      max-width: 50mm !important;
      min-height: 30mm !important;
      max-height: 30mm !important;
      margin: 0 !important;
      padding: 5px !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      text-align: center !important;
      overflow: hidden !important;
      page-break-after: always !important;
      break-after: page !important;
    }
    .barcode-image {
      width: 40mm !important;
      height: auto !important;
      line-height: 0 !important;
      flex: 0 0 auto !important;
    }
    .barcode-image svg {
      width: 40mm !important;
      height: auto !important;
      max-width: 40mm !important;
      display: block !important;
    }
    .barcode-text {
      margin-top: 2px !important;
      font-size: 10px !important;
      font-weight: bold !important;
      line-height: 1.15 !important;
      max-width: 47mm !important;
      color: #000 !important;
      word-break: break-word;
      overflow: hidden !important;
    }
    @media print {
      body { margin: 0 !important; padding: 0 !important; }
      html, body {
        width: 50mm !important;
      }
      .barcode-card {
        width: 50mm !important;
        height: 30mm !important;
        page-break-after: always !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        text-align: center !important;
        box-sizing: border-box !important;
        padding: 5px !important;
      }
      .barcode-image { width: 40mm !important; height: auto !important; }
      .barcode-image svg { width: 40mm !important; height: auto !important; }
      .barcode-text { font-size: 10px !important; font-weight: bold !important; margin-top: 2px !important; }
    }
  `;

  const html = `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=800, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no" /><title>Barcode Labels</title><style>${styles}</style></head><body>${labelHtml}</body></html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  const closePrintWindow = () => {
    try {
      printWindow.close();
    } catch {
      /* noop */
    }
  };

  printWindow.onafterprint = closePrintWindow;
  setTimeout(() => {
    try {
      printWindow.focus();
      printWindow.print();
      setTimeout(closePrintWindow, 1_000);
    } catch {
      closePrintWindow();
    }
  }, 250);
}


function buildLabelInfo(label: LabelData) {
  const model = String(label.productName || "Product").trim();
  const size = String(label.size || "-").trim();
  const color = String(label.color || "-").trim();
  const price = label.price != null ? formatMoney(Number(label.price)) : "BHD 0.00";
  return `${model} - ${size} - ${color} - ${price}`;
}


function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function PrintLabelButton({
  data,
  label,
}: {
  data: LabelData;
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 px-2"
      onClick={() => printLabels([data])}
      title={label ?? "Print"}
    >
      <Printer className="h-3 w-3" />
    </Button>
  );
}
