import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChatPanel, type AnalyzeTabular, type ChatState } from './Chat';

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
  const chatting = chat.messages.length > 0;

  const initiale = (prenom || email || '?').trim()[0]?.toUpperCase() ?? '?';
  const chips: { label: string; action: () => void }[] = [
    { label: '30 derniers jours', action: () => onPreset('30j') },
    { label: 'Depuis le 1er janvier', action: () => onPreset('ytd') },
    { label: '12 derniers mois', action: () => onPreset('12m') },
    { label: "Essayer avec l'exemple", action: onSample },
    { label: "Ouvrir l'espace de travail ↗", action: onOpenWorkspace },
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

        <main className={`flex flex-1 flex-col items-center py-14 ${chatting ? 'justify-start' : 'justify-center'}`}>
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
  );
}
