import { Link } from "@tanstack/react-router";
import { Boxes, Download, Instagram, Printer, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The inventory header's import, export, print and incubator-transfer menu. */
export function InventoryImportMenu({
  slug,
  isAr,
  onImportInstagram,
  onImportCatalog,
  onPrintAll,
  onTransferSelected,
}: {
  slug: string;
  isAr: boolean;
  onImportInstagram: () => void;
  onImportCatalog: () => void;
  onPrintAll: () => void;
  onTransferSelected: () => void;
}) {
  return (
    <div className="flex flex-col gap-1 p-1 min-w-[210px]">
      <div className="px-2.5 py-1 text-xs font-bold text-muted-foreground border-b border-border-subtle">
        {isAr ? "الاستيراد السريع" : "Quick Import"}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onImportInstagram}
        className="justify-start text-xs font-medium h-9"
      >
        <Instagram className="h-4 w-4 me-2 text-primary" />
        {isAr ? "استيراد كتالوج إنستغرام" : "Import from Instagram"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onImportCatalog}
        className="justify-start text-xs font-medium h-9"
      >
        <Upload className="h-4 w-4 me-2 text-primary" />
        {isAr ? "استيراد كتالوج المنتجات" : "Import Product Catalog"}
      </Button>
      <Link to="/admin/b/$slug/export" params={{ slug }}>
        <Button variant="ghost" size="sm" className="w-full justify-start text-xs font-medium h-9">
          <Download className="h-4 w-4 me-2 text-primary" />
          {isAr ? "تصدير الكتالوج (إكسل / CSV)" : "Export Catalog (Excel / CSV)"}
        </Button>
      </Link>

      <div className="px-2.5 pt-2 py-1 text-xs font-bold text-muted-foreground border-b border-border-subtle">
        {isAr ? "الباركود والطباعة" : "Barcodes & Print"}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onPrintAll}
        className="justify-start text-xs font-medium h-9"
      >
        <Printer className="h-4 w-4 me-2 text-muted-foreground" />
        {isAr ? "طباعة جميع الباركودات" : "Print All Barcodes"}
      </Button>

      <div className="px-2.5 pt-2 py-1 text-xs font-bold text-muted-foreground border-b border-border-subtle">
        {isAr ? "العمليات المتقدمة" : "Advanced Operations"}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onTransferSelected}
        className="justify-start text-xs font-medium h-9"
      >
        <Boxes className="h-4 w-4 me-2 text-muted-foreground" />
        {isAr ? "تحويل دفعي للحاضنات" : "Transfer to Incubators"}
      </Button>
    </div>
  );
}
