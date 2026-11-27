import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, MotionConfig } from 'framer-motion';
import { Bubbles } from './components/Bubbles';
import { Header } from './components/Header';
import { DropZone } from './components/DropZone';
import { FileCard, type FileEntry } from './components/FileCard';
import { defaultFilters, FiltersPanel, PRESETS, type FilterState } from './components/FiltersPanel';
import { AuthDialog, type AuthMode } from './components/AuthDialog';
import { HomeGreeting } from './components/HomeGreeting';
import { useChatState, type AnalyzeTabular } from './components/Chat';
import { statsForAI } from './lib/aiContext';
import { fileAsText } from './lib/ai';
import { fmtBytes } from './lib/fr';
import { firstName, signOut, useSession } from './lib/auth';
import { WaterProgress } from './components/WaterProgress';
import { Summary } from './components/Summary';
import { SpringButton } from './components/SpringButton';
import {
  computeGroups, ResultsTable, useGroupOrder, useListOrder,
  type Dir, type GroupKey, type ListKey, type View,
} from './components/ResultsTable';
import { exportGroups, exportList } from './lib/export';
import { fmtInt, plural } from './lib/fr';
import { isoToDateInt, parseCodeList } from './lib/normalize';
import type { InspectResult, Mapping, Progress, Results, SearchFile, WorkerIn, WorkerOut } from './lib/types';

const SAMPLE_URL = `${import.meta.env.BASE_URL}exemple-permis.csv`;

let nextId = 1;

