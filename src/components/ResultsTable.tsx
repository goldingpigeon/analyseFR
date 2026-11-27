import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AnimatePresence, motion } from 'framer-motion';
import type { Results } from '../lib/types';
import { fmtDate, fmtInt, fmtNum } from '../lib/fr';
import { kindClass } from './FileCard';

export type View = 'list' | 'group';
type Dir = 'asc' | 'desc';

/* ------------------------------------------------------------ Tri */

type ListKey = 'code' | 'date' | 'file' | 'num' | 'dem' | 'siren' | 'lgt' | 'surf';
type GroupKey = 'code' | 'count' | 'latest';

export function useListOrder(r: Results, key: ListKey, dir: Dir): Uint32Array {
  return useMemo(() => {
    const n = r.code.length;
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    const s = dir === 'asc' ? 1 : -1;
    const strCmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    let cmp: (a: number, b: number) => number;
    switch (key) {
      case 'date':
        cmp = (a, b) => (r.date[a] - r.date[b]) * s || strCmp(r.code[a], r.code[b]);
        break;
      case 'lgt':
      case 'surf': {
        const col = r[key];
        // valeurs absentes toujours en bas
        cmp = (a, b) => {
          const x = col[a], y = col[b];
          const xn = Number.isNaN(x), yn = Number.isNaN(y);
          if (xn || yn) return xn === yn ? 0 : xn ? 1 : -1;
          return (x - y) * s;
        };
        break;
      }
      case 'file':
        cmp = (a, b) => strCmp(r.labels[r.file[a]], r.labels[r.file[b]]) * s || r.date[b] - r.date[a];
        break;
      default: {
        const col = r[key];
        cmp = (a, b) => {
          const x = col[a], y = col[b];
          if (!x || !y) return !x === !y ? 0 : !x ? 1 : -1;
          return strCmp(x, y) * s || r.date[b] - r.date[a];
        };
      }
    }
    idx.sort(cmp);
    return idx;
  }, [r, key, dir]);
}

export interface Groups {
  codes: string[];
  counts: Uint32Array;
  latest: Int32Array;
}

export function computeGroups(r: Results): Groups {
  const map = new Map<string, number>();
  const codes: string[] = [];
  const counts: number[] = [];
  const latest: number[] = [];
  for (let i = 0; i < r.code.length; i++) {
    const c = r.code[i];
    let g = map.get(c);
    if (g === undefined) {
      g = codes.length;
      map.set(c, g);
      codes.push(c);
      counts.push(0);
      latest.push(0);
    }
    counts[g]++;
    if (r.date[i] > latest[g]) latest[g] = r.date[i];
  }
  return { codes, counts: Uint32Array.from(counts), latest: Int32Array.from(latest) };
}

export function useGroupOrder(g: Groups, key: GroupKey, dir: Dir): Uint32Array {
  return useMemo(() => {
    const n = g.codes.length;
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    const s = dir === 'asc' ? 1 : -1;
    const cmp =
      key === 'code'
        ? (a: number, b: number) => (g.codes[a] < g.codes[b] ? -1 : g.codes[a] > g.codes[b] ? 1 : 0) * s
        : key === 'count'
          ? (a: number, b: number) => (g.counts[a] - g.counts[b]) * s || g.latest[b] - g.latest[a]
          : (a: number, b: number) => (g.latest[a] - g.latest[b]) * s || g.counts[b] - g.counts[a];
    idx.sort(cmp);
    return idx;
  }, [g, key, dir]);
}

/* ------------------------------------------------------------ Tableau */

interface Col<K extends string> {
  key: K;
  label: string;
  main?: boolean;
  align?: 'right';
  detail?: boolean;
}

const LIST_COLS: Col<ListKey>[] = [
  { key: 'code', label: 'Code commune', main: true },
  { key: 'date', label: "Date d'autorisation", main: true },
  { key: 'file', label: 'Fichier source', detail: true },
  { key: 'num', label: 'N° de permis', detail: true },
  { key: 'dem', label: 'Demandeur', detail: true },
  { key: 'siren', label: 'SIREN', detail: true },
  { key: 'lgt', label: 'Logements', detail: true, align: 'right' },
  { key: 'surf', label: 'Surface (m²)', detail: true, align: 'right' },
];
const LIST_GRID_MAIN = 'minmax(8.5rem,1fr) minmax(10rem,1fr)';
const LIST_GRID_DETAILS = `10rem 11.5rem minmax(9.5rem,1fr) minmax(9rem,1fr) minmax(11rem,1.6fr) 7.5rem 6.5rem 7rem`;

const GROUP_COLS: Col<GroupKey>[] = [
  { key: 'code', label: 'Code commune', main: true },
  { key: 'count', label: 'Nombre de permis', main: true },
  { key: 'latest', label: 'Dernière autorisation', main: true },
];
const GROUP_GRID = 'minmax(8rem,1fr) minmax(8rem,1fr) minmax(10rem,1fr)';

const ROW_H = 58;

