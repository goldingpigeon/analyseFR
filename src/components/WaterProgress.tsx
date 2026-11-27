import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';
import type { Progress } from '../lib/types';
import { fmtBytes, fmtInt } from '../lib/fr';
import { SpringButton } from './SpringButton';

/** Barre qui « coule comme de l'eau » : largeur via scaleX (GPU), vague + reflet animés en transform. */
export function WaterProgress({ p, fileName, onCancel }: { p: Progress; fileName: string; onCancel: () => void }) {
  const ratio = p.bytesTotal ? Math.min(1, p.bytesDone / p.bytesTotal) : 0;
  const spring = useSpring(0, { stiffness: 60, damping: 20, mass: 0.6 });
  useEffect(() => spring.set(ratio), [ratio, spring]);
  const pct = useTransform(spring, (v) => `${Math.round(v * 100)} %`);

  return (
    <div className="card p-4 sm:p-6" role="status" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">Exploration en cours…</h2>
        <motion.span className="font-display text-2xl font-semibold text-aqua tabular-nums">{pct}</motion.span>
      </div>
      <p className="mt-1 truncate text-xs text-mist">
        {fileName} · {fmtBytes(p.bytesDone)} sur {fmtBytes(p.bytesTotal)}
      </p>

      <div className="relative mt-4 h-5 overflow-hidden rounded-full bg-abyss/80 ring-1 ring-aqua/15">
        <motion.div className="absolute inset-0 origin-left overflow-hidden rounded-full" style={{ scaleX: spring }}>
          <div className="absolute inset-0 bg-gradient-to-r from-[#1b8fb8] via-aqua to-aqua-soft" />
          {/* vague */}
          <div className="water-wave absolute inset-y-0 left-0 w-[200%] opacity-40">
            <svg viewBox="0 0 200 20" preserveAspectRatio="none" className="h-full w-full">
              <path d="M0 10 Q 12.5 2 25 10 T 50 10 T 75 10 T 100 10 T 125 10 T 150 10 T 175 10 T 200 10 V20 H0Z" fill="rgba(255,255,255,0.35)" />
            </svg>
          </div>
          {/* reflet */}
          <div className="water-shimmer absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        </motion.div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-6 text-sm">
          <div>
            <div className="text-mist">Lignes parcourues</div>
            <div className="font-display text-lg font-semibold tabular-nums">{fmtInt(p.scanned)}</div>
          </div>
          <div>
            <div className="text-mist">Permis trouvés</div>
            <div className="font-display text-lg font-semibold text-coral tabular-nums">{fmtInt(p.matched)}</div>
          </div>
        </div>
        <SpringButton variant="ghost" onClick={onCancel}>
          Arrêter
        </SpringButton>
      </div>
    </div>
  );
}
