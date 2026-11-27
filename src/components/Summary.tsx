import { motion } from 'framer-motion';
import { CountUp } from './CountUp';
import { fmtDate } from '../lib/fr';

export function Summary({ total, communes, latest }: { total: number; communes: number; latest: number }) {
  const cards = [
    { label: total > 1 ? 'permis trouvés' : 'permis trouvé', value: <CountUp value={total} />, color: 'text-aqua glow-text-aqua' },
    { label: communes > 1 ? 'communes distinctes' : 'commune distincte', value: <CountUp value={communes} />, color: 'text-coral glow-text-coral' },
    { label: 'permis le plus récent', value: fmtDate(latest), color: 'text-sun' },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      {cards.map((c, i) => (
        <motion.div
          key={c.label}
          initial={{ opacity: 0, y: 18, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 20, delay: i * 0.08 }}
          className="card px-5 py-4"
        >
          <div className={`font-display text-3xl font-semibold sm:text-4xl ${c.color}`}>{c.value}</div>
          <div className="mt-1 text-sm text-mist">{c.label}</div>
        </motion.div>
      ))}
    </div>
  );
}
