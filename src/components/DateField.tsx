import { useEffect, useRef, useState } from 'react';

/** Champ date toujours au format français jj/mm/aaaa (le champ natif suit la langue du navigateur),
 *  avec un bouton calendrier qui ouvre le sélecteur natif. Valeur échangée : AAAA-MM-JJ. */
const toFr = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

function fromFr(s: string): string | null {
  const t = s.trim();
  if (!t) return '';
  const m = t.match(/^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [+m[1], +m[2], +m[3]];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function DateField({ label, value, onChange, min, max }: { label: string; value: string; onChange: (iso: string) => void; min?: string; max?: string }) {
  const [text, setText] = useState(toFr(value));
  const [bad, setBad] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setText(toFr(value));
    setBad(false);
  }, [value]);

  const commit = () => {
    const iso = fromFr(text);
    if (iso === null) setBad(true);
    else {
      setBad(false);
      if (iso !== value) onChange(iso);
    }
  };

  return (
    <label className="block text-sm text-mist">
      {label}
      <div className="relative mt-1">
        <input
          className={`field pr-11 tabular-nums ${bad ? '!border-coral' : ''}`}
          inputMode="numeric"
          placeholder="jj/mm/aaaa"
          value={text}
          aria-invalid={bad}
          onChange={(e) => {
            // insère les « / » automatiquement pendant la saisie
            let v = e.target.value.replace(/[^\d/]/g, '');
            if (/^\d{3,}$/.test(v)) v = v.slice(0, 2) + '/' + v.slice(2);
            if (/^\d{2}\/\d{3,}$/.test(v)) v = v.slice(0, 5) + '/' + v.slice(5);
            setText(v.slice(0, 10));
          }}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
        <button
          type="button"
          aria-label={`Choisir la date (${label})`}
          className="absolute inset-y-0 right-1 my-1 grid w-9 cursor-pointer place-items-center rounded-lg text-aqua transition hover:bg-aqua/10"
          onClick={() => {
            const p = picker.current;
            if (!p) return;
            try {
              p.showPicker();
            } catch {
              p.click();
            }
          }}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="5" width="18" height="16" rx="3" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
        </button>
        <input
          ref={picker}
          type="date"
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute right-0 bottom-0 h-0 w-0 opacity-0"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {bad && <span className="mt-1 block text-xs text-coral">Date invalide, format jj/mm/aaaa.</span>}
    </label>
  );
}