export default function App() {
  const workerRef = useRef<Worker | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [notice, setNotice] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [runId, setRunId] = useState(0);
  const [view, setView] = useState<View>('list');
  const [details, setDetails] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('connexion');
  const { session, recovery, endRecovery } = useSession();
  const chat = useChatState();
  // Demandes du chat envoyées au même module de lecture que l'espace de travail
  const pendingInspect = useRef(new Map<string, (r: InspectResult) => void>());
  const pendingSearch = useRef(
    new Map<string, { resolve: (r: Results) => void; reject: (e: Error) => void; onProgress: (pct: number) => void }>(),
  );
  const [listSort, setListSort] = useState<{ key: ListKey; dir: Dir }>({ key: 'date', dir: 'desc' });
  const [groupSort, setGroupSort] = useState<{ key: GroupKey; dir: Dir }>({ key: 'latest', dir: 'desc' });
  const resultsRef = useRef<HTMLDivElement>(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  /* ---------------- Worker */
  const send = (m: WorkerIn) => workerRef.current?.postMessage(m);

  useEffect(() => {
    const w = new Worker(new URL('./worker/parser.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = w;
    w.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      // Réponses destinées au chat
      if (m.type === 'inspected' && pendingInspect.current.has(m.id)) {
        pendingInspect.current.get(m.id)!(m);
        pendingInspect.current.delete(m.id);
        return;
      }
      if (m.type !== 'inspected' && m.reqId) {
        const p = pendingSearch.current.get(m.reqId);
        if (!p) return;
        if (m.type === 'progress') p.onProgress(Math.round((100 * m.bytesDone) / (m.bytesTotal || 1)));
        else {
          pendingSearch.current.delete(m.reqId);
          if (m.type === 'done') {
            const { type: _t, reqId: _r, ...res } = m;
            p.resolve(res);
          } else p.reject(new Error(m.type === 'error' ? m.message : 'Analyse arrêtée.'));
        }
        return;
      }
      switch (m.type) {
        case 'inspected':
          setFiles((fs) =>
            fs.map((f) => (f.id === m.id ? { ...f, status: m.error ? 'error' : 'ready', info: m, mapping: m.mapping } : f)),
          );
          break;
        case 'progress':
          setProgress(m);
          break;
        case 'done': {
          const { type: _t, reqId: _r, ...r } = m;
          setResults(r);
          setRunId((x) => x + 1);
          setRunning(false);
          setProgress(null);
          requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
          break;
        }
        case 'cancelled':
          setRunning(false);
          setProgress(null);
          setNotice('Recherche arrêtée.');
          break;
        case 'error':
          setRunning(false);
          setProgress(null);
          setNotice(m.message);
          break;
      }
    };
    w.onerror = () => {
      setRunning(false);
      setNotice("Le module de lecture s'est arrêté de façon inattendue. Rechargez la page.");
    };
    return () => w.terminate();
  }, []);

  /* ---------------- Fichiers */
  const addFiles = useCallback((list: File[], rejected: string[] = []) => {
    setNotice(rejected.length ? `Format non pris en charge : ${rejected.join(', ')} (CSV ou .xlsx uniquement).` : null);
    const known = new Set(filesRef.current.map((f) => `${f.file.name}|${f.file.size}`));
    const fresh: FileEntry[] = list
      .filter((file) => !known.has(`${file.name}|${file.size}`))
      .map((file) => ({ id: `f${nextId++}`, file, status: 'inspecting', mapping: {} }));
    if (!fresh.length) return;
    fresh.forEach((e) => send({ type: 'inspect', id: e.id, file: e.file }));
    setFiles((fs) => [...fs, ...fresh]);
  }, []);

  const loadSample = async () => {
    try {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      addFiles([new File([blob], 'exemple-permis-logements.csv', { type: 'text/csv' })]);
    } catch {
      setNotice("Impossible de charger le fichier d'exemple.");
    }
  };

  const ready = files.filter((f) => f.status === 'ready' && f.mapping.commune != null && f.mapping.date != null);
  const needsColumns = files.some((f) => f.status === 'ready' && (f.mapping.commune == null || f.mapping.date == null));
  const inspecting = files.some((f) => f.status === 'inspecting');

  /* ---------------- Recherche */
  const launch = () => {
    setFilterError(null);
    setNotice(null);
    const from = isoToDateInt(filters.from);
    const to = isoToDateInt(filters.to);
    if (from && to && from > to) {
      setFilterError('La date de début doit précéder la date de fin.');
      return;
    }
    const communes = parseCodeList(filters.communes, 'commune');
    const bad = communes.filter((c) => !/^(\d{5}|2[AB]\d{3})$/.test(c));
    if (bad.length) {
      setFilterError(`Code commune invalide : ${bad.join(', ')} (5 caractères, ex. 12145).`);
      return;
    }
    const deps = parseCodeList(filters.deps, 'dep');
    const payload: SearchFile[] = ready.map((f) => ({
      file: f.file,
      format: f.info!.format,
      mapping: f.mapping,
      encoding: f.info!.encoding,
      delimiter: f.info!.delimiter,
      label: f.info!.kind !== 'Autre' ? f.info!.kind : f.file.name,
    }));
    setRunning(true);
    setProgress({ bytesDone: 0, bytesTotal: payload.reduce((s, f) => s + f.file.size, 0), scanned: 0, matched: 0, fileIndex: 0 });
    send({ type: 'search', files: payload, filters: { from, to, communes, deps } });
  };

  /* ---------------- Résultats */
  const empty: Results = useMemo(
    () => ({ code: [], date: new Int32Array(), file: new Uint8Array(), num: [], dem: [], siren: [], lgt: new Float64Array(), surf: new Float64Array(), labels: [], scanned: 0, matched: 0, truncated: false, ms: 0 }),
    [],
  );
  const r = results || empty;
  const listOrder = useListOrder(r, listSort.key, listSort.dir);
  const groups = useMemo(() => computeGroups(r), [r]);
  const groupOrder = useGroupOrder(groups, groupSort.key, groupSort.dir);
  const latest = useMemo(() => {
    let m = 0;
    for (let i = 0; i < r.date.length; i++) if (r.date[i] > m) m = r.date[i];
    return m;
  }, [r]);

  const toggleSort = <K extends string>(cur: { key: K; dir: Dir }, key: K, numericFirstDesc: boolean) =>
    cur.key === key ? { key, dir: cur.dir === 'desc' ? 'asc' : 'desc' as Dir } : { key, dir: (numericFirstDesc ? 'desc' : 'asc') as Dir };

  const doExport = () => {
    const tag = [filters.from, filters.to].filter(Boolean).join('_au_') || 'toutes-dates';
    if (view === 'list') exportList(r, listOrder, `permis_${tag}.csv`);
    else exportGroups(groups.codes, groups.counts, groups.latest, groupOrder, `permis_par_commune_${tag}.csv`);
  };

  const runningName = progress && ready[progress.fileIndex] ? ready[progress.fileIndex].file.name : '';

  /** Analyse locale d'un fichier de permis pour l'assistant : seuls des totaux en sortent. */
  const analyzeTabular: AnalyzeTabular = async (file, onProgress) => {
    const id = `ai-i${nextId++}`;
    const info = await new Promise<InspectResult>((resolve) => {
      pendingInspect.current.set(id, resolve);
      send({ type: 'inspect', id, file });
    });
    if (info.error) return { text: `Fichier « ${file.name} » : illisible (${info.error}).`, note: info.error };
    const m = info.mapping;
    if (m.commune == null || m.date == null) {
      if (info.format === 'csv') {
        const p = await fileAsText(file);
        return { text: p.parts.map((x) => ('text' in x ? x.text : '')).join('\n'), note: p.note };
      }
      const preview = [info.headers, ...info.sample].map((r) => r.join(' ; ')).join('\n');
      return {
        text: `Fichier Excel « ${file.name} » (${fmtBytes(file.size)}), qui n'est pas une liste de permis reconnue. Colonnes et premières lignes :\n${preview}`,
        note: `« ${file.name} » : seules les premières lignes sont envoyées à l'assistant.`,
      };
    }
    const reqId = `ai-s${nextId++}`;
    const r = await new Promise<Results>((resolve, reject) => {
      pendingSearch.current.set(reqId, { resolve, reject, onProgress });
      send({
        type: 'search',
        reqId,
        files: [{ file, format: info.format, mapping: m, encoding: info.encoding, delimiter: info.delimiter, label: info.kind !== 'Autre' ? info.kind : file.name }],
        filters: { from: 0, to: 0, communes: [], deps: [] },
      });
    });
    return { text: statsForAI(r, `Fichier « ${file.name} » (${info.kind}, ${fmtBytes(file.size)}) : toutes dates, toutes communes.`) };
  };

  const workspaceContext = useMemo(
    () =>
      results
        ? statsForAI(
            results,
            `Recherche de l'espace de travail (du ${filters.from || 'début'} au ${filters.to || "aujourd'hui"} ; communes : ${filters.communes || 'toutes'} ; départements : ${filters.deps || 'tous'}).`,
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results],
  );

  const authDialog = (
    <AuthDialog
      open={authOpen || recovery}
      mode={recovery ? 'nouveau' : authMode}
      onClose={() => setAuthOpen(false)}
      onDone={() => {
        setAuthOpen(false);
        endRecovery();
      }}
    />
  );

  if (!showWorkspace && session) {
    return (
      <MotionConfig reducedMotion="user">
        <HomeGreeting
          prenom={firstName(session)}
          email={session.user.email ?? ''}
          onOpenWorkspace={() => setShowWorkspace(true)}
          chat={chat}
          analyzeTabular={analyzeTabular}
          workspaceContext={workspaceContext}
          onSample={() => {
            loadSample();
            setShowWorkspace(true);
          }}
          onPreset={(id) => {
            const p = PRESETS.find((x) => x.id === id);
            if (p) {
              const [from, to] = p.range();
              setFilters((f) => ({ ...f, from, to, preset: id }));
            }
            setShowWorkspace(true);
          }}
          onSignOut={async () => {
            await signOut();
            setShowWorkspace(false);
          }}
        />
        {authDialog}
      </MotionConfig>
    );
  }

  if (!showWorkspace) {
    return (
      <MotionConfig reducedMotion="user">
        <div className="landing-page min-h-dvh overflow-hidden px-5 text-foam sm:px-8">
          <div className="mx-auto flex min-h-dvh max-w-7xl flex-col">
            <motion.header
              className="flex items-center justify-between border-b border-white/10 py-5"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <a className="flex items-center gap-3" href="#home" aria-label="Retour en haut">
                <span className="grid size-9 place-items-center rounded-full border border-white/25 text-xs font-semibold tracking-widest">01</span>
                <span className="font-display text-sm font-medium tracking-[0.16em] text-white">DONNÉES / LOCALES</span>
              </a>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-full px-4 py-2 text-sm text-mist transition hover:text-white"
                  onClick={() => {
                    setAuthMode('connexion');
                    setAuthOpen(true);
                  }}
                >
                  Se connecter
                </button>
                <button
                  type="button"
                  className="rounded-full border border-white/25 px-4 py-2 text-sm text-white transition hover:bg-white hover:text-black"
                  onClick={() => setShowWorkspace(true)}
                >
                  Ouvrir l'espace <span aria-hidden="true">↗</span>
                </button>
              </div>
            </motion.header>

            <main id="home" className="grid flex-1 items-center gap-14 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
              <div className="relative z-10">
                <motion.p
                  className="mb-6 flex items-center gap-3 text-xs font-medium tracking-[0.24em] text-mist uppercase"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <span className="size-1.5 rounded-full bg-white" />
                  Une façon plus sereine de travailler vos données
                </motion.p>
                <motion.h1
                  className="max-w-3xl font-display text-5xl leading-[0.98] font-medium tracking-[-0.06em] text-white sm:text-7xl lg:text-8xl"
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.65, delay: 0.15 }}
                >
                  Vos données.
                  <br />
                  <span className="text-white/45">En clair.</span>
                </motion.h1>
                <motion.p
                  className="mt-7 max-w-lg text-base leading-7 text-mist sm:text-lg"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.35, duration: 0.6 }}
                >
                  Filtrez les fichiers d'urbanisme, trouvez les informations utiles et exportez un résultat clair. Vos fichiers restent sur votre appareil.
                </motion.p>
                <motion.div
                  className="mt-9 flex flex-wrap items-center gap-4"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                >
                  <button
                    type="button"
                    className="group rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-black transition hover:bg-white/85"
                    onClick={() => setShowWorkspace(true)}
                  >
                    Explorer l'espace de travail <span className="ml-3 transition-transform group-hover:translate-x-1">→</span>
                  </button>
                  <span className="text-xs tracking-wide text-mist">Sans compte · 100 % local</span>
                </motion.div>
                <motion.div
                  className="mt-14 flex flex-wrap gap-x-8 gap-y-3 border-t border-white/10 pt-5 text-xs tracking-wide text-mist"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.65 }}
                >
                  <span><span className="mr-2 text-white">01</span> Déposez un fichier</span>
                  <span><span className="mr-2 text-white">02</span> Réglez vos filtres</span>
                  <span><span className="mr-2 text-white">03</span> Exportez les résultats</span>
                </motion.div>
              </div>

              <motion.div
                className="relative mx-auto w-full max-w-xl"
                initial={{ opacity: 0, scale: 0.94, rotate: 1.5 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ duration: 0.8, delay: 0.2, type: 'spring', stiffness: 90, damping: 20 }}
              >
                <div className="orbit orbit-one" aria-hidden="true" />
                <div className="orbit orbit-two" aria-hidden="true" />
                <div className="relative overflow-hidden rounded-[1.75rem] border border-white/15 bg-[#111]/90 p-5 shadow-[0_28px_100px_-40px_rgba(255,255,255,0.2)] backdrop-blur sm:p-7">
                  <div className="flex items-center justify-between border-b border-white/10 pb-5">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-full bg-white text-black">
                        <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
                          <path d="M3 5.5h14M3 10h14M3 14.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </span>
                      <div>
                        <p className="text-sm font-medium text-white">Aperçu</p>
                        <p className="mt-0.5 text-xs text-mist">Espace local</p>
                      </div>
                    </div>
                    <span className="rounded-full border border-white/15 px-3 py-1 text-[10px] tracking-[0.14em] text-mist uppercase">Privé</span>
                  </div>
                  <div className="py-7">
                    <div className="mb-5 flex items-end justify-between">
                      <div>
                        <p className="text-xs text-mist">Permis trouvés</p>
                        <p className="mt-2 font-display text-5xl tracking-tight text-white">1 284</p>
                      </div>
                      <p className="pb-1 text-xs text-mist">Filtré · prêt à exporter</p>
                    </div>
                    <div className="flex h-24 items-end gap-2" aria-hidden="true">
                      {[32, 54, 40, 75, 58, 88, 63, 100, 72, 83, 55, 92, 68, 78, 48, 65, 36, 76].map((height, index) => (
                        <motion.span
                          key={index}
                          className="flex-1 rounded-t-sm bg-white"
                          initial={{ height: 0, opacity: 0.2 }}
                          animate={{ height: `${height}%`, opacity: index > 13 ? 0.24 : 0.82 }}
                          transition={{ delay: 0.55 + index * 0.035, duration: 0.45, ease: 'easeOut' }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-5">
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-[10px] tracking-[0.16em] text-mist uppercase">Période</p>
                      <p className="mt-2 text-sm text-white">01 janv. — 31 déc.</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-[10px] tracking-[0.16em] text-mist uppercase">Traitement</p>
                      <p className="mt-2 flex items-center gap-2 text-sm text-white"><span className="size-1.5 rounded-full bg-white" /> Sur cet appareil</p>
                    </div>
                  </div>
                </div>
                <motion.span
                  className="absolute -right-3 top-12 hidden rounded-full border border-white/20 bg-black px-4 py-2 text-xs text-white shadow-xl sm:block"
                  animate={{ y: [0, -7, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                >
                  Pensé avec soin
                </motion.span>
              </motion.div>
            </main>

            <footer className="flex flex-col-reverse gap-3 border-t border-white/10 py-5 text-xs text-mist sm:flex-row sm:items-center sm:justify-between">
              <span><span className="text-white">tamim k.</span> · 2026</span>
              <span>Conçu pour la clarté. Pensé pour rester local.</span>
            </footer>
          </div>

          {authDialog}
        </div>
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <Bubbles />
      <div className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 px-4 pb-6 sm:gap-8 sm:px-6">
        <Header onHome={() => setShowWorkspace(false)} />

        <main className="flex flex-col gap-6 sm:gap-8">
          {/* 1. Fichiers */}
          <section aria-labelledby="t-files" className="flex flex-col gap-4">
            <h2 id="t-files" className="sr-only">Fichiers</h2>
            <DropZone onFiles={addFiles} compact={files.length > 0} />
            {!files.length && (
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-sm text-mist">
                <span>Pas de fichier sous la main ?</span>
                <SpringButton variant="chip" onClick={loadSample}>
                  🐠 Essayer avec le fichier d'exemple
                </SpringButton>
              </div>
            )}
            <AnimatePresence>
              {notice && (
                <motion.p
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-2 text-sm text-coral-soft"
                >
                  {notice}
                </motion.p>
              )}
            </AnimatePresence>
            <LayoutGroup>
              <ul className="grid gap-3">
                <AnimatePresence mode="popLayout">
                  {files.map((f, i) => (
                    <FileCard
                      key={f.id}
                      entry={f}
                      index={i}
                      onRemove={() => setFiles((fs) => fs.filter((x) => x.id !== f.id))}
                      onMapping={(m: Mapping) => setFiles((fs) => fs.map((x) => (x.id === f.id ? { ...x, mapping: m } : x)))}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            </LayoutGroup>
          </section>

          {/* 2. Filtres */}
          <section aria-label="Filtres" className="flex flex-col gap-4">
            <FiltersPanel value={filters} onChange={setFilters} error={filterError} />
            <div className="flex flex-col items-center gap-2">
              <SpringButton
                variant="primary"
                className="px-8 py-3.5 text-lg"
                disabled={running || !ready.length || inspecting}
                onClick={launch}
              >
                🔍 Lancer la recherche
              </SpringButton>
              <p className="text-center text-xs text-mist">
                {!files.length
                  ? 'Ajoutez au moins un fichier pour commencer.'
                  : inspecting
                    ? 'Lecture des colonnes…'
                    : needsColumns && !ready.length
                      ? 'Choisissez les colonnes commune et date ci-dessus.'
                      : `${plural(ready.length, 'fichier prêt', 'fichiers prêts')}${needsColumns ? ' (les fichiers sans colonnes reconnues seront ignorés)' : ''}`}
              </p>
            </div>
          </section>

          {/* 3. Progression */}
          <AnimatePresence>
            {running && progress && (
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
              >
                <WaterProgress p={progress} fileName={runningName} onCancel={() => send({ type: 'cancel' })} />
              </motion.section>
            )}
          </AnimatePresence>

          {/* 4. Résultats */}
          {results && !running && (
            <motion.section
              ref={resultsRef}
              key={runId}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 24 }}
              className="flex scroll-mt-4 flex-col gap-4"
              aria-label="Résultats"
            >
              <Summary total={r.code.length} communes={groups.codes.length} latest={latest} />
              {r.truncated && (
                <p className="rounded-2xl border border-sun/30 bg-sun/10 px-4 py-2 text-sm text-sun">
                  {fmtInt(r.matched)} permis correspondent : seuls les {fmtInt(r.code.length)} premiers sont affichés. Affinez la
                  période ou ajoutez un filtre commune / département.
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex rounded-full bg-deep/80 p-1 ring-1 ring-aqua/15" role="tablist">
                  {(['list', 'group'] as View[]).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      aria-selected={view === v}
                      onClick={() => setView(v)}
                      className={`relative cursor-pointer rounded-full px-4 py-1.5 text-sm transition-colors ${view === v ? 'text-abyss' : 'text-mist hover:text-foam'}`}
                    >
                      {view === v && (
                        <motion.span
                          layoutId="view-pill"
                          className="absolute inset-0 rounded-full bg-aqua"
                          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                        />
                      )}
                      <span className="relative font-display font-medium">{v === 'list' ? 'Liste des permis' : 'Par commune'}</span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {view === 'list' && (
                    <SpringButton variant="ghost" className="text-sm" onClick={() => setDetails((d) => !d)} aria-expanded={details}>
                      {details ? '− Masquer les détails' : '+ Afficher les détails'}
                    </SpringButton>
                  )}
                  <SpringButton variant="coral" disabled={!r.code.length} onClick={doExport}>
                    ⬇ Exporter pour Excel
                  </SpringButton>
                </div>
              </div>

              <ResultsTable
                results={r}
                view={view}
                details={details}
                listSort={listSort}
                onListSort={(k) => setListSort((c) => toggleSort(c, k, k === 'date' || k === 'lgt' || k === 'surf'))}
                groupSort={groupSort}
                onGroupSort={(k) => setGroupSort((c) => toggleSort(c, k, k !== 'code'))}
                listOrder={listOrder}
                groups={groups}
                groupOrder={groupOrder}
                freshKey={runId}
              />
              <p className="text-center text-xs text-mist/70">
                {plural(r.scanned, 'ligne parcourue', 'lignes parcourues')}{' '}
                {r.ms < 1000 ? "en moins d'une seconde" : `en ${(r.ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`}
              </p>
            </motion.section>
          )}
        </main>

        {authDialog}
        <footer className="mt-auto pt-6 text-center font-display text-sm text-mist/80">
          <span className="text-white">tamim k.</span>
        </footer>
      </div>
    </MotionConfig>
  );
}
