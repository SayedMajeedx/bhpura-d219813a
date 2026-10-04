/**
 * The reveal's sound, made with the browser's own audio (no files): a tick per
 * shuffled name that climbs in pitch, beeps for the countdown, and a short
 * fanfare for the winner. Browser only; where there is no audio, or sound is off,
 * every call does nothing. The audio context is made on first use, which is
 * after the person pressed Start (browsers only allow sound after a click).
 */

export type RevealAudio = {
  /** One shuffled name; `progress` goes from 0 to 1 so the pitch climbs. */
  tick: (progress: number) => void;
  /** A countdown beep; the high one marks the start of the shuffle. */
  beep: (high: boolean) => void;
  fanfare: () => void;
  close: () => void;
};

const SILENT: RevealAudio = { tick() {}, beep() {}, fanfare() {}, close() {} };

type AudioContextLike = {
  currentTime: number;
  destination: unknown;
  createOscillator: () => {
    type: string;
    frequency: { setValueAtTime: (v: number, t: number) => void };
    connect: (n: unknown) => unknown;
    start: (t: number) => void;
    stop: (t: number) => void;
  };
  createGain: () => {
    gain: {
      setValueAtTime: (v: number, t: number) => void;
      exponentialRampToValueAtTime: (v: number, t: number) => void;
    };
    connect: (n: unknown) => unknown;
  };
  close: () => Promise<void>;
};

export function createRevealAudio(enabled: boolean): RevealAudio {
  if (!enabled || typeof window === "undefined") return SILENT;
  const Ctor = (
    window as unknown as {
      AudioContext?: new () => AudioContextLike;
      webkitAudioContext?: new () => AudioContextLike;
    }
  ).AudioContext;
  const Legacy = (window as unknown as { webkitAudioContext?: new () => AudioContextLike })
    .webkitAudioContext;
  const Context = Ctor ?? Legacy;
  if (!Context) return SILENT;

  let context: AudioContextLike | null = null;
  const ctx = () => {
    if (!context) {
      try {
        context = new Context();
      } catch {
        return null;
      }
    }
    return context;
  };

  const tone = (
    frequency: number,
    delay: number,
    duration: number,
    type: string,
    volume: number,
  ) => {
    const c = ctx();
    if (!c) return;
    try {
      const start = c.currentTime + delay;
      const oscillator = c.createOscillator();
      const gain = c.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(c.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.03);
    } catch {
      // sound is a bonus; never let it break the reveal
    }
  };

  return {
    tick: (progress) =>
      tone(320 + Math.max(0, Math.min(1, progress)) * 520, 0, 0.045, "square", 0.05),
    beep: (high) => tone(high ? 880 : 520, 0, high ? 0.32 : 0.16, "sine", 0.14),
    fanfare: () => {
      // C major arpeggio, then a held chord.
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.4, "triangle", 0.13));
      [523.25, 659.25, 783.99, 1318.5].forEach((f) => tone(f, 0.42, 0.9, "triangle", 0.09));
    },
    close: () => {
      void context?.close().catch(() => undefined);
      context = null;
    },
  };
}
