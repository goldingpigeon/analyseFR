import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { askAssistant, isTabular, prepareFile, type ApiMsg, type Part } from '../lib/ai';
import { fmtBytes } from '../lib/fr';
import { Quark } from './Quark';

/* ------------------------------------------------------------ État de la conversation */

export interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  files?: { name: string; size: number }[];
  notes?: string[];
  parts?: Part[]; // ce qui a réellement été envoyé (messages utilisateur)
  status?: 'thinking' | 'streaming' | 'done' | 'error' | 'stopped';
  phase?: string;
}

/** Conservé dans App pour survivre aux allers-retours avec l'espace de travail. */
export function useChatState() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const lastContext = useRef<string | null>(null);
  return { messages, setMessages, lastContext };
}
export type ChatState = ReturnType<typeof useChatState>;

export type AnalyzeTabular = (file: File, onProgress: (pct: number) => void) => Promise<{ text: string; note?: string }>;

let seq = 0;
const uid = () => `m${Date.now().toString(36)}${seq++}`;

/* ------------------------------------------------------------ Panneau */

export function ChatPanel({
  chat,
  analyzeTabular,
  workspaceContext,
}: {
  chat: ChatState;
  analyzeTabular: AnalyzeTabular;
  workspaceContext: string | null;
}) {
  const { messages, setMessages, lastContext } = chat;
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const depth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const patch = useCallback(
    (id: string, p: Partial<ChatMsg> | ((m: ChatMsg) => Partial<ChatMsg>)) =>
      setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...(typeof p === 'function' ? p(m) : p) } : m))),
    [setMessages],
  );

  // défilement vers la dernière réponse
  const last = messages[messages.length - 1];
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, last?.text.length, last?.phase]);

  // hauteur automatique du champ
  useEffect(() => {
    const t = textarea.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 220)}px`;
  }, [draft]);

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    // Copie immédiate : la liste du navigateur est vidée juste après (input.value = '').
    const picked = Array.from(list);
    setFiles((fs) => {
      const known = new Set(fs.map((f) => f.name + f.size));
      return [...fs, ...picked.filter((f) => !known.has(f.name + f.size))];
    });
  };

  const send = async () => {
    const question = draft.trim();
    if ((!question && !files.length) || busy) return;
    const attached = files;
    const userId = uid();
    const botId = uid();
    setDraft('');
    setFiles([]);
    setBusy(true);
    setMessages((ms) => [
      ...ms,
      { id: userId, role: 'user', text: question, files: attached.map((f) => ({ name: f.name, size: f.size })) },
      { id: botId, role: 'assistant', text: '', status: 'thinking', phase: attached.length ? 'Lecture des fichiers…' : 'Réflexion…' },
    ]);

    try {
      // 1. Préparer les pièces jointes
      const parts: Part[] = [];
      const notes: string[] = [];
      if (workspaceContext && workspaceContext !== lastContext.current) {
        parts.push({ text: `Contexte — résultats actuellement affichés dans l'espace de travail :\n${workspaceContext}` });
        lastContext.current = workspaceContext;
      }
      for (const f of attached) {
        if (isTabular(f)) {
          patch(botId, { phase: `Analyse de « ${f.name} »…` });
          const r = await analyzeTabular(f, (pct) => patch(botId, { phase: `Analyse de « ${f.name} »… ${pct} %` }));
          parts.push({ text: r.text });
          if (r.note) notes.push(r.note);
        } else {
          patch(botId, { phase: `Lecture de « ${f.name} »…` });
          const p = await prepareFile(f);
          parts.push(...p.parts);
          if (p.note) notes.push(p.note);
        }
      }
      parts.push({ text: question || 'Analyse ce(s) fichier(s) et résume ce qu’ils contiennent.' });
      patch(userId, { parts, notes: notes.length ? notes : undefined });
      patch(botId, { phase: 'Réflexion…' });

      // 2. Historique au format Gemini
      const history: ApiMsg[] = [];
      for (const m of messagesRef.current) {
        if (m.id === userId || m.id === botId) continue;
        if (m.role === 'user') history.push({ role: 'user', parts: m.parts ?? [{ text: m.text }] });
        else if (m.status === 'done' && m.text) history.push({ role: 'model', parts: [{ text: m.text }] });
      }
      // Gemini veut une alternance utilisateur / modèle : on fusionne les messages utilisateur consécutifs
      history.push({ role: 'user', parts });
      for (let i = history.length - 1; i > 0; i--) {
        if (history[i].role === history[i - 1].role) {
          history[i - 1] = { role: history[i].role, parts: [...history[i - 1].parts, ...history[i].parts] };
          history.splice(i, 1);
        }
      }

      // 3. Réponse en flux
      abort.current = new AbortController();
      await askAssistant(
        history,
        (delta) => patch(botId, (m) => ({ text: m.text + delta, status: 'streaming' })),
        abort.current.signal,
      );
      patch(botId, (m) => ({ status: 'done', text: m.text || "_(L'assistant n'a rien répondu.)_" }));
    } catch (e) {
      if ((e as Error).name === 'AbortError') patch(botId, (m) => ({ status: 'stopped', text: m.text }));
      else patch(botId, { status: 'error', text: (e as Error).message });
    } finally {
      abort.current = null;
      setBusy(false);
      textarea.current?.focus();
    }
  };

  const canSend = !busy && (draft.trim().length > 0 || files.length > 0);

  return (
    <div className="w-full">
      {/* Conversation */}
      {messages.length > 0 && (
        <div className="mt-10 flex flex-col gap-6" aria-live="polite">
          {messages.map((m) => (
            <Message key={m.id} m={m} />
          ))}
          <div ref={endRef} />
        </div>
      )}

      {/* Zone de saisie */}
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
          addFiles(e.dataTransfer.files);
        }}
        className={`${messages.length ? 'sticky bottom-4 mt-8' : 'mt-10'} z-10 rounded-[1.75rem] border bg-[#0e0e0e]/95 p-3 shadow-[0_28px_100px_-40px_rgba(255,255,255,0.25)] backdrop-blur transition-colors sm:p-4 ${
          over ? 'border-white/70 bg-[#161616]' : 'border-white/15 focus-within:border-white/35'
        }`}
      >
        <AnimatePresence initial={false}>
          {files.length > 0 && (
            <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-2 flex flex-wrap gap-2 overflow-hidden px-1 pt-1">
              {files.map((f, i) => (
                <motion.li
                  key={f.name + f.size}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex max-w-full items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] py-1.5 pr-1.5 pl-3 text-xs text-white"
                >
                  <FileIcon name={f.name} />
                  <span className="max-w-[12rem] truncate">{f.name}</span>
                  <span className="text-mist">{fmtBytes(f.size)}</span>
                  <button
                    type="button"
                    aria-label={`Retirer ${f.name}`}
                    onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}
                    className="grid size-5 place-items-center rounded-full text-mist hover:bg-white/10 hover:text-white"
                  >
                    ✕
                  </button>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>

        <textarea
          ref={textarea}
          rows={messages.length ? 1 : 3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={over ? 'Lâchez vos fichiers ici…' : messages.length ? 'Répondre…' : 'Posez une question sur vos permis, ou déposez n’importe quel fichier…'}
          aria-label="Message pour l'assistant"
          className="block w-full resize-none bg-transparent px-2 pt-1.5 text-base text-white outline-none placeholder:text-mist sm:text-lg"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-2 text-sm text-mist transition hover:border-white/40 hover:text-white"
          >
            <span aria-hidden className="text-base leading-none">+</span> Joindre des fichiers
          </button>
          {busy ? (
            <button
              type="button"
              onClick={() => abort.current?.abort()}
              aria-label="Arrêter la réponse"
              title="Arrêter"
              className="grid size-10 place-items-center rounded-full border border-white/30 text-white transition hover:bg-white/10"
            >
              <span className="size-3 rounded-[3px] bg-white" />
            </button>
          ) : (
            <button
              type="button"
              onClick={send}
              disabled={!canSend}
              aria-label="Envoyer"
              title="Envoyer (Entrée)"
              className="grid size-10 place-items-center rounded-full bg-white text-black transition hover:bg-white/85 disabled:opacity-30"
            >
              <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M10 16V4M5 9l5-5 5 5" />
              </svg>
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </motion.div>
      <p className="mt-3 text-center text-[11px] leading-5 text-mist/80">
        L'assistant (Google Gemini) peut se tromper : vérifiez les chiffres importants. Les fichiers CSV et Excel de permis sont analysés sur votre appareil ;
        seuls des totaux sont envoyés. Les autres fichiers joints sont envoyés à Google.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ Messages */

function Message({ m }: { m: ChatMsg }) {
  if (m.role === 'user') {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex flex-col items-end gap-2">
        {m.files && m.files.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {m.files.map((f) => (
              <span key={f.name + f.size} className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-white">
                <FileIcon name={f.name} />
                <span className="max-w-[14rem] truncate">{f.name}</span>
                <span className="text-mist">{fmtBytes(f.size)}</span>
              </span>
            ))}
          </div>
        )}
        {m.text && <div className="max-w-[85%] rounded-3xl bg-white/[0.08] px-5 py-3 text-[15px] leading-7 whitespace-pre-wrap text-white">{m.text}</div>}
        {m.notes?.map((n) => (
          <p key={n} className="max-w-[85%] text-right text-xs text-mist">⚠ {n}</p>
        ))}
      </motion.div>
    );
  }

  const active = m.status === 'thinking' || m.status === 'streaming';
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex gap-3 sm:gap-4">
      <div className="mt-0.5 shrink-0">
        <Quark active={active} />
      </div>
      <div className="min-w-0 flex-1">
        {m.status === 'thinking' && !m.text ? (
          <p className="thinking-text pt-0.5 text-[15px]">{m.phase || 'Réflexion…'}</p>
        ) : m.status === 'error' ? (
          <p role="alert" className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{m.text}</p>
        ) : (
          <div className={`md-body ${m.status === 'streaming' ? 'is-streaming' : ''}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
            {m.status === 'stopped' && <p className="mt-2 text-xs text-mist">Réponse arrêtée.</p>}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function FileIcon({ name }: { name: string }) {
  const ext = (name.split('.').pop() || '').slice(0, 4).toUpperCase();
  return <span className="rounded-md bg-white px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-black">{ext || 'FICHIER'}</span>;
}
