import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/lib/i18n";
import { BAHRAIN_REGIONS } from "@/lib/bahrain-regions";

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
        <Label>
          {t("customers.region")} <span className="text-destructive">*</span>
        </Label>
        <Select value={value.region} onValueChange={(v) => onChange({ ...value, region: v })}>
          <SelectTrigger className="text-start">
            <SelectValue placeholder={t("customers.regionPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {BAHRAIN_REGIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {lang === "ar" ? r.ar : r.en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
