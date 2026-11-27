import { motion } from 'framer-motion';

export function Header({ onHome }: { onHome: () => void }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pt-6 sm:pt-10">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      >
        <p className="text-xs tracking-[0.18em] text-mist uppercase">Local data workspace</p>
        <h1 className="mt-2 font-display text-3xl leading-tight font-medium tracking-tight text-white sm:text-5xl">
          Explore your files
        </h1>
        <p className="mt-2 max-w-xl text-sm text-mist sm:text-base">
          Déposez vos fichiers, choisissez une période et exportez les résultats. Tout reste sur votre ordinateur.
        </p>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <button
          type="button"
          onClick={onHome}
          className="rounded-full border border-white/20 px-4 py-2 text-sm text-mist transition hover:border-white/50 hover:text-white"
        >
          ← Home
        </button>
      </motion.div>
    </header>
  );
}
