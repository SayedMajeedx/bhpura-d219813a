/**
 * Confetti physics, with no drawing: a burst of particles and a step that moves
 * them. The canvas component draws what these return. Pure, so the same random
 * source gives the same burst.
 */

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  size: number;
  color: string;
  /** "rect" strips and "dot" circles. */
  shape: "rect" | "dot";
  /** Seconds the particle has lived. */
  age: number;
};

/** A burst thrown upward and outward from a point, as a cannon would. */
export function spawnBurst(
  count: number,
  origin: { x: number; y: number },
  colors: string[],
  random: () => number,
  spread = Math.PI * 0.9,
): Particle[] {
  const palette = colors.length > 0 ? colors : ["white"];
  return Array.from({ length: count }, () => {
    // Up is -y; the cone is centred on straight up.
    const angle = -Math.PI / 2 + (random() - 0.5) * spread;
    const speed = 380 + random() * 720;
    return {
      x: origin.x,
      y: origin.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotation: random() * Math.PI * 2,
      spin: (random() - 0.5) * 18,
      size: 7 + random() * 9,
      color: palette[Math.floor(random() * palette.length)],
      shape: random() < 0.7 ? "rect" : "dot",
      age: 0,
    };
  });
}

/** Moves every particle by `dt` seconds and drops the ones that fell off the bottom or are old. */
export function stepParticles(
  particles: Particle[],
  dt: number,
  height: number,
  gravity = 1500,
  drag = 0.55,
  maxAge = 6,
): Particle[] {
  const alive: Particle[] = [];
  for (const p of particles) {
    const next: Particle = {
      ...p,
      vx: p.vx * Math.max(0, 1 - drag * dt),
      vy: p.vy * Math.max(0, 1 - drag * dt) + gravity * dt,
      age: p.age + dt,
      rotation: p.rotation + p.spin * dt,
      x: 0,
      y: 0,
    };
    next.x = p.x + next.vx * dt;
    next.y = p.y + next.vy * dt;
    if (next.y < height + 40 && next.age < maxAge) alive.push(next);
  }
  return alive;
}
