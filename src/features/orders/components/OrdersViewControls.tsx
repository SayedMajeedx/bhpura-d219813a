import { useEffect, useState } from "react";
import { Bell, BellOff, Columns3, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { newOrderSoundOn, playNewOrderChime, setNewOrderSound } from "@/lib/new-order-sound";
import { cn } from "@/lib/utils";

export type OrdersView = "list" | "board";

/**
 * Above the orders: the list or the board, and this browser's new-order sound. Turning the sound
 * on plays it once, so the member hears what it will be (and the browser lets the page play it).
 */
export function OrdersViewControls({
  view,
  onView,
  isAr,
}: {
  view: OrdersView;
  onView: (view: OrdersView) => void;
  isAr: boolean;
}) {
  const [sound, setSound] = useState(false);
  useEffect(() => setSound(newOrderSoundOn()), []);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div
        role="group"
        aria-label={isAr ? "طريقة العرض" : "View"}
        className="inline-flex rounded-lg border border-border p-0.5"
      >
        {(["list", "board"] as const).map((option) => {
          const Icon = option === "list" ? List : Columns3;
          return (
            <Button
              key={option}
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={view === option}
              className={cn(
                "h-8 gap-1.5 px-3 text-xs",
                view === option && "bg-muted font-semibold",
              )}
              onClick={() => onView(option)}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {option === "list" ? (isAr ? "قائمة" : "List") : isAr ? "لوحة" : "Board"}
            </Button>
          );
        })}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-pressed={sound}
        className="h-8 gap-1.5 text-xs"
        onClick={() => {
          const next = !sound;
          setNewOrderSound(next);
          setSound(next);
          // Let the switch's own tap prepare the sound before playing it.
          if (next) window.setTimeout(() => playNewOrderChime(), 120);
        }}
      >
        {sound ? (
          <Bell className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <BellOff className="h-3.5 w-3.5" aria-hidden />
        )}
        {sound
          ? isAr
            ? "صوت الطلبات الجديدة: مفعّل"
            : "New-order sound: on"
          : isAr
            ? "صوت الطلبات الجديدة: متوقف"
            : "New-order sound: off"}
      </Button>
    </div>
  );
}
