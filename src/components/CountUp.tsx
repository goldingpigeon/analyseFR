import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { fmtInt } from '../lib/fr';

/** Compteur qui monte jusqu'à la valeur (requestAnimationFrame, easing doux). */
export function CountUp({ value, duration = 1000 }: { value: number; duration?: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (reduce) {
      setShown(value);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (value - from) * eased);
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = value;
    };
  }, [value, duration, reduce]);

  return <span className="tabular-nums">{fmtInt(shown)}</span>;
}
