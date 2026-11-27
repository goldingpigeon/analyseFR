import type { FieldKey, Mapping } from './types';

/** "Date réelle d'autorisation" → "DATE_REELLE_D_AUTORISATION" */
export function normalizeHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

type Rule = { exact: string[]; test?: (h: string) => boolean };

/** Ordre de priorité : noms exacts des fichiers DiDo / Sitadel, puis motifs plus larges. */
const RULES: Record<FieldKey, Rule> = {
  commune: {
    exact: ['COMM', 'CODE_COMMUNE', 'COMMUNE_CODE', 'CODE_INSEE', 'CODE_INSEE_COMMUNE', 'INSEE', 'CODGEO', 'DEPCOM', 'COM', 'CODE_COM'],
    test: (h) => h.includes('INSEE') || (h.includes('COMMUNE') && h.includes('CODE')),
  },
  date: {
    exact: ['DATE_REELLE_AUTORISATION', 'DATE_REELLE_D_AUTORISATION', 'DATE_AUTORISATION', 'DATE_D_AUTORISATION', 'DAT_AUT'],
    test: (h) => h.includes('DATE') && h.includes('AUTORIS'),
  },
  dep: {
    exact: ['DEP', 'DEPARTEMENT', 'CODE_DEPARTEMENT', 'DEP_CODE', 'CODE_DEP', 'DPT'],
    test: (h) => h.startsWith('DEP') && !h.includes('DEPOT') && !h.includes('DEPENS'),
  },
  num: {
    exact: ['NUM_DAU', 'NUM_PC', 'NUMERO_PERMIS', 'NUM_PERMIS', 'NUMERO_DAU', 'NUMERO_DU_PERMIS', 'NUM_PA', 'NUM_PD'],
    test: (h) => (h.startsWith('NUM') || h.startsWith('NUMERO')) && (h.includes('DAU') || h.includes('PERMIS')),
  },
  dem: {
    exact: ['DENOM_DEM', 'NOM_DEM', 'DENOMINATION_DEMANDEUR', 'NOM_DEMANDEUR', 'DEMANDEUR', 'RAISON_SOCIALE_DEM'],
    test: (h) => (h.includes('DENOM') || h.includes('NOM') || h.includes('RAISON')) && h.includes('DEM'),
  },
  siren: {
    exact: ['SIREN_DEM', 'SIREN', 'SIREN_DEMANDEUR'],
    test: (h) => h.includes('SIREN'),
  },
  lgt: {
    exact: ['NB_LGT_TOT_CREES', 'NB_LGT_CREES', 'NB_LOGEMENTS_CREES', 'NB_LGT_TOT'],
    test: (h) => h.includes('LGT') && h.includes('CREE') && !h.includes('IND') && !h.includes('COL'),
  },
  surf: {
    exact: ['SURF_HAB_CREEE', 'SURF_LOC_CREEE', 'SURF_CREEE', 'SURFACE_CREEE', 'SURF_TOT_CREEE', 'SURF_PLANCHER_CREEE'],
    test: (h) => h.startsWith('SURF') && h.includes('CREE'),
  },
};

export function detectColumns(headers: string[]): Mapping {
  const norm = headers.map(normalizeHeader);
  const used = new Set<number>();
  const m: Mapping = {};
  for (const key of Object.keys(RULES) as FieldKey[]) {
    const r = RULES[key];
    let idx = -1;
    for (const name of r.exact) {
      idx = norm.findIndex((h, i) => h === name && !used.has(i));
      if (idx >= 0) break;
    }
    if (idx < 0 && r.test) idx = norm.findIndex((h, i) => !used.has(i) && r.test!(h));
    if (idx >= 0) {
      m[key] = idx;
      used.add(idx);
    }
  }
  return m;
}

/** Type de fichier DiDo deviné depuis le nom. */
export function kindFromName(name: string): string {
  const s = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/locaux|non.?resid/.test(s)) return 'Locaux non résidentiels';
  if (/logement/.test(s)) return 'Logements';
  if (/amenag|(^|[^a-z])pa([^a-z]|$)/.test(s)) return "Permis d'aménager";
  if (/demol|(^|[^a-z])pd([^a-z]|$)/.test(s)) return 'Permis de démolir';
  return 'Autre';
}

export function detectDelimiter(line: string): string {
  const counts: [string, number][] = [';', ',', '\t', '|'].map((d) => [d, line.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ';';
}

/** UTF-8 si les octets sont valides, sinon Latin-1 (windows-1252, sur-ensemble courant). */
export function detectEncoding(bytes: Uint8Array): string {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: true });
    return 'utf-8';
  } catch {
    return 'windows-1252';
  }
}
