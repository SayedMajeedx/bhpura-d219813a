import type { Dispatch, SetStateAction } from "react";
import { isMeasurementField } from "@/features/product-page/lib/quick-add";

/** A shopper's answers with the measurements taken out (a ready size has none). */
export function withoutMeasurements(
  values: Record<string, string>,
  isMeasurement: (key: string) => boolean = isMeasurementField,
): Record<string, string> {
  const next = { ...values };
  for (const key of Object.keys(next)) {
    if (isMeasurement(key)) delete next[key];
  }
  return next;
}

/**
 * The product page's "Ready size": the sizing toggle's own step and the offers line's "Choose a
 * ready size" (an offer on ready pieces, shown while the piece is being made). One step for both,
 * so the measurements typed for tailoring never ride along on a ready piece.
 */
export function chooseReadySize({
  setSizeMode,
  setErrorMsg,
  setCfValues,
  setMeasurementsApplied,
  isMeasurement = isMeasurementField,
}: {
  setSizeMode: Dispatch<SetStateAction<"ready" | "custom">>;
  setErrorMsg: Dispatch<SetStateAction<string | null>>;
  setCfValues: Dispatch<SetStateAction<Record<string, string>>>;
  setMeasurementsApplied: Dispatch<SetStateAction<boolean>>;
  /** Which answers are measurements (the page's rule, `isMeasurementField`, unless told). */
  isMeasurement?: (key: string) => boolean;
}) {
  setSizeMode("ready");
  setErrorMsg(null);
  setCfValues((values) => withoutMeasurements(values, isMeasurement));
  setMeasurementsApplied(false);
}
