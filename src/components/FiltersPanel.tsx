import { SpringButton } from './SpringButton';
import { DateField } from './DateField';

export interface FilterState {
  from: string; // AAAA-MM-JJ
  to: string;
  communes: string;
  deps: string;
  preset: string | null;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const PRESETS: { id: string; label: string; range: () => [string, string] }[] = [
  { id: '30j', label: '30 derniers jours', range: () => { const d = new Date(); d.setDate(d.getDate() - 30); return [iso(d), iso(new Date())]; } },
  { id: '3m', label: '3 derniers mois', range: () => { const d = new Date(); d.setMonth(d.getMonth() - 3); return [iso(d), iso(new Date())]; } },
  { id: 'ytd', label: 'Depuis le 1er janvier', range: () => [`${new Date().getFullYear()}-01-01`, iso(new Date())] },
  { id: '12m', label: '12 derniers mois', range: () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return [iso(d), iso(new Date())]; } },
];

export function defaultFilters(): FilterState {
  const [from, to] = PRESETS[3].range();
  return { from, to, communes: '', deps: '', preset: '12m' };
}

export function FiltersPanel({
  value,
  onChange,
  error,
}: {
  value: FilterState;
  onChange: (v: FilterState) => void;
  error: string | null;
}) {
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });

  return (
    <div className="card p-4 sm:p-6">
      <h2 className="font-display text-xl font-semibold">Filtres</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <DateField label="Du" value={value.from} max={value.to || undefined} onChange={(from) => set({ from, preset: null })} />
        <DateField label="Au" value={value.to} min={value.from || undefined} onChange={(to) => set({ to, preset: null })} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <SpringButton
            key={p.id}
            variant="chip"
            active={value.preset === p.id}
            onClick={() => {
              const [from, to] = p.range();
              set({ from, to, preset: p.id });
            }}
          >
            {p.label}
          </SpringButton>
        ))}
        <SpringButton variant="chip" active={!value.from && !value.to} onClick={() => set({ from: '', to: '', preset: null })}>
          Toutes les dates
        </SpringButton>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-[2fr_1fr]">
        <label className="block text-sm text-mist">
          Communes (codes INSEE, séparés par des virgules)
          <input
            className="field mt-1 font-mono"
            inputMode="numeric"
            placeholder="ex. 12145 pour Millau"
            value={value.communes}
            onChange={(e) => set({ communes: e.target.value })}
          />
          <span className="mt-1 block text-xs text-mist/70">Vide = toutes les communes</span>
        </label>
        <label className="block text-sm text-mist">
          Département
          <input
            className="field mt-1 font-mono"
            placeholder="ex. 12"
            value={value.deps}
            onChange={(e) => set({ deps: e.target.value })}
          />
          <span className="mt-1 block text-xs text-mist/70">Vide = toute la France</span>
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-coral">{error}</p>}
    </div>
  );
}