export function ResultsTable({
  results,
  view,
  details,
  listSort,
  onListSort,
  groupSort,
  onGroupSort,
  listOrder,
  groups,
  groupOrder,
  freshKey,
}: {
  results: Results;
  view: View;
  details: boolean;
  listSort: { key: ListKey; dir: Dir };
  onListSort: (k: ListKey) => void;
  groupSort: { key: GroupKey; dir: Dir };
  onGroupSort: (k: GroupKey) => void;
  listOrder: Uint32Array;
  groups: Groups;
  groupOrder: Uint32Array;
  freshKey: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(48);
  const count = view === 'list' ? listOrder.length : groupOrder.length;

  // Les lignes n'apparaissent en cascade que juste après l'arrivée des résultats (ou un changement de vue).
  const [fresh, setFresh] = useState(true);
  useEffect(() => {
    setFresh(true);
    scrollRef.current?.scrollTo({ top: 0 });
    const t = setTimeout(() => setFresh(false), 1200);
    return () => clearTimeout(t);
  }, [freshKey, view]);

  useEffect(() => {
    if (headerRef.current) setHeaderH(headerRef.current.offsetHeight);
  }, [view, details]);

  const virt = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 10,
    scrollMargin: headerH,
  });

  const cols = view === 'list' ? LIST_COLS.filter((c) => details || !c.detail) : GROUP_COLS;
  const grid = view === 'list' ? (details ? LIST_GRID_DETAILS : LIST_GRID_MAIN) : GROUP_GRID;
  const minW = view === 'list' && details ? 'min-w-[1080px]' : '';
  const sort = view === 'list' ? listSort : groupSort;

  if (!count) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card px-6 py-14 text-center">
        <div className="text-5xl">🐚</div>
        <p className="mt-3 font-display text-xl font-semibold">Aucun permis ne correspond à ces critères.</p>
        <p className="mt-1 text-sm text-mist">Essayez d'élargir la période ou de retirer le filtre commune / département.</p>
      </motion.div>
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      <div ref={scrollRef} className="scroll-ocean relative h-[min(68vh,720px)] overflow-auto" role="table" aria-rowcount={count}>
        <div className={minW}>
          <div
            ref={headerRef}
            role="row"
            className="sticky top-0 z-10 grid border-b border-aqua/15 bg-deep/95 backdrop-blur"
            style={{ gridTemplateColumns: grid }}
          >
            {cols.map((c) => {
              const active = sort.key === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  role="columnheader"
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() => (view === 'list' ? onListSort(c.key as ListKey) : onGroupSort(c.key as GroupKey))}
                  className={`flex cursor-pointer items-center gap-1 px-4 py-3 text-left transition-colors hover:text-aqua ${
                    c.main ? 'font-display text-sm font-semibold text-foam sm:text-base' : 'text-xs font-medium text-mist'
                  } ${c.align === 'right' ? 'justify-end text-right' : ''} ${active ? '!text-aqua' : ''}`}
                >
                  {c.label}
                  <span className={`text-xs transition-transform duration-200 ${active ? 'opacity-100' : 'opacity-0'} ${sort.dir === 'asc' && active ? 'rotate-180' : ''}`}>
                    ▼
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative" style={{ height: virt.getTotalSize() }}>
            {virt.getVirtualItems().map((v) => {
              const animate = fresh && v.index < 24;
              const style = {
                transform: `translate3d(0, ${v.start - headerH}px, 0)`,
                height: ROW_H,
                gridTemplateColumns: grid,
                animationDelay: animate ? `${v.index * 28}ms` : undefined,
              };
              const zebra = v.index % 2 ? 'bg-white/[0.015]' : '';
              if (view === 'group') {
                const g = groupOrder[v.index];
                return (
                  <div key={v.key} role="row" style={style} className={`absolute inset-x-0 top-0 grid items-center border-b border-white/5 transition-colors hover:bg-aqua/5 ${zebra} ${animate ? 'row-in' : ''}`}>
                    <div className="px-4 font-display text-xl font-semibold tracking-wide text-aqua-soft">{groups.codes[g]}</div>
                    <div className="px-4 font-display text-xl font-semibold tabular-nums">{fmtInt(groups.counts[g])}</div>
                    <div className="px-4 font-display text-lg tabular-nums">{fmtDate(groups.latest[g])}</div>
                  </div>
                );
              }
              const i = listOrder[v.index];
              const label = results.labels[results.file[i]] || '';
              return (
                <div key={v.key} role="row" style={style} className={`absolute inset-x-0 top-0 grid items-center border-b border-white/5 transition-colors hover:bg-aqua/5 ${zebra} ${animate ? 'row-in' : ''}`}>
                  <div className="px-4 font-display text-xl font-semibold tracking-wide text-aqua-soft">{results.code[i]}</div>
                  <div className="px-4 font-display text-lg tabular-nums">{fmtDate(results.date[i])}</div>
                  {details && (
                    <>
                      <div className="px-4">
                        <span className={`inline-block max-w-full truncate rounded-full border px-2 py-0.5 text-xs ${kindClass(label)}`} title={label}>
                          {label}
                        </span>
                      </div>
                      <Cell v={results.num[i]} mono />
                      <Cell v={results.dem[i]} />
                      <Cell v={results.siren[i]} mono />
                      <Cell v={fmtNum(results.lgt[i])} right />
                      <Cell v={fmtNum(results.surf[i])} right />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {count > 12 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-t border-aqua/10 px-4 py-2 text-xs text-mist">
            {fmtInt(count)} lignes · cliquez sur un en-tête pour trier
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Cell({ v, mono, right }: { v: string; mono?: boolean; right?: boolean }) {
  return (
    <div className={`truncate px-4 text-sm text-mist ${mono ? 'font-mono text-xs' : ''} ${right ? 'text-right tabular-nums' : ''}`} title={v}>
      {v || <span className="text-mist/40">—</span>}
    </div>
  );
}

export type { ListKey, GroupKey, Dir };
