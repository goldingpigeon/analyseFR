import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChatPanel, type AnalyzeTabular, type ChatState } from './Chat';
import { Sidebar } from './Sidebar';
import { Quark } from './Quark';
import { pickGreeting } from '../lib/greetings';

/** Accueil après connexion : historique à gauche, message d'accueil varié et chat. */
export function HomeGreeting({
  prenom,
  email,
  onOpenWorkspace,
  chat,
  analyzeTabular,
  workspaceContext,
  onSample,
  onPreset,
  onSignOut,
}: {
  prenom: string;
  email: string;
  onOpenWorkspace: () => void;
  chat: ChatState;
  analyzeTabular: AnalyzeTabular;
  workspaceContext: string | null;
  onSample: () => void;
  onPreset: (id: string) => void;
  onSignOut: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [sideOpen, setSideOpen] = useState(true); // ordinateur : panneau visible
  const [drawer, setDrawer] = useState(false); // téléphone : panneau en tiroir
  // nouvelle phrase d'accueil à chaque nouvelle conversation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const greeting = useMemo(() => pickGreeting(prenom), [chat.epoch, prenom]);
  const greetKey = chat.epoch;
  const chatting = chat.messages.length > 0;

  const initiale = (prenom || email || '?').trim()[0]?.toUpperCase() ?? '?';
  const chips: { label: string; action: () => void }[] = [
    { label: '30 derniers jours', action: () => onPreset('30j') },
    { label: 'Depuis le 1er janvier', action: () => onPreset('ytd') },
    { label: '12 derniers mois', action: () => onPreset('12m') },
    { label: "Essayer avec l'exemple", action: onSample },
    { label: "Ouvrir l'espace de travail ↗", action: onOpenWorkspace },
  ];

  const menuIcon = (
    <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M3 5h14M3 10h14M3 15h9" />
    </svg>
  );

  return (
    <div className="landing-page flex min-h-dvh text-foam">
      {/* Historique — ordinateur */}
      <AnimatePresence initial={false}>
        {sideOpen && (
          <motion.aside
            key="side"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 288, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="sticky top-0 hidden h-dvh shrink-0 overflow-hidden border-r border-white/10 bg-black/40 backdrop-blur lg:block"
          >
            <div className="h-full w-72">
              <Sidebar chat={chat} />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Historique — téléphone */}
      <AnimatePresence>
        {drawer && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/70" onClick={() => setDrawer(false)} />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="absolute inset-y-0 left-0 w-[86%] max-w-80 border-r border-white/10 bg-[#0b0b0b]"
            >
              <Sidebar chat={chat} onClose={() => setDrawer(false)} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col px-5 sm:px-8">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-white/10 py-5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDrawer(true)}
                aria-label="Ouvrir l'historique"
                className="grid size-9 place-items-center rounded-full border border-white/15 text-mist transition hover:border-white/40 hover:text-white lg:hidden"
              >
                {menuIcon}
              </button>
              <button
                type="button"
                onClick={() => setSideOpen((o) => !o)}
                aria-label={sideOpen ? "Masquer l'historique" : "Afficher l'historique"}
                title={sideOpen ? "Masquer l'historique" : "Afficher l'historique"}
                className="hidden size-9 place-items-center rounded-full border border-white/15 text-mist transition hover:border-white/40 hover:text-white lg:grid"
              >
                {menuIcon}
              </button>
              <Quark active={false} size={28} />
            </div>
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
                  <button type="button" role="menuitem" onClick={onSignOut} className="w-full rounded-xl px-3 py-2 text-left text-sm text-white transition hover:bg-white/10">
                    Se déconnecter
                  </button>
                </motion.div>
              )}
            </div>
          </header>

          <main className={`flex flex-1 flex-col items-center py-10 sm:py-14 ${chatting ? 'justify-start' : 'justify-center'}`}>
            <div className="w-full max-w-2xl">
              <AnimatePresence mode="wait" initial={true}>
                {!chatting && (
                  <motion.div key={greetKey} exit={{ opacity: 0, y: -12, transition: { duration: 0.2 } }}>
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
                      {greeting.kicker}
                    </motion.p>
                    <motion.h1
                      className="text-center font-display text-4xl leading-tight font-medium tracking-[-0.04em] text-balance text-white sm:text-6xl"
                      initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                    >
                      {greeting.pieces.map((p, i) =>
                        p.name ? (
                          <span key={i} className="text-white/55">
                            {p.text}
                          </span>
                        ) : (
                          <span key={i}>{p.text}</span>
                        ),
                      )}
                    </motion.h1>
                  </motion.div>
                )}
              </AnimatePresence>

              <ChatPanel chat={chat} analyzeTabular={analyzeTabular} workspaceContext={workspaceContext} />

              {!chatting && (
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
              )}
            </div>
          </main>

          <footer className="flex flex-col-reverse gap-3 border-t border-white/10 py-5 text-xs text-mist sm:flex-row sm:items-center sm:justify-between">
            <span>
              <span className="text-white">tamim k.</span> · 2026
            </span>
            <span>L'espace de travail reste 100 % local.</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
