import { motion } from 'framer-motion';

export function Header() {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pt-6 sm:pt-10">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      >
        <h1 className="font-display text-3xl leading-tight font-semibold sm:text-5xl">
          <span className="glow-text-aqua text-aqua">Permis</span> de construire
        </h1>
        <p className="mt-2 max-w-xl text-sm text-mist sm:text-base">
          Déposez les fichiers officiels, choisissez une période, obtenez les codes communes et les dates
          d'autorisation. Tout reste sur votre ordinateur.
        </p>
      </motion.div>
      <motion.div
        className="flex items-baseline gap-2 font-display"
        initial={{ opacity: 0, scale: 0.8, rotate: -4 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.15 }}
      >
        <span className="glow-text-coral text-2xl font-semibold text-coral sm:text-3xl">tamim k.</span>
        <span className="rounded-full border border-aqua/30 bg-aqua/10 px-2.5 py-0.5 text-xs font-medium text-aqua-soft">
          2026 edition
        </span>
      </motion.div>
    </header>
  );
}
