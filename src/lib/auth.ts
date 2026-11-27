import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

/**
 * Comptes utilisateurs via Supabase Auth.
 * L'URL et la clé « anon » sont publiques par conception (elles servent côté navigateur) :
 * elles sont fournies au moment de la construction par VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
 * Sans elles, la connexion reste désactivée et l'application fonctionne sans compte.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
export const authEnabled = supabase !== null;

/** Adresse où renvoient les e-mails de confirmation et de réinitialisation. */
const redirectTo = () => `${window.location.origin}${import.meta.env.BASE_URL}`;

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(authEnabled);
  /** true quand on revient du lien « mot de passe oublié » : il faut choisir un nouveau mot de passe. */
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, loading, recovery, endRecovery: () => setRecovery(false) };
}

export function firstName(session: Session | null): string {
  const meta = session?.user.user_metadata as { prenom?: string; given_name?: string; full_name?: string; name?: string } | undefined;
  if (meta?.prenom?.trim()) return meta.prenom.trim();
  // compte Google : prénom fourni par Google
  if (meta?.given_name?.trim()) return meta.given_name.trim();
  const full = (meta?.full_name || meta?.name || '').trim();
  if (full) return full.split(/\s+/)[0];
  const local = session?.user.email?.split('@')[0] ?? '';
  const word = local.split(/[._\-+0-9]/).find(Boolean) ?? '';
  return word ? word[0].toUpperCase() + word.slice(1) : '';
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase!.auth.signInWithPassword({ email, password });
  if (error) throw new Error(frError(error.message));
}

/** Renvoie true si un e-mail de confirmation doit être validé avant la connexion. */
export async function signUp(prenom: string, email: string, password: string): Promise<boolean> {
  const { data, error } = await supabase!.auth.signUp({
    email,
    password,
    options: { data: { prenom: prenom.trim() }, emailRedirectTo: redirectTo() },
  });
  if (error) throw new Error(frError(error.message));
  // Supabase ne renvoie pas d'erreur si l'adresse existe déjà : l'utilisateur n'a alors aucune identité.
  if (data.user && data.user.identities?.length === 0) throw new Error('Un compte existe déjà avec cette adresse. Connectez-vous.');
  return !data.session;
}

export async function resetPassword(email: string) {
  const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
  if (error) throw new Error(frError(error.message));
}

export async function updatePassword(password: string) {
  const { error } = await supabase!.auth.updateUser({ password });
  if (error) throw new Error(frError(error.message));
}

/** Connexion avec Google : redirige vers Google puis revient sur le site. */
export async function signInWithGoogle() {
  const { error } = await supabase!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } });
  if (error) throw new Error(frError(error.message));
}

/** Vérifie si la connexion Google est activée dans Supabase (pour ne pas envoyer vers une page d'erreur). */
export async function googleEnabled(): Promise<boolean> {
  if (!url || !key) return false;
  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    const j = await r.json();
    return !!j?.external?.google;
  } catch {
    return false;
  }
}

export async function signOut() {
  await supabase?.auth.signOut();
}

function frError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Adresse e-mail ou mot de passe incorrect.';
  if (m.includes('email not confirmed')) return "Confirmez d'abord votre adresse e-mail : ouvrez le lien reçu par e-mail.";
  if (m.includes('already registered')) return 'Un compte existe déjà avec cette adresse. Connectez-vous.';
  if (m.includes('password should be at least') || m.includes('weak')) return 'Le mot de passe doit contenir au moins 6 caractères.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Trop de tentatives. Réessayez dans quelques minutes.';
  if (m.includes('invalid email') || m.includes('unable to validate email')) return "Cette adresse e-mail n'est pas valide.";
  if (m.includes('failed to fetch') || m.includes('network')) return 'Impossible de joindre le serveur. Vérifiez votre connexion internet.';
  if (m.includes('same password') || m.includes('different from the old')) return "Le nouveau mot de passe doit être différent de l'ancien.";
  return `Une erreur est survenue (${msg}).`;
}
