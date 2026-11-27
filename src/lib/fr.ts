const intFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

export const fmtInt = (n: number) => intFmt.format(n);
export const fmtNum = (n: number) => (Number.isFinite(n) ? decFmt.format(n) : '');

/** 20261126 → "26/11/2026" */
export function fmtDate(d: number): string {
  if (!d) return '—';
  const s = String(d);
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
}

export function fmtBytes(b: number): string {
  if (b >= 1e9) return `${decFmt.format(b / 1e9)} Go`;
  if (b >= 1e6) return `${decFmt.format(b / 1e6)} Mo`;
  if (b >= 1e3) return `${decFmt.format(b / 1e3)} Ko`;
  return `${intFmt.format(b)} o`;
}

export const plural = (n: number, one: string, many: string) => `${fmtInt(n)} ${n > 1 ? many : one}`;
