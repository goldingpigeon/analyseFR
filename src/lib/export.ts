import type { Results } from './types';
import { fmtDate } from './fr';

/** Échappement CSV avec point-virgule (Excel français). */
function cell(v: string): string {
  if (/[;"\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
const numFr = (n: number) => (Number.isFinite(n) ? String(n).replace('.', ',') : '');

function download(parts: string[], name: string) {
  // BOM UTF-8 : Excel reconnaît alors les accents
  const blob = new Blob(['﻿', ...parts], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Les lignes sont regroupées par paquets pour ne pas créer une chaîne géante. */
export function exportList(r: Results, order: Uint32Array, name: string) {
  const parts: string[] = [
    "Code commune;Date d'autorisation;Fichier source;N° de permis;Demandeur;SIREN;Logements créés;Surface créée (m²)\r\n",
  ];
  let buf: string[] = [];
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    buf.push(
      [
        cell(r.code[i]),
        fmtDate(r.date[i]),
        cell(r.labels[r.file[i]] || ''),
        cell(r.num[i]),
        cell(r.dem[i]),
        cell(r.siren[i]),
        numFr(r.lgt[i]),
        numFr(r.surf[i]),
      ].join(';'),
    );
    if (buf.length === 20000) {
      parts.push(buf.join('\r\n') + '\r\n');
      buf = [];
    }
  }
  if (buf.length) parts.push(buf.join('\r\n') + '\r\n');
  download(parts, name);
}

export function exportGroups(codes: string[], counts: Uint32Array, latest: Int32Array, order: Uint32Array, name: string) {
  const lines = ['Code commune;Nombre de permis;Dernière autorisation'];
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    lines.push(`${cell(codes[i])};${counts[i]};${fmtDate(latest[i])}`);
  }
  download([lines.join('\r\n') + '\r\n'], name);
}
