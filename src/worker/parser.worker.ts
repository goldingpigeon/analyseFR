/// <reference lib="webworker" />
/**
 * Toute la lecture et le filtrage se font ici, hors du fil principal.
 * Les CSV sont lus par tranches de 8 Mo (jamais le fichier entier en mémoire),
 * décodés en flux (UTF-8 ou Latin-1) puis découpés par PapaParse.
 */
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { detectColumns, detectDelimiter, detectEncoding, kindFromName } from '../lib/detect';
import { depFromCode, normalizeCommune, normalizeDep, normalizeSiren, parseDate, parseNumber } from '../lib/normalize';
import type { Filters, InspectResult, Mapping, SearchFile, WorkerIn, WorkerOut } from '../lib/types';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: WorkerOut, transfer: Transferable[] = []) => ctx.postMessage(m, transfer);

const CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_RESULTS = 2_000_000;

let cancelled = false;

ctx.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  if (msg.type === 'cancel') {
    cancelled = true;
    return;
  }
  if (msg.type === 'inspect') {
    try {
      post(await inspect(msg.id, msg.file));
    } catch (err) {
      post({
        type: 'inspected', id: msg.id, format: 'csv', headers: [], sample: [], mapping: {},
        encoding: '', delimiter: '', kind: 'Autre',
        error: `Impossible de lire ce fichier (${(err as Error).message || err}).`,
      });
    }
    return;
  }
  if (msg.type === 'search') {
    cancelled = false;
    try {
      await search(msg.files, msg.filters);
    } catch (err) {
      post({ type: 'error', message: `Erreur pendant la lecture : ${(err as Error).message || err}` });
    }
  }
};

const isXlsx = (f: File) => /\.(xlsx|xls|xlsm)$/i.test(f.name);

/* ---------------------------------------------------------------- Inspection */

async function inspect(id: string, file: File): Promise<InspectResult> {
  const kind = kindFromName(file.name);
  if (isXlsx(file)) {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', sheetRows: 8, dense: true });
    const rows = firstSheetRows(wb);
    const headers = (rows[0] || []).map((h) => String(h ?? '').trim());
    if (!headers.length) throw new Error('feuille vide');
    return {
      type: 'inspected', id, format: 'xlsx', headers, kind, encoding: 'Excel', delimiter: '',
      sample: rows.slice(1, 6).map((r) => r.map((c) => String(c ?? ''))),
      mapping: detectColumns(headers),
    };
  }

  const head = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer());
  if (!head.length) throw new Error('fichier vide');
  const encoding = detectEncoding(head);
  let text = new TextDecoder(encoding).decode(head).replace(/^﻿/, '');
  let lines = text.split(/\r?\n/);
  if (file.size > head.length) lines = lines.slice(0, -1); // dernière ligne peut-être coupée
  lines = lines.filter((l) => l.trim()).slice(0, 8);
  if (!lines.length) throw new Error('aucune ligne lisible');
  const delimiter = detectDelimiter(lines[0]);
  const parsed = Papa.parse<string[]>(lines.join('\n'), { delimiter }).data;
  const headers = parsed[0].map((h) => h.trim());
  return {
    type: 'inspected', id, format: 'csv', headers, encoding, delimiter, kind,
    sample: parsed.slice(1, 6),
    mapping: detectColumns(headers),
  };
}

function firstSheetRows(wb: XLSX.WorkBook): unknown[][] {
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '', blankrows: false });
}

/* ---------------------------------------------------------------- Recherche */

