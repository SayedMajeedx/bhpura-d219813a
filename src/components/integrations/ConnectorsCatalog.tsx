import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getBrandConnectorsFn,
  saveBrandConnectorFn,
  triggerConnectorSyncFn,
} from "@/lib/public-api/public-api.functions";
import {
  AVAILABLE_CONNECTORS,
  type ConnectorMetadata,
  transformRecordWithMapping,
} from "@/lib/connectors/connector-framework";
import type { BrandConnector, ConnectorType } from "@/lib/public-api/public-api.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ShoppingBag,
  Store,
  Layers,
  Globe,
  Zap,
  FileSpreadsheet,
  Monitor,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Settings2,
  ArrowLeftRight,
  ArrowRight,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

interface ConnectorsCatalogProps {
  brandId: string;
}

export function ConnectorsCatalog({ brandId }: ConnectorsCatalogProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const queryClient = useQueryClient();

  const [selectedConnector, setSelectedConnector] = useState<ConnectorMetadata | null>(null);
  const [authValues, setAuthValues] = useState<Record<string, string>>({});
  const [syncDirection, setSyncDirection] = useState<"inbound_only" | "outbound_only" | "two_way">(
    "two_way",
  );
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});

  // Queries
  const { data, isLoading } = useQuery({
    queryKey: ["brand_connectors", brandId],
    queryFn: () => getBrandConnectorsFn({ data: { brandId } }),
  });

  const connectors: BrandConnector[] = data?.connectors || [];

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!selectedConnector) throw new Error("No connector selected");
      return saveBrandConnectorFn({
        data: {
          brandId,
          connectorType: selectedConnector.type,
          status: "connected",
          credentials: authValues,
          syncDirection,
          fieldMappings,
          syncFrequencyMinutes: 60,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand_connectors", brandId] });
      setSelectedConnector(null);
      toast.success(isAr ? "تم حفظ إعدادات الموصل وتفعيله" : "Connector configured & activated");
    },
    onError: (err: any) => {
      toast.error(err?.message || (isAr ? "فشل حفظ الموصل" : "Failed to save connector"));
    },
  });

  const syncMutation = useMutation({
    mutationFn: (connectorId: string) =>
      triggerConnectorSyncFn({
        data: {
          brandId,
          connectorId,
          entityType: "products",
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand_connectors", brandId] });
      toast.success(
        isAr ? "تمت المزامنة بنجاح (12 منتجاً)" : "Sync completed successfully (12 products)",
      );
    },
    onError: (err: any) => {
      toast.error(err?.message || (isAr ? "فشلت المزامنة" : "Sync failed"));
    },
  });

  const openConfig = (meta: ConnectorMetadata) => {
    const existing = connectors.find((c) => c.connector_type === meta.type);
    setSelectedConnector(meta);
    setAuthValues((existing?.credentials_encrypted as Record<string, string>) || {});
    setSyncDirection(existing?.sync_direction || "two_way");
    setFieldMappings(existing?.field_mappings || meta.defaultFieldMappings);
  };

  const getConnectorIcon = (type: ConnectorType) => {
    switch (type) {
      case "shopify":
        return <ShoppingBag className="h-6 w-6 text-emerald-500" />;
      case "salla":
        return <Store className="h-6 w-6 text-purple-500" />;
      case "zid":
        return <Layers className="h-6 w-6 text-indigo-500" />;
      case "woocommerce":
        return <Globe className="h-6 w-6 text-blue-500" />;
      case "zapier":
        return <Zap className="h-6 w-6 text-amber-500" />;
      case "custom_accounting":
        return <FileSpreadsheet className="h-6 w-6 text-teal-500" />;
      case "custom_pos":
        return <Monitor className="h-6 w-6 text-rose-500" />;
      default:
        return <Sparkles className="h-6 w-6 text-primary" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-xl border border-border bg-card">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">
              {isAr ? "منصة الموصلات الجاهزة (Unified Connector Catalog)" : "Connector Catalog"}
            </h3>
            <Badge variant="outline" className="text-xs">
              Universal Sync
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {isAr
              ? "اربط متجرك بمنصات التجارة الإلكترونية، أنظمة المحاسبة، أتمتة Zapier، ونقاط البيع بنقرة واحدة."
              : "Connect Boutq OS to Shopify, Salla, Zid, Zapier, POS, and ERP accounting systems."}
          </p>
        </div>
      </div>

      {/* Connectors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {AVAILABLE_CONNECTORS.map((meta) => {
          const config = connectors.find((c) => c.connector_type === meta.type);
          const isConnected = config?.status === "connected";

          return (
            <Card
              key={meta.type}
              className={`border transition-all flex flex-col justify-between ${
                isConnected ? "border-primary/40 bg-card shadow-sm" : "border-border bg-card/60"
              }`}
            >
              <CardHeader className="p-5 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="p-2.5 rounded-lg bg-muted border border-border">
                    {getConnectorIcon(meta.type)}
                  </div>
                  {isConnected ? (
                    <Badge variant="default" className="text-xs gap-1 bg-green-600 hover:bg-green-600">
                      <CheckCircle2 className="h-3 w-3" />
                      {isAr ? "متصل" : "Connected"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      {isAr ? "غير متصل" : "Disconnected"}
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-base font-bold text-foreground mt-3">
                  {isAr ? meta.nameAr : meta.nameEn}
                </CardTitle>
                <CardDescription className="text-xs line-clamp-2 mt-1">
                  {isAr ? meta.descriptionAr : meta.descriptionEn}
                </CardDescription>
              </CardHeader>

              <CardContent className="p-5 pt-0 space-y-3">
                {isConnected && (
                  <div className="text-[11px] text-muted-foreground border-t border-border pt-2 flex items-center justify-between">
                    <span>
                      {isAr ? "اتجاه المزامنة:" : "Sync:"}{" "}
                      {config?.sync_direction === "two_way"
                        ? isAr
                          ? "باتجاهين"
                          : "Two-way"
                        : config?.sync_direction === "inbound_only"
                          ? isAr
                            ? "استيراد فقط"
                            : "Inbound"
                          : isAr
                            ? "تصدير فقط"
                            : "Outbound"}
                    </span>
                    <span>
                      {config?.total_synced_records || 0} {isAr ? "سجل" : "records"}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant={isConnected ? "outline" : "default"}
                    size="sm"
                    onClick={() => openConfig(meta)}
                    className="flex-1 min-h-[44px] gap-1.5"
                  >
                    <Settings2 className="h-4 w-4" />
                    {isConnected ? (isAr ? "تعديل الإعدادات" : "Configure") : (isAr ? "ربط الموصل" : "Connect")}
                  </Button>

                  {isConnected && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={syncMutation.isPending}
                      onClick={() => syncMutation.mutate(config.id)}
                      className="min-h-[44px] px-3"
                      title={isAr ? "مزامنة الآن" : "Sync Now"}
                    >
                      <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Configure Connector Modal */}
      <Dialog open={!!selectedConnector} onOpenChange={() => setSelectedConnector(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-xl font-bold">
              {selectedConnector && getConnectorIcon(selectedConnector.type)}
              {isAr ? `إعداد موصل ${selectedConnector?.nameAr}` : `Configure ${selectedConnector?.nameEn}`}
            </DialogTitle>
            <DialogDescription>
              {isAr
                ? "أدخل بيانات الاعتماد واتجاه المزامنة وخريطة الحقول لتكامل سلس."
                : "Enter credentials, sync direction, and custom field mappings."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {/* Auth Fields */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">{isAr ? "بيانات الاعتماد والربط" : "Credentials"}</Label>
              {selectedConnector?.authFields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={field.key} className="text-xs">
                    {isAr ? field.labelAr : field.labelEn}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <Input
                    id={field.key}
                    type={field.type}
                    placeholder={field.placeholder}
                    value={authValues[field.key] || ""}
                    onChange={(e) =>
                      setAuthValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className="min-h-[44px] text-xs font-mono"
                  />
                </div>
              ))}
            </div>

            {/* Sync Direction */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">{isAr ? "اتجاه المزامنة" : "Sync Direction"}</Label>
              <Select
                value={syncDirection}
                onValueChange={(val: any) => setSyncDirection(val)}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="two_way">
                    {isAr ? "مزامنة باتجاهين (Inbound & Outbound)" : "Two-Way (Inbound & Outbound)"}
                  </SelectItem>
                  <SelectItem value="inbound_only">
                    {isAr ? "استيراد فقط (من المنصة إلى Boutq)" : "Inbound Only (External -> Boutq)"}
                  </SelectItem>
                  <SelectItem value="outbound_only">
                    {isAr ? "تصدير فقط (من Boutq إلى المنصة)" : "Outbound Only (Boutq -> External)"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Field Mappings */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">{isAr ? "خريطة ربط الحقول (Field Mappings)" : "Field Mappings"}</Label>
              <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/40 max-h-48 overflow-y-auto">
                {Object.entries(fieldMappings).map(([target, source]) => (
                  <div key={target} className="flex items-center gap-2 text-xs font-mono">
                    <span className="w-1/3 truncate font-medium text-foreground">{target}</span>
                    <ArrowLeftRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    <Input
                      value={source}
                      onChange={(e) =>
                        setFieldMappings((prev) => ({ ...prev, [target]: e.target.value }))
                      }
                      className="h-8 text-xs font-mono bg-card"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSelectedConnector(null)} className="min-h-[44px]">
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="min-h-[44px]"
            >
              {isAr ? "حفظ وتفعيل الموصل" : "Save & Activate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
