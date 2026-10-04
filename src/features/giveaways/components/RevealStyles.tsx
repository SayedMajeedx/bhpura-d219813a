/**
 * The reveal's animations. They live here, scoped by a `ga-` prefix, because the
 * app's main stylesheet is frozen at its size limit. Less motion turns them off.
 */
const CSS = `
@keyframes ga-pop {
  0% { transform: scale(.25); opacity: 0; }
  55% { transform: scale(1.14); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes ga-slot {
  0% { transform: translateY(-38%); opacity: 0; filter: blur(5px); }
  100% { transform: translateY(0); opacity: 1; filter: blur(0); }
}
@keyframes ga-rise {
  from { transform: translateY(5cqw); opacity: 0; }
  to { transform: none; opacity: 1; }
}
@keyframes ga-ring {
  0% { transform: scale(.55); opacity: .65; }
  100% { transform: scale(1.9); opacity: 0; }
}
@keyframes ga-glow {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in oklch, var(--primary-foreground) 35%, transparent); }
  50% { box-shadow: 0 0 6cqw 1.2cqw color-mix(in oklch, var(--primary-foreground) 35%, transparent); }
}
@keyframes ga-float {
  0%, 100% { transform: translateY(0) rotate(-3deg); }
  50% { transform: translateY(-1.2cqw) rotate(3deg); }
}
.ga-pop { animation: ga-pop .75s cubic-bezier(.2, 1.25, .3, 1) both; }
.ga-slot { animation: ga-slot 150ms ease-out both; }
.ga-rise { animation: ga-rise .8s cubic-bezier(.2, .8, .2, 1) both; }
.ga-ring { animation: ga-ring 1s ease-out infinite; }
.ga-glow { animation: ga-glow 1.8s ease-in-out infinite; }
.ga-float { animation: ga-float 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .ga-pop, .ga-slot, .ga-rise, .ga-ring, .ga-glow, .ga-float { animation: none !important; }
}
`;

export function RevealStyles() {
  return <style>{CSS}</style>;
}