async function search(files: SearchFile[], filters: Filters) {
  const t0 = performance.now();
  const from = filters.from || 0;
  const to = filters.to || 99999999;
  const communeSet = filters.communes.length ? new Set(filters.communes) : null;
  const depSet = filters.deps.length ? new Set(filters.deps) : null;

  const out = {
    code: [] as string[], date: [] as number[], file: [] as number[], num: [] as string[],
    dem: [] as string[], siren: [] as string[], lgt: [] as number[], surf: [] as number[],
  };
  const bytesTotal = files.reduce((s, f) => s + f.file.size, 0) || 1;
  let bytesBefore = 0;
  let scanned = 0;
  let matched = 0;
  let lastPost = 0;

  const progress = (bytesInFile: number, fileIndex: number, force = false) => {
    const now = performance.now();
    if (!force && now - lastPost < 60) return;
    lastPost = now;
    post({ type: 'progress', bytesDone: bytesBefore + bytesInFile, bytesTotal, scanned, matched, fileIndex });
  };

  const handleRow = (r: ArrayLike<unknown>, m: Mapping, fi: number) => {
    scanned++;
    const d = parseDate(r[m.date!]);
    if (!d || d < from || d > to) return;
    const dep = m.dep != null ? normalizeDep(r[m.dep]) : '';
    const code = normalizeCommune(r[m.commune!], dep);
    if (!code) return;
    if (communeSet && !communeSet.has(code)) return;
    if (depSet && !depSet.has(dep || depFromCode(code))) return;
    matched++;
    if (matched > MAX_RESULTS) return;
    out.code.push(code);
    out.date.push(d);
    out.file.push(fi);
    out.num.push(m.num != null ? String(r[m.num] ?? '').trim() : '');
    out.dem.push(m.dem != null ? String(r[m.dem] ?? '').trim() : '');
    out.siren.push(m.siren != null ? normalizeSiren(r[m.siren]) : '');
    out.lgt.push(m.lgt != null ? parseNumber(r[m.lgt]) : NaN);
    out.surf.push(m.surf != null ? parseNumber(r[m.surf]) : NaN);
  };

  for (let fi = 0; fi < files.length; fi++) {
    const f = files[fi];
    if (f.mapping.commune == null || f.mapping.date == null) continue;
    if (f.format === 'xlsx') {
      await scanXlsx(f, fi, handleRow, progress);
    } else {
      await scanCsv(f, fi, handleRow, progress);
    }
    if (cancelled) {
      post({ type: 'cancelled' });
      return;
    }
    bytesBefore += f.file.size;
    progress(0, fi, true);
  }

  const date = Int32Array.from(out.date);
  const file = Uint8Array.from(out.file);
  const lgt = Float64Array.from(out.lgt);
  const surf = Float64Array.from(out.surf);
  post(
    {
      type: 'done', code: out.code, date, file, num: out.num, dem: out.dem, siren: out.siren, lgt, surf,
      labels: files.map((f) => f.label), scanned, matched, truncated: matched > MAX_RESULTS,
      ms: performance.now() - t0,
    },
    [date.buffer, file.buffer, lgt.buffer, surf.buffer],
  );
}

type RowHandler = (r: ArrayLike<unknown>, m: Mapping, fi: number) => void;
type ProgressFn = (bytesInFile: number, fileIndex: number, force?: boolean) => void;

async function scanCsv(f: SearchFile, fi: number, handleRow: RowHandler, progress: ProgressFn) {
  const { file, mapping, delimiter } = f;
  const decoder = new TextDecoder(f.encoding || 'utf-8');
  let offset = 0;
  let carry = '';
  let headerSkipped = false;

  while (offset < file.size) {
    if (cancelled) return;
    const buf = await file.slice(offset, offset + CHUNK_BYTES).arrayBuffer();
    offset += buf.byteLength;
    const last = offset >= file.size;
    let text = carry + decoder.decode(buf, { stream: !last });
    if (!last) {
      const cut = text.lastIndexOf('\n');
      if (cut < 0) {
        carry = text;
        continue;
      }
      carry = text.slice(cut + 1);
      text = text.slice(0, cut);
    } else {
      carry = '';
    }
    if (!headerSkipped) {
      const nl = text.indexOf('\n');
      text = nl < 0 ? '' : text.slice(nl + 1);
      headerSkipped = true;
    }
    if (text) {
      const rows = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: true }).data;
      for (let i = 0; i < rows.length; i++) handleRow(rows[i], mapping, fi);
    }
    progress(offset, fi);
  }
}

async function scanXlsx(f: SearchFile, fi: number, handleRow: RowHandler, progress: ProgressFn) {
  // Excel ne se lit pas en flux : ces fichiers sont bien plus petits que les CSV.
  progress(0, fi, true);
  const wb = XLSX.read(await f.file.arrayBuffer(), { type: 'array', dense: true });
  const rows = firstSheetRows(wb);
  const n = rows.length;
  for (let i = 1; i < n; i++) {
    handleRow(rows[i], f.mapping, fi);
    if (i % 20000 === 0) {
      progress(Math.round((f.file.size * i) / n), fi);
      await new Promise((r) => setTimeout(r, 0)); // laisse passer une éventuelle annulation
      if (cancelled) return;
    }
  }
}
