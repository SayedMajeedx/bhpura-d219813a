import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useId } from "react";
import { useT } from "@/lib/i18n";
import { RegionPicker } from "@/components/region-picker";

export function AddressFields({
  value,
  onChange,
  lang,
  showLabel = true,
}: {
  value: {
    label: string;
    region: string;
    block: string;
    road: string;
    house: string;
    flat: string;
  };
  onChange: (v: {
    label: string;
    region: string;
    block: string;
    road: string;
    house: string;
    flat: string;
  }) => void;
  lang: "en" | "ar";
  showLabel?: boolean;
}) {
  const t = useT();
  const regionId = useId();
  return (
    <div className="space-y-4">
      {showLabel && (
        <div>
          <Label>{t("customers.addressLabel")}</Label>
          <Input
            className="text-start"
            value={value.label}
            onChange={(e) => onChange({ ...value, label: e.target.value })}
          />
        </div>
      )}
      <div>
        <Label htmlFor={regionId}>
          {t("customers.region")} <span className="text-destructive">*</span>
        </Label>
        <RegionPicker
          id={regionId}
          value={value.region}
          onChange={(v) => onChange({ ...value, region: v })}
          lang={lang === "ar" ? "ar" : "en"}
          placeholder={t("customers.regionPlaceholder")}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>
            {t("customers.block")} <span className="text-destructive">*</span>
          </Label>
          <Input
            className="text-start"
            placeholder={t("customers.blockPlaceholder")}
            value={value.block}
            onChange={(e) => onChange({ ...value, block: e.target.value })}
          />
        </div>
        <div>
          <Label>
            {t("customers.road")} <span className="text-destructive">*</span>
          </Label>
          <Input
            className="text-start"
            placeholder={t("customers.roadPlaceholder")}
            value={value.road}
            onChange={(e) => onChange({ ...value, road: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>
            {t("customers.house")} <span className="text-destructive">*</span>
          </Label>
          <Input
            className="text-start"
            placeholder={t("customers.housePlaceholder")}
            value={value.house}
            onChange={(e) => onChange({ ...value, house: e.target.value })}
          />
        </div>
        <div>
          <Label>{t("customers.flat")}</Label>
          <Input
            className="text-start"
            placeholder={t("customers.flatPlaceholder")}
            value={value.flat}
            onChange={(e) => onChange({ ...value, flat: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
