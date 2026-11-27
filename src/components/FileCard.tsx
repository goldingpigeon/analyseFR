import { forwardRef, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FIELD_LABELS, OPTIONAL_FIELDS, type FieldKey, type InspectResult, type Mapping } from '../lib/types';
import { fmtBytes } from '../lib/fr';

export interface FileEntry {
  id: string;
  file: File;
  status: 'inspecting' | 'ready' | 'error';
  info?: InspectResult;
  mapping: Mapping;
}

const KIND_COLORS: Record<string, string> = {
  Logements: 'bg-aqua/15 text-aqua-soft border-aqua/30',
  'Locaux non résidentiels': 'bg-sun/15 text-sun border-sun/30',
  "Permis d'aménager": 'bg-coral/15 text-coral-soft border-coral/30',
  'Permis de démolir': 'bg-[#b49bff]/15 text-[#cbb8ff] border-[#b49bff]/30',
  Autre: 'bg-mist/10 text-mist border-mist/30',
};
export const kindClass = (k: string) => KIND_COLORS[k] || KIND_COLORS.Autre;

const ENC: Record<string, string> = { 'utf-8': 'UTF-8', 'windows-1252': 'Latin-1', Excel: 'Excel' };
const DELIM: Record<string, string> = { ';': 'point-virgule', ',': 'virgule', '\t': 'tabulation', '|': 'barre' };

interface Props {
  entry: FileEntry;
  index: number;
  onRemove: () => void;
  onMapping: (m: Mapping) => void;
}

export const FileCard = forwardRef<HTMLLIElement, Props>(function FileCard({ entry, index, onRemove, onMapping }, ref) {
  const { info, mapping } = entry;
  const ok = mapping.commune != null && mapping.date != null;
  const [editing, setEditing] = useState(false);
  // Colonnes non reconnues : les menus restent ouverts jusqu'à « Valider », même une fois commune + date choisies.
  useEffect(() => {
    if (entry.status === 'ready' && (entry.info?.mapping.commune == null || entry.info?.mapping.date == null)) setEditing(true);
  }, [entry.status, entry.info]);
  const showPickers = entry.status === 'ready' && (!ok || editing);

  return (
    <motion.li
      ref={ref}
      layout
      initial={{ opacity: 0, y: -36, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 18, mass: 0.9, delay: index * 0.06 }}
      className="card p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-display text-lg font-medium" title={entry.file.name}>
              {entry.file.name}
            </span>
            {info && (
              <span className={`rounded-full border px-2 py-0.5 text-xs ${kindClass(info.kind)}`}>{info.kind}</span>
            )}
          </div>
          <div className="mt-1 text-xs text-mist">
            {fmtBytes(entry.file.size)}
            {info && !info.error && (
              <>
                {' · '}
                {ENC[info.encoding] || info.encoding}
                {info.delimiter && ` · séparateur ${DELIM[info.delimiter] || info.delimiter}`}
                {` · ${info.headers.length} colonnes`}
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-mist transition hover:bg-coral/15 hover:text-coral"
          aria-label={`Retirer ${entry.file.name}`}
          title="Retirer ce fichier"
        >
          ✕
        </button>
      </div>

      <div className="mt-3">
        {entry.status === 'inspecting' && <p className="text-sm text-mist">Lecture des colonnes…</p>}
        {entry.status === 'error' && <p className="text-sm text-coral">{info?.error || 'Fichier illisible.'}</p>}
        {entry.status === 'ready' && ok && !editing && (
          <div className="flex flex-wrap items-center gap-2">
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 15, delay: 0.15 }}
              className="rounded-full bg-aqua/15 px-3 py-1 font-display text-sm font-medium text-aqua"
            >
              Colonnes reconnues ✓
            </motion.span>
            <Chip label="Commune" col={info!.headers[mapping.commune!]} strong />
            <Chip label="Date" col={info!.headers[mapping.date!]} strong />
            {OPTIONAL_FIELDS.filter((k) => mapping[k] != null).map((k) => (
              <Chip key={k} label={FIELD_LABELS[k]} col={info!.headers[mapping[k]!]} />
            ))}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="cursor-pointer text-xs text-mist underline decoration-mist/40 underline-offset-4 hover:text-foam"
            >
              Modifier
            </button>
          </div>
        )}
        <AnimatePresence initial={false}>
          {showPickers && info && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              {!ok && (
                <p className="mb-3 text-sm text-coral">
                  Colonnes non reconnues : choisissez la colonne du code commune et celle de la date d'autorisation.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {(['commune', 'date', ...OPTIONAL_FIELDS] as FieldKey[]).map((k) => (
                  <label key={k} className="block text-xs text-mist">
                    <span className={k === 'commune' || k === 'date' ? 'font-semibold text-foam' : ''}>
                      {FIELD_LABELS[k]}
                      {(k === 'commune' || k === 'date') && ' *'}
                    </span>
                    <select
                      className="field mt-1 text-sm"
                      value={mapping[k] ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        const next = { ...mapping };
                        if (v === '') delete next[k];
                        else next[k] = Number(v);
                        onMapping(next);
                      }}
                    >
                      <option value="">— aucune —</option>
                      {info.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Colonne ${i + 1}`}
                          {info.sample[0]?.[i] ? `  (ex. ${String(info.sample[0][i]).slice(0, 24)})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {ok && (
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="mt-3 cursor-pointer text-sm text-aqua underline decoration-aqua/40 underline-offset-4"
                >
                  Valider ces colonnes
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
});

function Chip({ label, col, strong }: { label: string; col?: string; strong?: boolean }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-xs ${
        strong ? 'border-aqua/30 text-foam' : 'border-mist/20 text-mist'
      }`}
      title={col}
    >
      {label} : <span className="font-mono">{col}</span>
    </span>
  );
}
