import { MapPin } from "lucide-react";

export function DeliveryAddressSnapshot({ customer, lang }: { customer: any; lang: "en" | "ar" }) {
  if (!customer) return null;
  const parts = [];
  if (customer.house || customer.building) {
    parts.push(`${lang === "ar" ? "م" : "Bldg/House"} ${customer.house || customer.building}`);
  }
  if (customer.road) {
    parts.push(`${lang === "ar" ? "ط" : "Rd"} ${customer.road}`);
  }
  if (customer.block) {
    parts.push(`${lang === "ar" ? "مجمع" : "Blk"} ${customer.block}`);
  }
  if (customer.region || customer.city) {
    parts.push(customer.region || customer.city);
  }
  if (customer.flat) {
    parts.push(`${lang === "ar" ? "شقة" : "Flat"} ${customer.flat}`);
  }

  const text =
    parts.length > 0 ? parts.join(", ") : customer.address || customer.formatted_address || null;
  if (!text) return null;

  return (
    <div className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
      <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-500" />
      <span className="line-clamp-2">{text}</span>
    </div>
  );
}
