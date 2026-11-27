/** Nettoyage des valeurs brutes (CSV ou Excel). Tout est fait pour être rapide : appelé des millions de fois. */

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/** Convertit une date en entier AAAAMMJJ (0 si illisible).
 *  Formats : AAAA-MM-JJ (avec ou sans heure), JJ/MM/AAAA, JJ-MM-AAAA, AAAAMMJJ, numéro de série Excel. */
export function parseDate(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return excelSerial(v);
  if (v instanceof Date) return v.getFullYear() * 10000 + (v.getMonth() + 1) * 100 + v.getDate();
  const s = String(v).trim();
  const n = s.length;
  if (n < 8) return 0;
  const c4 = s.charCodeAt(4);
  // AAAA-MM-JJ ou AAAA/MM/JJ
  if (n >= 10 && (c4 === 45 || c4 === 47)) {
    return build(num(s, 0, 4), num(s, 5, 7), num(s, 8, 10));
  }
  const c2 = s.charCodeAt(2);
  // JJ/MM/AAAA ou JJ-MM-AAAA
  if (n >= 10 && (c2 === 47 || c2 === 45 || c2 === 46)) {
    return build(num(s, 6, 10), num(s, 3, 5), num(s, 0, 2));
  }
  // J/M/AAAA (jours ou mois sur un chiffre)
  if (s.includes('/')) {
    const p = s.split(/[\s/]/);
    if (p.length >= 3) return build(+p[2], +p[1], +p[0]);
  }
  // AAAAMMJJ
  if (n === 8 && /^\d{8}$/.test(s)) return build(num(s, 0, 4), num(s, 4, 6), num(s, 6, 8));
  // Numéro de série Excel écrit en texte
  if (/^\d{5}(\.\d+)?$/.test(s)) return excelSerial(+s);
  return 0;
}

function num(s: string, a: number, b: number): number {
  let r = 0;
  for (let i = a; i < b; i++) {
    const d = s.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return NaN;
    r = r * 10 + d;
  }
  return r;
}

function build(y: number, m: number, d: number): number {
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return 0;
  return y * 10000 + m * 100 + d;
}

function excelSerial(x: number): number {
  if (!(x > 1000 && x < 80000)) return 0;
  const dt = new Date(EXCEL_EPOCH_MS + Math.floor(x) * 86400000);
  return dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
}

/** Code département normalisé : "1" → "01", "2a" → "2A", "971" reste "971". */
export function normalizeDep(v: unknown): string {
  if (v == null) return '';
  let s = String(v).trim().toUpperCase();
  if (!s) return '';
  if (/^\d$/.test(s)) s = '0' + s;
  return s;
}

/** Code INSEE à 5 caractères.
 *  Certains fichiers donnent COMM sur 3 chiffres (n° dans le département) : on le recompose avec DEP. */
export function normalizeCommune(v: unknown, dep: string): string {
  if (v == null) return '';
  let s = String(v).trim().toUpperCase();
  if (!s) return '';
  if (s.length <= 3 && dep) {
    if (dep.length === 3) return dep + s.padStart(3, '0').slice(-2); // DOM : 971 + 01
    return dep + s.padStart(3, '0');
  }
  if (s.length < 5 && /^\d+$/.test(s)) s = s.padStart(5, '0'); // Excel a mangé le zéro initial
  return s;
}

/** Département déduit du code commune. */
export function depFromCode(code: string): string {
  return code.startsWith('97') || code.startsWith('98') ? code.slice(0, 3) : code.slice(0, 2);
}

export function parseNumber(v: unknown): number {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  return s ? Number(s) : NaN;
}

export function normalizeSiren(v: unknown): string {
  if (v == null) return '';
  const s = String(v).trim();
  return /^\d{1,8}$/.test(s) ? s.padStart(9, '0') : s;
}

/** Liste de codes saisie par l'utilisateur : "12145, 12202 ; 75056" → ["12145","12202","75056"] */
export function parseCodeList(input: string, kind: 'commune' | 'dep'): string[] {
  return input
    .split(/[\s,;]+/)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean)
    .map((x) => (kind === 'dep' ? normalizeDep(x) : /^\d{4}$/.test(x) ? x.padStart(5, '0') : x));
}

export function dateIntToIso(d: number): string {
  if (!d) return '';
  const s = String(d);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export function isoToDateInt(iso: string): number {
  return iso ? parseDate(iso) : 0;
}
