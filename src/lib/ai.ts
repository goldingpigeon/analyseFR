import { supabase } from './auth';

/** Partie d'un message au format Gemini. */
export type Part = { text: string } | { inlineData: { mimeType: string; data: string } };
export interface ApiMsg {
  role: 'user' | 'model';
  parts: Part[];
}

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/assistant`;
const ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

export const aiEnabled = !!supabase;

/** Taille maximale envoyée en pièces jointes binaires (Gemini accepte ~20 Mo par requête). */
export const MAX_INLINE_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_CHARS = 200_000;

/** Envoie la conversation et reçoit la réponse au fil de l'eau. */
export async function askAssistant(messages: ApiMsg[], onDelta: (text: string) => void, signal?: AbortSignal): Promise<void> {
  if (!supabase) throw new Error("La connexion n'est pas activée sur ce site.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Connectez-vous pour utiliser l'assistant.");

  let res: Response;
  try {
    res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: ANON },
      body: JSON.stringify({ messages: trimInline(messages) }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    if (!navigator.onLine) throw new Error("Vous semblez hors ligne. Vérifiez votre connexion internet.");
    throw new Error(
      "Impossible de joindre l'assistant. Dans Supabase, vérifiez que la fonction s'appelle exactement « assistant », qu'elle est bien déployée, et que l'option « Verify JWT » est désactivée.",
    );
  }
  if (!res.ok || !res.body) {
    if (res.status === 404) throw new Error("L'assistant n'est pas encore installé (fonction Supabase « assistant » introuvable).");
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || body?.message || `L'assistant a renvoyé une erreur (${res.status}).`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  // Si plus rien n'arrive pendant 60 s, on abandonne avec un message clair.
  const STALL_MS = 60_000;
  while (true) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stalled = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("L'assistant ne répond plus (aucune donnée depuis 60 s). Réessayez.")), STALL_MS);
    });
    try {
      const { done, value } = await Promise.race([reader.read(), stalled]);
      if (done) break;
      onDelta(dec.decode(value, { stream: true }));
    } catch (e) {
      reader.cancel().catch(() => {});
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Garde la requête sous la limite : retire les pièces jointes binaires les plus anciennes si besoin. */
function trimInline(messages: ApiMsg[]): ApiMsg[] {
  const out = messages.map((m) => ({ ...m, parts: [...m.parts] }));
  let total = 0;
  for (let i = out.length - 1; i >= 0; i--) {
    out[i].parts = out[i].parts.map((p) => {
      if (!('inlineData' in p)) return p;
      const size = p.inlineData.data.length * 0.75;
      if (total + size > MAX_INLINE_BYTES) return { text: '(Pièce jointe plus ancienne retirée pour respecter la taille maximale.)' };
      total += size;
      return p;
    });
  }
  return out;
}

/* ------------------------------------------------------------ Pièces jointes */

const TABULAR = /\.(csv|tsv|xlsx|xls|xlsm)$/i;
const TEXT_EXT = /\.(txt|md|markdown|json|xml|html?|js|ts|tsx|jsx|py|sql|yaml|yml|log|ini|cfg|geojson|kml|gpx|rtf|tex)$/i;
const INLINE_MIME = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif)|audio\/|video\/)/;
const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg',
  flac: 'audio/flac', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
};

export const isTabular = (f: File) => TABULAR.test(f.name);

export interface Prepared {
  parts: Part[];
  /** Avertissement à montrer à l'utilisateur (fichier trop gros, format illisible…) */
  note?: string;
}

/** Convertit un fichier non tabulaire en parties Gemini. */
export async function prepareFile(file: File): Promise<Prepared> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mime = file.type || EXT_MIME[ext] || '';
  const header = { text: `Fichier joint : « ${file.name} » (${Math.round(file.size / 1024)} Ko).` };

  if (INLINE_MIME.test(mime)) {
    if (file.size > MAX_INLINE_BYTES) {
      return { parts: [{ text: `${header.text} Trop volumineux pour être envoyé (maximum 15 Mo).` }], note: `« ${file.name} » dépasse 15 Mo : l'assistant ne pourra pas le lire.` };
    }
    return { parts: [header, { inlineData: { mimeType: mime, data: await toBase64(file) } }] };
  }

  if (mime.startsWith('text/') || TEXT_EXT.test(file.name) || mime === 'application/json' || mime === 'application/xml') {
    let text = await file.slice(0, MAX_TEXT_CHARS * 2).text();
    const cut = text.length > MAX_TEXT_CHARS || file.size > MAX_TEXT_CHARS * 2;
    text = text.slice(0, MAX_TEXT_CHARS);
    return {
      parts: [{ text: `${header.text}${cut ? ' (début du fichier seulement)' : ''}\n\n${text}` }],
      note: cut ? `« ${file.name} » est long : seul le début est envoyé à l'assistant.` : undefined,
    };
  }

  return {
    parts: [{ text: `${header.text} Format non lisible par l'assistant.` }],
    note: `« ${file.name} » : ce format ne peut pas être lu par l'assistant (essayez PDF, image, texte, CSV ou Excel).`,
  };
}

/** Envoie un fichier comme texte brut (début seulement s'il est long). */
export async function fileAsText(file: File): Promise<Prepared> {
  const text = await file.slice(0, MAX_TEXT_CHARS * 2).text();
  const cut = text.length > MAX_TEXT_CHARS || file.size > MAX_TEXT_CHARS * 2;
  return {
    parts: [{ text: `Fichier joint : « ${file.name} » (${Math.round(file.size / 1024)} Ko)${cut ? ', début du fichier seulement' : ''} :\n\n${text.slice(0, MAX_TEXT_CHARS)}` }],
    note: cut ? `« ${file.name} » est long et ses colonnes ne sont pas celles d'un fichier de permis : seul le début est envoyé.` : undefined,
  };
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
