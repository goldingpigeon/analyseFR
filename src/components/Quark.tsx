import { useId } from 'react';
import { useReducedMotion } from 'framer-motion';

/** Petit « quark » : un noyau et trois particules en orbite.
 *  Il tourne pendant que l'assistant réfléchit / écrit, puis se pose. */
export function Quark({ active, size = 26 }: { active: boolean; size?: number }) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const moving = active && !reduce;
  const orbits = [0, 60, 120];
  const speeds = ['1.6s', '2.1s', '1.3s'];
  return (
    <svg
      viewBox="-14 -14 28 28"
      width={size}
      height={size}
      aria-hidden
      className={moving ? 'quark-spin' : ''}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <radialGradient id={`${uid}-core`}>
          <stop offset="0%" stopColor="#fff" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0.55" />
        </radialGradient>
      </defs>
      {orbits.map((a, i) => (
        <g key={a} transform={`rotate(${a})`}>
          <path id={`${uid}-orbit-${i}`} d="M -11 0 a 11 4.2 0 1 0 22 0 a 11 4.2 0 1 0 -22 0" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.8" />
          <circle r="1.7" fill="#fff" cx={moving ? 0 : [11, -11, 0][i]} cy={moving ? 0 : [0, 0, 4.2][i]}>
            {moving && (
              <animateMotion dur={speeds[i]} repeatCount="indefinite" begin={`${-i * 0.4}s`}>
                <mpath href={`#${uid}-orbit-${i}`} />
              </animateMotion>
            )}
          </circle>
        </g>
      ))}
      <circle r="3" fill={`url(#${uid}-core)`} className={moving ? 'quark-pulse' : ''} />
    </svg>
  );
}
