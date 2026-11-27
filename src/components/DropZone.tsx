import { useRef, useState } from 'react';
import { motion } from 'framer-motion';

const ACCEPT = /\.(csv|txt|xlsx|xls|xlsm)$/i;

export function DropZone({ onFiles, compact }: { onFiles: (files: File[], rejected: string[]) => void; compact: boolean }) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  const take = (list: FileList | null) => {
    if (!list) return;
    const all = Array.from(list);
    onFiles(all.filter((f) => ACCEPT.test(f.name)), all.filter((f) => !ACCEPT.test(f.name)).map((f) => f.name));
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label="Déposez votre fichier CSV ici ou cliquez pour choisir"
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current++;
        setOver(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        take(e.dataTransfer.files);
      }}
      animate={{ scale: over ? 1.015 : 1 }}
      whileHover={{ scale: over ? 1.015 : 1.006 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={`group relative isolate cursor-pointer outline-none ${compact ? 'py-7' : 'py-14 sm:py-20'}`}
    >
      {/* halo : opacité/transform uniquement */}
      <div
        className={`absolute -inset-1 -z-10 rounded-[2rem] bg-gradient-to-r from-aqua/40 via-aqua-soft/30 to-coral/40 blur-xl ${
          over ? 'drop-glow' : 'drop-idle'
        }`}
      />
      <div
        className={`absolute inset-0 -z-10 rounded-[1.75rem] border-2 border-dashed transition-colors duration-300 ${
          over ? 'border-aqua bg-aqua/10' : 'border-aqua/30 bg-deep/80 group-hover:border-aqua/60 group-focus-visible:border-aqua'
        }`}
      />
      <div className="flex flex-col items-center gap-3 px-6 text-center">
        <motion.div
          animate={over ? { y: [0, -8, 0], rotate: [0, -6, 6, 0] } : { y: 0, rotate: 0 }}
          transition={over ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } : { type: 'spring' }}
          className={`grid place-items-center rounded-full bg-aqua/15 text-aqua ${compact ? 'h-12 w-12' : 'h-16 w-16 sm:h-20 sm:w-20'}`}
        >
          <svg viewBox="0 0 24 24" className={compact ? 'h-6 w-6' : 'h-8 w-8 sm:h-10 sm:w-10'} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4" />
            <path d="m6 10 6 6 6-6" />
            <path d="M4 20c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 4-1.5" />
          </svg>
        </motion.div>
        <p className={`font-display font-semibold ${compact ? 'text-lg' : 'text-2xl sm:text-3xl'}`}>
          {over ? 'Lâchez, on plonge !' : 'Déposez votre fichier CSV ici'}
        </p>
        <p className="text-sm text-mist">
          ou <span className="text-aqua underline decoration-aqua/40 underline-offset-4">cliquez pour choisir</span> · CSV ou
          Excel (.xlsx) · plusieurs fichiers possibles
        </p>
        {!compact && (
          <p className="text-xs text-mist/70">Les fichiers sont lus dans votre navigateur. Rien n'est envoyé sur internet.</p>
        )}
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept=".csv,.txt,.xlsx,.xls,.xlsm,text/csv"
        className="hidden"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = '';
        }}
      />
    </motion.div>
  );
}
