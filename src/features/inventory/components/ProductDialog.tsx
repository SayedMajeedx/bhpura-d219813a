import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  invalidateServiceOptions,
  optionsOf,
  serviceOptionsQueries,
} from "@/lib/data/service-options";
import { optionFormFrom } from "@/lib/bookings/service-options";
import {
  invalidateServicePackages,
  packageLinesById,
  servicePackagesQueries,
} from "@/lib/data/service-packages";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Image as ImageIcon, Sliders } from "lucide-react";
import { useT, useI18n } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
import { ImageCropperDialog } from "@/components/image-cropper-dialog";
import { VideoOptimizerDialog } from "@/components/admin/video/VideoOptimizerDialog";

import type { Product } from "@/features/inventory/types";

import {
  hasExtraAxisLabels,
  productFormFrom,
  type ProductDialogTab,
  type ProductFormErrors,
} from "@/features/inventory/lib/product-form";
import { useProductMedia } from "@/features/inventory/hooks/use-product-media";
import { useSaveProduct } from "@/features/inventory/hooks/use-save-product";
import { useServicePricing } from "@/features/inventory/hooks/use-service-pricing";
import { useProductDialogData } from "@/features/inventory/hooks/use-product-dialog-data";
import { ProductBasicTab } from "@/features/inventory/components/ProductBasicTab";
import { ProductMediaTab } from "@/features/inventory/components/ProductMediaTab";
import { ProductCustomizerTab } from "@/features/inventory/components/ProductCustomizerTab";

