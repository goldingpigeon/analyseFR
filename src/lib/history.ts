import { supabase } from './auth';
import type { Part } from './ai';

/** Message tel qu'il est enregistré (sans les fichiers binaires, trop lourds). */
export interface StoredMsg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  files?: { name: string; size: number }[];
  notes?: string[];
  parts?: Part[];
  status?: 'done' | 'error' | 'stopped';
}

export interface ConvSummary {
  id: string;
  title: string;
  updated_at: string;
}

/** Erreur lisible ; `missing` = la table n'a pas encore été créée dans Supabase. */
export class HistoryError extends Error {
  constructor(message: string, public missing = false) {
    super(message);
  }
}

function fail(e: { message?: string; code?: string } | null): never {
  const msg = e?.message ?? '';
  if (e?.code === '42P01' || e?.code === 'PGRST205' || /does not exist|could not find the table/i.test(msg)) {
    throw new HistoryError("L'historique n'est pas encore activé (table « conversations » absente dans Supabase).", true);
  }
  if (e?.code === '42501' || /permission denied/i.test(msg)) {
    throw new HistoryError(
      "Historique indisponible : accès refusé à la table « conversations ». Dans Supabase → SQL Editor, exécutez : grant select, insert, update, delete on table public.conversations to authenticated;",
    );
  }
  throw new HistoryError(`Historique indisponible : ${msg || 'erreur inconnue'}`);
}

const db = () => {
  if (!supabase) throw new HistoryError("La connexion n'est pas activée sur ce site.");
  return supabase.from('conversations');
};

/** Message en cours (peut être encore « en train d'écrire »). */
type LiveMsg = Omit<StoredMsg, 'status'> & { status?: string };

/** Retire les pièces jointes binaires (images, PDF…) : seul leur nom reste dans l'historique. */
function serialize(messages: LiveMsg[]): StoredMsg[] {
  return messages
    .filter((m) => m.role === 'user' || m.status === 'done' || m.status === 'error' || m.status === 'stopped')
    .map(({ id, role, text, files, notes, parts, status }) => ({
      id,
      role,
      text,
      ...(files?.length ? { files } : {}),
      ...(notes?.length ? { notes } : {}),
      ...(parts ? { parts: parts.map((p) => ('inlineData' in p ? { text: '(Pièce jointe envoyée lors de la conversation d’origine, non conservée.)' } : p)) } : {}),
      ...(status ? { status: status as StoredMsg['status'] } : {}),
    }));
}

export function titleFrom(messages: LiveMsg[]): string {
  const first = messages.find((m) => m.role === 'user');
  const raw = first?.text?.trim() || (first?.files?.length ? `Analyse de ${first.files.map((f) => f.name).join(', ')}` : '');
  const one = raw.replace(/\s+/g, ' ');
  return one ? (one.length > 70 ? `${one.slice(0, 67)}…` : one) : 'Nouvelle conversation';
}

export async function listConversations(): Promise<ConvSummary[]> {
  const { data, error } = await db().select('id, title, updated_at').order('updated_at', { ascending: false }).limit(200);
  if (error) fail(error);
  return data ?? [];
}

export async function loadConversation(id: string): Promise<StoredMsg[]> {
  const { data, error } = await db().select('messages').eq('id', id).single();
  if (error) fail(error);
  return (data?.messages as StoredMsg[]) ?? [];
}

/** Crée (id = null) ou met à jour une conversation ; renvoie son identifiant. */
export async function saveConversation(id: string | null, messages: LiveMsg[]): Promise<string> {
  const payload = { title: titleFrom(messages), messages: serialize(messages), updated_at: new Date().toISOString() };
  if (id) {
    const { error } = await db().update(payload).eq('id', id);
    if (error) fail(error);
    return id;
  }
  const { data, error } = await db().insert(payload).select('id').single();
  if (error) fail(error);
  return data!.id as string;
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await db().delete().eq('id', id);
  if (error) fail(error);
}
