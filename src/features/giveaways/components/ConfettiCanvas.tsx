import { useEffect, useRef } from "react";
import { seededRandom } from "../lib/draw";
import { spawnBurst, stepParticles, type Particle } from "../lib/confetti";

/** The theme's own colours, so the confetti matches the store's look in light and dark. */
function themeColors(): string[] {
  if (typeof document === "undefined") return ["white"];
  const style = getComputedStyle(document.documentElement);
  const names = ["--primary-foreground", "--warning", "--success", "--accent", "--foreground"];
  const colors = names.map((name) => style.getPropertyValue(name).trim()).filter(Boolean);
  return colors.length > 0 ? colors : ["white"];
}

/**
 * Confetti over the stage. Each time `burst` changes (and is above 0), cannons at
 * the bottom corners and centre throw a burst. Nothing is drawn when `disabled`
 * (less motion) or when the browser has no canvas.
 */
export function ConfettiCanvas({
  burst,
  seed,
  disabled,
}: {
  burst: number;
  seed: string;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const frame = useRef<number | null>(null);
  const last = useRef(0);

  useEffect(() => {
    if (disabled || burst <= 0) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext?.("2d");
    if (!canvas || !context) return;

    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const random = seededRandom(`${seed}:confetti:${burst}`);
    const colors = themeColors();
    particles.current.push(
      ...spawnBurst(110, { x: width * 0.12, y: height }, colors, random, Math.PI * 0.55),
      ...spawnBurst(110, { x: width * 0.88, y: height }, colors, random, Math.PI * 0.55),
      ...spawnBurst(90, { x: width * 0.5, y: height * 0.9 }, colors, random, Math.PI * 0.7),
    );

    const draw = (now: number) => {
      const dt = Math.min(0.05, last.current ? (now - last.current) / 1000 : 0.016);
      last.current = now;
      particles.current = stepParticles(particles.current, dt, height);
      context.clearRect(0, 0, width, height);
      for (const p of particles.current) {
        context.save();
        context.translate(p.x, p.y);
        context.rotate(p.rotation);
        context.fillStyle = p.color;
        context.globalAlpha = Math.max(0, Math.min(1, 1 - (p.age - 4.5) / 1.5));
        if (p.shape === "dot") {
          context.beginPath();
          context.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
          context.fill();
        } else {
          context.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        context.restore();
      }
      if (particles.current.length > 0) frame.current = requestAnimationFrame(draw);
      else {
        frame.current = null;
        last.current = 0;
        context.clearRect(0, 0, width, height);
      }
    };
    if (frame.current === null) frame.current = requestAnimationFrame(draw);
  }, [burst, seed, disabled]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full"
    />
  );
}
