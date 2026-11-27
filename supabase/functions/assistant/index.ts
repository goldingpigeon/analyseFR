// Fonction Supabase « assistant » : relaie les questions du chat vers Google Gemini.
// La clé GEMINI_API_KEY reste ici, côté serveur : elle n'est jamais envoyée au navigateur.
// Seuls les utilisateurs connectés peuvent l'appeler.
//
// Secrets à définir dans Supabase (Edge Functions → Secrets) :
//   GEMINI_API_KEY   (obligatoire) clé Google AI Studio (« AIza… », https://aistudio.google.com/apikey)
//                    ou clé Vertex AI en mode express (« AQ.… »)
//   GEMINI_MODEL     (facultatif)  par défaut « gemini-flash-latest » (AI Studio) / « gemini-2.5-flash » (Vertex)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM = `Tu es l'assistant de « Données / Locales », une application qui aide à explorer
les fichiers officiels français des permis de construire et autres autorisations d'urbanisme
(base Sitadel, publiée sur data.gouv.fr / DiDo : logements, locaux non résidentiels,
permis d'aménager, permis de démolir).

Règles :
- Réponds toujours en français, de façon claire et concise. Utilise du Markdown (listes, gras, tableaux) quand c'est utile.
- Quand des statistiques calculées par l'application sont fournies, appuie-toi uniquement sur elles et cite les chiffres. N'invente jamais de données.
- Si une information manque pour répondre, dis-le simplement et propose ce qu'il faudrait faire (par ex. lancer une recherche dans l'espace de travail).
- Les codes communes sont des codes INSEE à 5 caractères (ex. 12145 = Millau). Les dates sont au format JJ/MM/AAAA.
- Tu peux aussi aider sur tout autre fichier ou question que l'utilisateur t'envoie.`;

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };
type Msg = { role: 'user' | 'model'; parts: Part[] };

/** Nettoie une clé collée avec des espaces, retours à la ligne ou guillemets autour. */
const clean = (v: string | null | undefined) => (v ?? '').trim().replace(/^["'`]+|["'`]+$/g, '').replace(/[^\x21-\x7E]/g, '');

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée.' });
  try {
    return await handle(req);
  } catch (e) {
    console.error(e);
    return json(500, { error: `Erreur interne de l'assistant : ${(e as Error).message ?? e}` });
  }
});

async function handle(req: Request): Promise<Response> {
  // 1. Vérifier que l'utilisateur est connecté
  const auth = (req.headers.get('Authorization') ?? '').trim();
  const supabaseUrl = clean(Deno.env.get('SUPABASE_URL'));
  const anonKey = clean(Deno.env.get('SUPABASE_ANON_KEY')) || clean(req.headers.get('apikey'));
  if (!auth.startsWith('Bearer ') || !supabaseUrl) return json(401, { error: 'Connectez-vous pour utiliser l’assistant.' });
  const who = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: auth, apikey: anonKey } });
  if (!who.ok) return json(401, { error: 'Session expirée : reconnectez-vous.' });

  // 2. Lire la conversation
  // (on retire aussi un éventuel « GEMINI_API_KEY= » collé avec la valeur)
  const key = clean(Deno.env.get('GEMINI_API_KEY')).replace(/^GEMINI_API_KEY[:=]/i, '');
  if (!key) return json(500, { error: "La clé GEMINI_API_KEY n'est pas configurée dans Supabase." });
  let messages: Msg[];
  try {
    ({ messages } = await req.json());
    if (!Array.isArray(messages) || !messages.length) throw new Error();
  } catch {
    return json(400, { error: 'Requête invalide.' });
  }

  // 3. Appeler Gemini en flux (SSE) et ne renvoyer que le texte au navigateur.
  //    Clé « AIza… » → API Gemini (AI Studio). Clé « AQ.… » → Vertex AI (mode express).
  const custom = clean(Deno.env.get('GEMINI_MODEL'));
  // Réponse rapide : pas de « réflexion » silencieuse pour les modèles 2.5 Flash.
  const body = (m: string) =>
    JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: messages,
      generationConfig: { temperature: 0.4, ...(/2\.5-flash/.test(m) ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
    });
  const studio = (m: string) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:streamGenerateContent?alt=sse`;
  const vertex = (m: string) => `https://aiplatform.googleapis.com/v1/publishers/google/models/${m}:streamGenerateContent?alt=sse`;
  const targets: [string, string][] = key.startsWith('AQ.')
    ? [[vertex(custom || 'gemini-2.5-flash'), custom || 'gemini-2.5-flash'], [studio(custom || 'gemini-flash-latest'), custom || 'gemini-flash-latest']]
    : [[studio(custom || 'gemini-flash-latest'), custom || 'gemini-flash-latest'], [vertex(custom || 'gemini-2.5-flash'), custom || 'gemini-2.5-flash']];

  let upstream: Response | null = null;
  let detail = '';
  for (const [url, m] of targets) {
    try {
      upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: body(m),
        signal: AbortSignal.timeout(45_000), // délai max avant le début de la réponse
      });
    } catch (e) {
      console.error(url.split('?')[0], e);
      return json(504, { error: 'Google met trop de temps à répondre (plus de 45 s). Réessayez dans un instant.' });
    }
    if (upstream.ok && upstream.body) break;
    detail = await upstream.text().catch(() => '');
    console.error(url.split('?')[0], upstream.status, detail.slice(0, 500));
    // Clé refusée par ce service : on essaie l'autre. Sinon (quota, modèle…) on s'arrête.
    if (![400, 401, 403].includes(upstream.status) || !/key|credential|auth|permission/i.test(detail)) break;
  }
  if (!upstream || !upstream.ok || !upstream.body) {
    const st = upstream?.status ?? 0;
    let msg = `Google a répondu avec une erreur (${st}).`;
    if (st === 429) msg = "Limite d'utilisation de Gemini atteinte. Réessayez dans une minute.";
    else if ([400, 401, 403].includes(st) && /key|credential|auth/i.test(detail)) msg = 'La clé GEMINI_API_KEY est refusée par Google. Créez une clé sur aistudio.google.com/apikey (elle commence par « AIza »).';
    else if (st === 403 && /permission|disabled|not been used/i.test(detail)) msg = "La clé n'a pas accès à l'API Gemini (API désactivée sur le projet Google ?).";
    else if (st === 404) msg = 'Modèle introuvable. Ajoutez le secret GEMINI_MODEL (par ex. gemini-2.5-flash).';
    const m = detail.match(/"message":\s*"([^"]{1,200})/);
    if (m && !msg.includes('Limite')) msg += ` Détail : ${m[1]}`;
    return json(502, { error: msg });
  }

  const reader = upstream.body.getReader();
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      let buf = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith('data:')) continue;
            try {
              const ev = JSON.parse(line.slice(5));
              const parts = ev?.candidates?.[0]?.content?.parts ?? [];
              for (const p of parts) if (typeof p.text === 'string' && !p.thought) ctrl.enqueue(enc.encode(p.text));
              const block = ev?.promptFeedback?.blockReason;
              if (block) ctrl.enqueue(enc.encode(`\n\n_(Réponse bloquée par Gemini : ${block}.)_`));
            } catch {
              /* ligne incomplète : ignorée */
            }
          }
        }
      } catch (e) {
        ctrl.enqueue(enc.encode(`\n\n_(La réponse a été interrompue : ${String(e)})_`));
      }
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' } });
}
