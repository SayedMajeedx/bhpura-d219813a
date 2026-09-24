import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

/** Money input that keeps three decimals (BHD) and commits on blur or Enter. */
export function BhdFeeInput({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const [display, setDisplay] = useState(Number(value || 0).toFixed(3));
  useEffect(() => setDisplay(Number(value || 0).toFixed(3)), [value]);
  const commit = () => {
    const parsed = Math.max(0, Number(display) || 0);
    setDisplay(parsed.toFixed(3));
    onChange(parsed);
  };
  return (
    <Input
      inputMode="decimal"
      value={display}
      disabled={disabled}
      onChange={(event) => setDisplay(event.target.value.replace(/[^0-9.]/g, ""))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}
