import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, MotionConfig } from 'framer-motion';
import { Bubbles } from './components/Bubbles';
import { Header } from './components/Header';
import { DropZone } from './components/DropZone';
import { FileCard, type FileEntry } from './components/FileCard';
import { defaultFilters, FiltersPanel, type FilterState } from './components/FiltersPanel';
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
import type { Mapping, Progress, Results, SearchFile, WorkerIn, WorkerOut } from './lib/types';

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
          const { type: _t, ...r } = m;
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

  return (
    <MotionConfig reducedMotion="user">
      <Bubbles />
      <div className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 px-4 pb-6 sm:gap-8 sm:px-6">
        <Header />

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

        <footer className="mt-auto pt-6 text-center font-display text-sm text-mist/80">
          <span className="text-coral">tamim k.</span> · 2026 edition
        </footer>
      </div>
    </MotionConfig>
  );
}