export function ProductDialog({
  product,
  onSaved,
}: {
  product: Product | null;
  onSaved: (newProductId?: string, kind?: "service" | "product") => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const { storeProfile, addonAxisDefaults, customFieldPresets, categoriesQ, sizeGuidesQ } =
    useProductDialogData(brand.id);
  // A bookings store sells services: a new item starts as one.
  const service = Boolean(storeProfile?.modules?.bookings);
  const [form, setForm] = useState(() => productFormFrom(product, { service }));
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const {
    uploading,
    cropSrc,
    setCropSrc,
    pendingVideo,
    setPendingVideo,
    setPendingImageFile,
    handleFilePicked,
    handleConfirmProductVideo,
    handleCropConfirmed,
    handleSkipCrop,
    removeMedia,
    moveMedia,
    commitMedia,
  } = useProductMedia(brand.id, form, setForm, isAr);

  // Stepper state: 'basic' | 'media' | 'customizer'
  const [activeDialogTab, setActiveDialogTab] = useState<ProductDialogTab>("basic");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showExtraAxes, setShowExtraAxes] = useState(false);

  useEffect(() => {
    setForm(productFormFrom(product, { service }));
    setErrors({});
    setActiveDialogTab("basic");
    setShowExtraAxes(hasExtraAxisLabels(product));
  }, [product, service]);

  const isService = form.item_kind === "service";
  // An existing package's lines load once into the form.
  const packageRows = useQuery({
    ...servicePackagesQueries.items(brand.id),
    enabled: isService && Boolean(product?.is_package),
  }).data;
  // An existing service's add-ons load once into the form.
  const optionRows = useQuery({
    ...serviceOptionsQueries.list(brand.id),
    enabled: isService && Boolean(product),
  }).data;
  const savedOptionIds = product
    ? optionsOf(optionRows, product.id)
        .filter((option) => option.is_active)
        .map((option) => option.id)
    : [];
  const loadedOptionsFor = useRef<string | null>(null);
  useEffect(() => {
    if (!product || !optionRows || loadedOptionsFor.current === product.id) return;
    loadedOptionsFor.current = product.id;
    setForm((current) => ({
      ...current,
      service_options: optionsOf(optionRows, product.id)
        .filter((option) => option.is_active)
        .map(optionFormFrom),
    }));
  }, [product, optionRows]);
  const loadedPackageFor = useRef<string | null>(null);
  useEffect(() => {
    if (!product?.is_package || !packageRows || loadedPackageFor.current === product.id) return;
    loadedPackageFor.current = product.id;
    setForm((current) => ({
      ...current,
      package_items: packageLinesById(packageRows).get(product.id) ?? [],
    }));
  }, [product, packageRows]);
  // A service's prices: its lengths and their prices, saved as its variants.
  const servicePricing = useServicePricing(brand.id, product?.id ?? null, isService);

  const save = useSaveProduct({
    product,
    form,
    isAr,
    setErrors,
    onInvalid: () => setActiveDialogTab("basic"),
    commitMedia,
    savedOptionIds,
    onSaved: (newProductId, kind) => {
      // What a package includes may have changed.
      void invalidateServicePackages(qc, brand.id);
      void invalidateServiceOptions(qc, brand.id);
      onSaved(newProductId, kind);
    },
    service: isService
      ? { pricing: servicePricing.pricing, variants: servicePricing.variants }
      : undefined,
  });

  return (
    <DialogContent className="max-h-[92vh] md:max-w-3xl p-0 flex flex-col rounded-2xl border border-border-strong shadow-2xl bg-background overflow-hidden">
      {/* Header with gradient bar and stepper indicators */}
      <div className="relative border-b border-border-subtle bg-secondary/20 p-5 pb-4">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-indigo-500 to-purple-600" />
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <span>
              {isService
                ? product
                  ? isAr
                    ? "تعديل الخدمة"
                    : "Edit service"
                  : isAr
                    ? "خدمة جديدة"
                    : "New service"
                : product
                  ? t("inventory.editProduct")
                  : t("inventory.newProduct")}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Stepper Tabs Bar */}
        <div className="flex items-center gap-2 mt-4 bg-muted/60 p-1 rounded-xl">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setActiveDialogTab("basic");
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 touch-manipulation ${
              activeDialogTab === "basic"
                ? "bg-background text-primary shadow-sm scale-[0.98]"
                : "text-muted-foreground hover:bg-background/40 hover:text-foreground"
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>{isAr ? "التفاصيل الأساسية" : "Basic Details"}</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setActiveDialogTab("media");
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 touch-manipulation ${
              activeDialogTab === "media"
                ? "bg-background text-primary shadow-sm scale-[0.98]"
                : "text-muted-foreground hover:bg-background/40 hover:text-foreground"
            }`}
          >
            <ImageIcon className="h-4 w-4" />
            <span>{isAr ? "معرض الصور" : "Media Gallery"}</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setActiveDialogTab("customizer");
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 touch-manipulation ${
              activeDialogTab === "customizer"
                ? "bg-background text-primary shadow-sm scale-[0.98]"
                : "text-muted-foreground hover:bg-background/40 hover:text-foreground"
            }`}
          >
            <Sliders className="h-4 w-4" />
            <span>
              {isService
                ? isAr
                  ? "أسئلة للعميل"
                  : "Customer questions"
                : isAr
                  ? "محرك التخصيص"
                  : "Customization"}
            </span>
          </button>
        </div>
      </div>

      {/* Wizard Content Block */}
      <div className="flex-1 p-6 space-y-5 overflow-y-auto">
        {activeDialogTab === "basic" && (
          <ProductBasicTab
            t={t}
            isAr={isAr}
            product={product}
            storeProfile={storeProfile}
            addonAxisDefaults={addonAxisDefaults}
            categoriesQ={categoriesQ}
            sizeGuidesQ={sizeGuidesQ}
            form={form}
            setForm={setForm}
            errors={errors}
            setErrors={setErrors}
            advancedOpen={advancedOpen}
            setAdvancedOpen={setAdvancedOpen}
            showExtraAxes={showExtraAxes}
            setShowExtraAxes={setShowExtraAxes}
            servicePricing={servicePricing.pricing}
            onServicePricing={(pricing) => {
              servicePricing.setPricing(pricing);
              setErrors((prev) => ({ ...prev, price: undefined }));
            }}
            pricingError={isService ? errors.price : null}
            currency={servicePricing.currency}
          />
        )}

        {activeDialogTab === "media" && (
          <ProductMediaTab
            isAr={isAr}
            form={form}
            uploading={uploading}
            handleFilePicked={handleFilePicked}
            removeMedia={removeMedia}
            moveMedia={moveMedia}
          />
        )}

        {activeDialogTab === "customizer" && (
          <ProductCustomizerTab
            isAr={isAr}
            customFieldPresets={customFieldPresets}
            form={form}
            setForm={setForm}
            brandId={brand.id}
            product={product}
          />
        )}
      </div>

      {/* Persistent Footer with back/next and global save actions */}
      <div className="border-t border-border-subtle bg-secondary/20 px-6 py-4.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {activeDialogTab !== "basic" && (
            <Button
              type="button"
              variant="outline"
              className="h-10 px-4 rounded-xl font-bold touch-manipulation"
              onClick={(e) => {
                e.preventDefault();
                if (activeDialogTab === "media") setActiveDialogTab("basic");
                else if (activeDialogTab === "customizer") setActiveDialogTab("media");
              }}
            >
              {isAr ? "السابق" : "Back"}
            </Button>
          )}
          {activeDialogTab !== "customizer" && (
            <Button
              type="button"
              variant="secondary"
              className="h-10 px-4 rounded-xl font-bold touch-manipulation"
              onClick={(e) => {
                e.preventDefault();
                if (activeDialogTab === "basic") setActiveDialogTab("media");
                else if (activeDialogTab === "media") setActiveDialogTab("customizer");
              }}
            >
              {isAr ? "التالي" : "Next"}
            </Button>
          )}
        </div>
        <Button
          type="button"
          onClick={save}
          className="h-10 px-5 rounded-xl font-bold bg-primary hover:bg-primary/95 text-primary-foreground shadow-lg shadow-primary/10 touch-manipulation"
        >
          {t("common.save")}
        </Button>
      </div>
      <ImageCropperDialog
        open={Boolean(cropSrc)}
        imageSrc={cropSrc}
        preset="productPortrait"
        busy={uploading}
        title={isAr ? "ضبط صورة المنتج" : "Frame product image"}
        description={
          isAr
            ? "اختر ملء الإطار أو احتواء كامل لمنع قص أي تفاصيل، أو تخطّ القص لاستخدام الصورة الأصلية."
            : "Choose cover to crop, contain to preserve full height, or skip crop to keep original."
        }
        onCancel={() => {
          setCropSrc(null);
          setPendingImageFile(null);
        }}
        onConfirm={handleCropConfirmed}
        onSkipCrop={handleSkipCrop}
      />
      <VideoOptimizerDialog
        open={Boolean(pendingVideo)}
        file={pendingVideo}
        brandId={brand.id}
        onOpenChange={(open) => {
          if (!open) setPendingVideo(null);
        }}
        onConfirm={handleConfirmProductVideo}
        onCancel={() => setPendingVideo(null)}
      />
    </DialogContent>
  );
}
