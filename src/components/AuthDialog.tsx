import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { authEnabled, resetPassword, signIn, signUp, updatePassword } from '../lib/auth';

export type AuthMode = 'connexion' | 'inscription' | 'oubli' | 'nouveau';

const TITLES: Record<AuthMode, [string, string]> = {
  connexion: ['Accès au compte', 'Connexion'],
  inscription: ['Bienvenue', 'Créer un compte'],
  oubli: ['Accès au compte', 'Mot de passe oublié'],
  nouveau: ['Sécurité', 'Nouveau mot de passe'],
};

export function AuthDialog({
  open,
  mode: initialMode,
  onClose,
  onDone,
}: {
  open: boolean;
  mode: AuthMode;
  onClose: () => void;
  /** Appelé après une connexion ou un changement de mot de passe réussi. */
  onDone: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [prenom, setPrenom] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError(null);
      setInfo(null);
      setPassword('');
    }
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);

  const switchTo = (m: AuthMode) => {
    setMode(m);
    setError(null);
    setInfo(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!authEnabled) {
      setInfo("La connexion n'est pas encore activée sur ce site. Vous pouvez utiliser l'espace de travail sans compte.");
      return;
    }
    setBusy(true);
    try {
      if (mode === 'connexion') {
        await signIn(email.trim(), password);
        onDone();
      } else if (mode === 'inscription') {
        const mustConfirm = await signUp(prenom, email.trim(), password);
        if (mustConfirm) {
          setInfo(`Presque fini ! Un e-mail de confirmation a été envoyé à ${email.trim()}. Cliquez sur le lien qu'il contient pour activer votre compte.`);
          setPassword('');
        } else onDone();
      } else if (mode === 'oubli') {
        await resetPassword(email.trim());
        setInfo(`Si un compte existe pour ${email.trim()}, vous allez recevoir un e-mail avec un lien pour choisir un nouveau mot de passe.`);
      } else {
        await updatePassword(password);
        onDone();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const [kicker, title] = TITLES[mode];
  const submitLabel =
    mode === 'connexion' ? 'Se connecter' : mode === 'inscription' ? 'Créer mon compte' : mode === 'oubli' ? 'Envoyer le lien' : 'Enregistrer';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-30 grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && mode !== 'nouveau') onClose();
          }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
            className="w-full max-w-md rounded-3xl border border-white/15 bg-[#101010] p-7 shadow-2xl sm:p-9"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
          >
            <div className="mb-7 flex items-start justify-between">
              <div>
                <p className="text-xs tracking-[0.18em] text-mist uppercase">{kicker}</p>
                <h2 id="auth-title" className="mt-3 font-display text-3xl text-white">
                  {title}
                </h2>
              </div>
              {mode !== 'nouveau' && (
                <button
                  type="button"
                  aria-label="Fermer la fenêtre de connexion"
                  className="rounded-full border border-white/15 px-3 py-1.5 text-mist hover:text-white"
                  onClick={onClose}
                >
                  ✕
                </button>
              )}
            </div>

            {(mode === 'connexion' || mode === 'inscription') && (
              <div className="mb-6 grid grid-cols-2 rounded-full border border-white/10 p-1 text-sm" role="tablist">
                {(['connexion', 'inscription'] as AuthMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => switchTo(m)}
                    className={`rounded-full py-2 transition-colors duration-200 ${mode === m ? 'bg-white text-black' : 'text-mist hover:text-white'}`}
                  >
                    {m === 'connexion' ? 'Se connecter' : 'Créer un compte'}
                  </button>
                ))}
              </div>
            )}

            <form className="space-y-4" onSubmit={submit}>
              {mode === 'inscription' && (
                <label className="block text-sm text-mist">
                  Prénom
                  <input className="field mt-2" autoComplete="given-name" placeholder="Votre prénom" required value={prenom} onChange={(e) => setPrenom(e.target.value)} />
                </label>
              )}
              {mode !== 'nouveau' && (
                <label className="block text-sm text-mist">
                  Adresse e-mail
                  <input className="field mt-2" type="email" autoComplete="email" placeholder="vous@exemple.fr" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
              )}
              {mode !== 'oubli' && (
                <label className="block text-sm text-mist">
                  <span className="flex items-center justify-between">
                    {mode === 'nouveau' ? 'Nouveau mot de passe' : 'Mot de passe'}
                    {mode === 'connexion' && (
                      <button type="button" className="text-xs text-mist underline decoration-white/30 underline-offset-4 hover:text-white" onClick={() => switchTo('oubli')}>
                        Mot de passe oublié ?
                      </button>
                    )}
                  </span>
                  <input
                    className="field mt-2"
                    type="password"
                    autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'}
                    placeholder={mode === 'connexion' ? 'Votre mot de passe' : '6 caractères minimum'}
                    minLength={mode === 'connexion' ? undefined : 6}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              )}

              {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
              {info && <p role="status" className="rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white">{info}</p>}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/85 disabled:opacity-60"
              >
                {busy ? 'Un instant…' : submitLabel}
              </button>
              {mode === 'oubli' && (
                <button type="button" className="w-full text-center text-xs text-mist hover:text-white" onClick={() => switchTo('connexion')}>
                  ← Retour à la connexion
                </button>
              )}
            </form>
            {mode !== 'nouveau' && (
              <p className="mt-5 text-center text-xs leading-5 text-mist">
                Aucun compte n'est nécessaire pour utiliser l'espace de travail. Vos fichiers ne quittent jamais votre appareil.
              </p>
            )}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
