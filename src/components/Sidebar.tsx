import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ChatState } from './Chat';

/** Regroupe les conversations par ancienneté, comme dans les applications de chat. */
function groupOf(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((today.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  if (days < 7) return '7 derniers jours';
  if (days < 30) return '30 derniers jours';
  return 'Plus ancien';
}

export function Sidebar({ chat, onClose }: { chat: ChatState; onClose?: () => void }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const groups: [string, typeof chat.list][] = [];
  for (const c of chat.list) {
    const g = groupOf(c.updated_at);
    const last = groups[groups.length - 1];
    if (last && last[0] === g) last[1].push(c);
    else groups.push([g, [c]]);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          disabled={chat.busy}
          onClick={() => {
            chat.startNew();
            onClose?.();
          }}
          className="flex flex-1 items-center gap-2 rounded-xl border border-white/15 px-3 py-2.5 text-sm text-white transition hover:border-white/40 hover:bg-white/[0.05] disabled:opacity-40"
        >
          <span aria-hidden className="text-base leading-none">+</span> Nouvelle conversation
        </button>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Fermer l'historique" className="grid size-10 place-items-center rounded-xl text-mist hover:bg-white/10 hover:text-white">
            ✕
          </button>
        )}
      </div>

      <nav aria-label="Conversations enregistrées" className="scroll-ocean min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {chat.historyError ? (
          <div className="m-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-mist">
            {chat.historyError}
            {chat.historyMissing && <p className="mt-2 text-white/80">Exécutez le script SQL fourni dans Supabase pour activer l'historique.</p>}
            <button type="button" onClick={chat.refresh} className="mt-2 block text-white underline decoration-white/30 underline-offset-4">
              Réessayer
            </button>
          </div>
        ) : chat.listLoading && !chat.list.length ? (
          <p className="px-3 py-2 text-xs text-mist">Chargement…</p>
        ) : !chat.list.length ? (
          <p className="px-3 py-2 text-xs leading-5 text-mist">Vos conversations apparaîtront ici. Elles sont enregistrées sur votre compte.</p>
        ) : (
          groups.map(([label, items]) => (
            <div key={label} className="mb-3">
              <p className="px-3 pt-3 pb-1.5 text-[11px] tracking-[0.14em] text-mist/80 uppercase">{label}</p>
              <ul>
                <AnimatePresence initial={false}>
                  {items.map((c) => {
                    const active = c.id === chat.convId;
                    return (
                      <motion.li
                        key={c.id}
                        layout
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
                        className={`group relative rounded-xl ${active ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]'}`}
                      >
                        {confirm === c.id ? (
                          <div className="flex items-center gap-2 px-3 py-2 text-xs">
                            <span className="flex-1 text-white">Supprimer ?</span>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirm(null);
                                chat.remove(c.id);
                              }}
                              className="rounded-lg bg-red-500/80 px-2.5 py-1 font-medium text-white hover:bg-red-500"
                            >
                              Supprimer
                            </button>
                            <button type="button" onClick={() => setConfirm(null)} className="rounded-lg px-2 py-1 text-mist hover:text-white">
                              Annuler
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={chat.busy}
                              onClick={() => {
                                chat.open(c.id);
                                onClose?.();
                              }}
                              title={c.title}
                              aria-current={active ? 'true' : undefined}
                              className={`block w-full truncate rounded-xl py-2 pr-10 pl-3 text-left text-sm transition-colors disabled:opacity-50 ${active ? 'text-white' : 'text-mist group-hover:text-white'}`}
                            >
                              {c.title}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirm(c.id)}
                              disabled={chat.busy}
                              aria-label={`Supprimer « ${c.title} »`}
                              title="Supprimer"
                              className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-mist opacity-100 transition hover:bg-white/10 hover:text-red-300 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                            >
                              <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" />
                              </svg>
                            </button>
                          </>
                        )}
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </div>
          ))
        )}
      </nav>
    </div>
  );
}
