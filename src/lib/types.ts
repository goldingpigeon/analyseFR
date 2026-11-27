export type FieldKey = 'commune' | 'date' | 'dep' | 'num' | 'dem' | 'siren' | 'lgt' | 'surf';

/** Index de colonne pour chaque champ reconnu (absent = non trouvé). */
export type Mapping = Partial<Record<FieldKey, number>>;

export const FIELD_LABELS: Record<FieldKey, string> = {
  commune: 'Code commune',
  date: "Date d'autorisation",
  dep: 'Département',
  num: 'N° de permis',
  dem: 'Demandeur',
  siren: 'SIREN',
  lgt: 'Logements créés',
  surf: 'Surface créée',
};

export const OPTIONAL_FIELDS: FieldKey[] = ['dep', 'num', 'dem', 'siren', 'lgt', 'surf'];

export interface InspectResult {
  type: 'inspected';
  id: string;
  format: 'csv' | 'xlsx';
  headers: string[];
  sample: string[][];
  mapping: Mapping;
  encoding: string;
  delimiter: string;
  kind: string;
  error?: string;
}

export interface Filters {
  /** AAAAMMJJ, 0 = pas de borne */
  from: number;
  /** AAAAMMJJ, 0 = pas de borne */
  to: number;
  communes: string[];
  deps: string[];
}

export interface SearchFile {
  file: File;
  format: 'csv' | 'xlsx';
  mapping: Mapping;
  encoding: string;
  delimiter: string;
  label: string;
}

export interface Progress {
  bytesDone: number;
  bytesTotal: number;
  scanned: number;
  matched: number;
  fileIndex: number;
}

/** Résultats en colonnes : bien plus léger qu'un tableau d'objets pour 1 million de lignes. */
export interface Results {
  code: string[];
  date: Int32Array;
  file: Uint8Array;
  num: string[];
  dem: string[];
  siren: string[];
  lgt: Float64Array;
  surf: Float64Array;
  labels: string[];
  scanned: number;
  matched: number;
  truncated: boolean;
  ms: number;
}

export type WorkerIn =
  | { type: 'inspect'; id: string; file: File }
  | { type: 'search'; files: SearchFile[]; filters: Filters; reqId?: string }
  | { type: 'cancel' };

export type WorkerOut =
  | InspectResult
  | ({ type: 'progress'; reqId?: string } & Progress)
  | ({ type: 'done'; reqId?: string } & Results)
  | { type: 'cancelled'; reqId?: string }
  | { type: 'error'; message: string; reqId?: string };
