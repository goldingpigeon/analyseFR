import { memo } from 'react';

/** Bulles très lentes et discrètes. Positions fixes (pas d'aléatoire au rendu). */
const BUBBLES = Array.from({ length: 16 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 999 + n) + 1) / 2);
  return {
    left: `${Math.round(r(1) * 100)}%`,
    size: 6 + Math.round(r(2) * 22),
    duration: 22 + Math.round(r(3) * 26),
    delay: -Math.round(r(4) * 40),
    dx: `${Math.round((r(5) - 0.5) * 80)}px`,
    o: (0.15 + r(6) * 0.3).toFixed(2),
  };
});

export const Bubbles = memo(function Bubbles() {
  return (
    <div className="bubbles pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {BUBBLES.map((b, i) => (
        <span
          key={i}
          className="bubble"
          style={{
            left: b.left,
            width: b.size,
            height: b.size,
            animationDuration: `${b.duration}s`,
            animationDelay: `${b.delay}s`,
            ['--dx' as string]: b.dx,
            ['--o' as string]: b.o,
          }}
        />
      ))}
    </div>
  );
});
