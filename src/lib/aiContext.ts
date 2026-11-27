import type { Results } from './types';
import { fmtDate } from './fr';
import { depFromCode } from './normalize';

/**
 * Résumé chiffré des permis, calculé dans le navigateur, à envoyer à l'assistant.
 * Volontairement sans noms de demandeurs, SIREN ni numéros de permis : seulement des totaux.
 */
export function statsForAI(r: Results, title: string): string {
  const n = r.code.length;
  if (!n) return `${title}\nAucun permis dans ces données.`;

  let min = 99999999, max = 0, lgtSum = 0, lgtN = 0, surfSum = 0, surfN = 0;
  const byCommune = new Map<string, { n: number; last: number; lgt: number }>();
  const byMonth = new Map<string, number>();
  const byYear = new Map<string, number>();
  const byDep = new Map<string, number>();
  const byFile = new Map<string, number>();

  for (let i = 0; i < n; i++) {
    const d = r.date[i], c = r.code[i];
    if (d < min) min = d;
    if (d > max) max = d;
    const g = byCommune.get(c) ?? { n: 0, last: 0, lgt: 0 };
    g.n++;
    if (d > g.last) g.last = d;
    if (Number.isFinite(r.lgt[i])) { g.lgt += r.lgt[i]; lgtSum += r.lgt[i]; lgtN++; }
    if (Number.isFinite(r.surf[i])) { surfSum += r.surf[i]; surfN++; }
    byCommune.set(c, g);
    const s = String(d);
    byMonth.set(`${s.slice(0, 4)}-${s.slice(4, 6)}`, (byMonth.get(`${s.slice(0, 4)}-${s.slice(4, 6)}`) ?? 0) + 1);
    byYear.set(s.slice(0, 4), (byYear.get(s.slice(0, 4)) ?? 0) + 1);
    const dep = depFromCode(c);
    byDep.set(dep, (byDep.get(dep) ?? 0) + 1);
    const lab = r.labels[r.file[i]] ?? '';
    byFile.set(lab, (byFile.get(lab) ?? 0) + 1);
  }

  const top = <K,>(m: Map<K, number>, k: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, k);
  const communes = [...byCommune].sort((a, b) => b[1].n - a[1].n);
  const months = [...byMonth].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-36);
  const years = [...byYear].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const recent = [...byCommune].sort((a, b) => b[1].last - a[1].last).slice(0, 15);

  const L: string[] = [];
  L.push(title);
  L.push(`Statistiques calculées localement par l'application sur ${n.toLocaleString('fr-FR')} permis${r.truncated ? ` (sur ${r.matched.toLocaleString('fr-FR')} au total ; seuls les premiers ont été conservés)` : ''}, ${r.scanned.toLocaleString('fr-FR')} lignes lues.`);
  L.push(`Période couverte : du ${fmtDate(min)} au ${fmtDate(max)}. Communes distinctes : ${byCommune.size}.`);
  if (lgtN) L.push(`Logements créés (total) : ${Math.round(lgtSum).toLocaleString('fr-FR')}.`);
  if (surfN) L.push(`Surface créée (total) : ${Math.round(surfSum).toLocaleString('fr-FR')} m².`);
  L.push('', 'Par type de fichier : ' + [...byFile].map(([k, v]) => `${k} ${v}`).join(' ; '));
  L.push('', 'Par année : ' + years.map(([k, v]) => `${k} ${v}`).join(' ; '));
  L.push('', 'Par mois (36 derniers mois présents) : ' + months.map(([k, v]) => `${k} ${v}`).join(' ; '));
  L.push('', `Départements les plus actifs : ` + top(byDep, 20).map(([k, v]) => `${k} ${v}`).join(' ; '));
  L.push('', `Communes les plus actives (code INSEE : nombre de permis, dernière autorisation${lgtN ? ', logements' : ''}) :`);
  for (const [c, g] of communes.slice(0, 40)) L.push(`- ${c} : ${g.n}, ${fmtDate(g.last)}${lgtN ? `, ${Math.round(g.lgt)}` : ''}`);
  if (communes.length > 40) L.push(`- … et ${communes.length - 40} autres communes`);
  L.push('', 'Autorisations les plus récentes par commune : ' + recent.map(([c, g]) => `${c} (${fmtDate(g.last)})`).join(' ; '));
  return L.join('\n');
}
