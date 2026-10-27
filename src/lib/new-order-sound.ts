/**
 * The admin's sound for a new order: off until a member switches it on in their own browser (the
 * owner's decision of 2026-10-27). A browser lets a page play sound only after a tap on it, so the
 * switch itself (a tap) prepares the sound, and a page reopened later prepares it on its first
 * tap. The chime is drawn by the browser (two short notes), with no file to load.
 */

const KEY = "boutq_new_order_sound";

export function newOrderSoundOn(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function setNewOrderSound(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "on");
    else localStorage.removeItem(KEY);
  } catch {
    // No storage: the choice lasts for this page only.
  }
  if (on) void unlockSound();
}

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
}

/** Lets the page play sound: called from a tap (the switch, or the page's first tap). */
export async function unlockSound() {
  const ctx = audio();
  if (ctx && ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      // The browser still refuses: the next tap tries again.
    }
  }
}

/** Two short rising notes; silent when the browser has not let the page play sound yet. */
export function playNewOrderChime() {
  const ctx = audio();
  if (!ctx || ctx.state !== "running") return false;
  const start = ctx.currentTime;
  [880, 1320].forEach((frequency, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    const at = start + i * 0.18;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.32);
  });
  return true;
}

/** Whether a new row is one a shopper made: a storefront order, or a storefront booking request. */
export function isShopperArrival(
  table: "orders" | "bookings",
  row: { channel?: unknown; source?: unknown } | null | undefined,
): boolean {
  if (!row) return false;
  return table === "orders" ? row.channel === "storefront" : row.source === "storefront";
}
