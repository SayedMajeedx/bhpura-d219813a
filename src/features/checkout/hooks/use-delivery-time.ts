import { useEffect, useMemo, useState } from "react";
import {
  deliveryDays,
  readSchedule,
  scheduleApplies,
  slotValue,
  type DeliveryDay,
  type DeliverySchedule,
} from "@/lib/delivery-schedule";

/**
 * The day and time a shopper picks at checkout, by the store's delivery schedule. The days are
 * worked out once the page is in the browser (the server's moment and the shopper's could fall
 * either side of midnight); a pick the schedule no longer offers is dropped.
 */
export function useDeliveryTime({
  schedule: raw,
  fulfillment,
  appointment,
  t,
}: {
  schedule: unknown;
  fulfillment: string;
  /** A booking's date is the booking's: no other day is asked. */
  appointment: boolean;
  t: (ar: string, en: string) => string;
}) {
  const schedule: DeliverySchedule = useMemo(() => readSchedule(raw), [raw]);
  const applies = !appointment && scheduleApplies(schedule, fulfillment);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const days: DeliveryDay[] = useMemo(
    () => (applies && now ? deliveryDays(schedule, now) : []),
    [applies, now, schedule],
  );
  const [picked, setPicked] = useState<{ date: string | null; slot: string | null }>({
    date: null,
    slot: null,
  });
  const day = days.find((d) => d.date === picked.date) ?? null;
  const slot = day && day.slots.some((s) => slotValue(s) === picked.slot) ? picked.slot : null;

  const missing = !applies
    ? null
    : !day
      ? t("اختر يوم استلام طلبك.", "Pick the day you would like your order.")
      : day.slots.length > 0 && !slot
        ? t("اختر الوقت المناسب لك.", "Pick a time that suits you.")
        : null;

  return {
    schedule,
    applies,
    now,
    days,
    date: day?.date ?? null,
    slot,
    slotsOfDay: day?.slots ?? [],
    pickDate: (date: string) => setPicked({ date, slot: null }),
    pickSlot: (value: string) => setPicked((prev) => ({ ...prev, slot: value })),
    /** For the order: what was picked, and what is still to pick (null: nothing). */
    requested: applies ? { date: day?.date ?? null, slot, missing } : null,
  };
}

export type DeliveryTime = ReturnType<typeof useDeliveryTime>;
