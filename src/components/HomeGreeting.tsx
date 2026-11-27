import { useRef, useState } from 'react';
import { motion } from 'framer-motion';

const ACCEPT = /\.(csv|txt|xlsx|xls|xlsm)$/i;

function salutation(d = new Date()): string {
  const h = d.getHours();
  return h >= 5 && h < 18 ? 'Bonjour' : 'Bonsoir';
}

const dateLongue = () =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

/** Accueil après connexion : un grand « Quoi de neuf ? » et une zone pour commencer tout de suite. */
export function HomeGreeting({
  prenom,
  email,
  onOpenWorkspace,
  onFiles,
  onSample,
  onPreset,
  onSignOut,
}: {
  prenom: string;
  email: string;
  onOpenWorkspace: () => void;
  onFiles: (files: File[], rejected: string[]) => void;
  onSample: () => void;
  onPreset: (id: string) => void;
  onSignOut: () => void;
}) {
  const [over, setOver] = useState(false);
  const [menu, setMenu] = useState(false);
  const depth = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  const take = (list: FileList | null) => {
    if (!list?.length) return;
    const all = Array.from(list);
    onFiles(all.filter((f) => ACCEPT.test(f.name)), all.filter((f) => !ACCEPT.test(f.name)).map((f) => f.name));
  };

  const initiale = (prenom || email || '?').trim()[0]?.toUpperCase() ?? '?';
  const chips: { label: string; action: () => void }[] = [
    { label: '30 derniers jours', action: () => onPreset('30j') },
    { label: 'Depuis le 1er janvier', action: () => onPreset('ytd') },
    { label: '12 derniers mois', action: () => onPreset('12m') },
    { label: "Essayer avec l'exemple", action: onSample },
  ];

  return (
    <div className="landing-page min-h-dvh px-5 text-foam sm:px-8">
      <div className="mx-auto flex min-h-dvh max-w-7xl flex-col">
        <header className="flex items-center justify-between border-b border-white/10 py-5">
          <span className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full border border-white/25 text-xs font-semibold tracking-widest">01</span>
            <span className="font-display text-sm font-medium tracking-[0.16em] text-white">DONNÉES / LOCALES</span>
          </span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              aria-expanded={menu}
              aria-haspopup="menu"
              className="flex items-center gap-3 rounded-full border border-white/15 py-1 pr-4 pl-1 text-sm text-white transition hover:border-white/40"
            >
              <span className="grid size-8 place-items-center rounded-full bg-white font-semibold text-black">{initiale}</span>
              <span className="max-w-[10rem] truncate">{prenom || email}</span>
            </button>
            {menu && (
              <motion.div
                role="menu"
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-white/15 bg-[#101010] p-2 shadow-2xl"
              >
                <p className="truncate px-3 py-2 text-xs text-mist">{email}</p>
                <button
                  type="button"
                  role="menuitem"
                  onClick={onSignOut}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-white transition hover:bg-white/10"
                >
                  Se déconnecter
                </button>
              </motion.div>
            )}
          </div>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center py-14">
          <div className="w-full max-w-2xl">
            <motion.p
              className="mb-4 flex items-center justify-center gap-3 text-xs tracking-[0.2em] text-mist uppercase"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <motion.span
                className="size-1.5 rounded-full bg-white"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              />
              {salutation()} · {dateLongue()}
            </motion.p>
            <motion.h1
              className="text-center font-display text-4xl leading-tight font-medium tracking-[-0.04em] text-white sm:text-6xl"
              initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            >
              Quoi de neuf{prenom ? <>, <span className="text-white/55">{prenom}</span></> : ''}{' '}?
            </motion.h1>

            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
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
              className={`mt-10 rounded-[1.75rem] border bg-[#0e0e0e]/90 p-4 shadow-[0_28px_100px_-40px_rgba(255,255,255,0.25)] backdrop-blur transition-colors sm:p-5 ${
                over ? 'border-white/70 bg-white/[0.06]' : 'border-white/15'
              }`}
            >
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="block min-h-24 w-full cursor-pointer rounded-2xl px-2 pt-2 text-left text-base text-mist transition hover:text-white sm:text-lg"
              >
                {over ? 'Lâchez le fichier pour commencer…' : 'Déposez un fichier CSV ou Excel ici, ou cliquez pour le choisir…'}
              </button>
              <div className="mt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  className="flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-2 text-sm text-mist transition hover:border-white/40 hover:text-white"
                >
                  <span aria-hidden className="text-base leading-none">+</span> Ajouter des fichiers
                </button>
                <button
                  type="button"
                  onClick={onOpenWorkspace}
                  aria-label="Ouvrir l'espace de travail"
                  title="Ouvrir l'espace de travail"
                  className="grid size-10 place-items-center rounded-full bg-white text-black transition hover:bg-white/85"
                >
                  <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 10h12M11 5l5 5-5 5" />
                  </svg>
                </button>
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

            <motion.div
              className="mt-5 flex flex-wrap justify-center gap-2"
              initial="hide"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.06, delayChildren: 0.5 } } }}
            >
              {chips.map((c) => (
                <motion.button
                  key={c.label}
                  type="button"
                  onClick={c.action}
                  variants={{ hide: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  className="rounded-full border border-white/12 bg-white/[0.03] px-4 py-2 text-sm text-mist transition-colors hover:border-white/35 hover:text-white"
                >
                  {c.label}
                </motion.button>
              ))}
            </motion.div>
          </div>
        </main>

        <footer className="flex flex-col-reverse gap-3 border-t border-white/10 py-5 text-xs text-mist sm:flex-row sm:items-center sm:justify-between">
          <span>
            <span className="text-white">tamim k.</span> · 2026
          </span>
          <span>Vos fichiers restent sur votre appareil.</span>
        </footer>
      </div>
    </div>
  );
}
