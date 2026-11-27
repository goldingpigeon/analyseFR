// Fonction Supabase « assistant » : relaie les questions du chat vers Google Gemini.
// La clé GEMINI_API_KEY reste ici, côté serveur : elle n'est jamais envoyée au navigateur.
// Seuls les utilisateurs connectés peuvent l'appeler.
//
// Secrets à définir dans Supabase (Edge Functions → Secrets) :
//   GEMINI_API_KEY   (obligatoire) clé créée sur https://aistudio.google.com/apikey
//   GEMINI_MODEL     (facultatif)  par défaut « gemini-flash-latest »

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
  const key = clean(Deno.env.get('GEMINI_API_KEY'));
  if (!key) return json(500, { error: "La clé GEMINI_API_KEY n'est pas configurée dans Supabase." });
  if (!/^[A-Za-z0-9_\-]{20,}$/.test(key)) {
    return json(500, { error: 'La clé GEMINI_API_KEY semble mal copiée (caractères inattendus). Recopiez-la depuis aistudio.google.com/apikey.' });
  }
  let messages: Msg[];
  try {
    ({ messages } = await req.json());
    if (!Array.isArray(messages) || !messages.length) throw new Error();
  } catch {
    return json(400, { error: 'Requête invalide.' });
  }

  // 3. Appeler Gemini en flux (SSE) et ne renvoyer que le texte au navigateur
  const model = clean(Deno.env.get('GEMINI_MODEL')) || 'gemini-flash-latest';
  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: messages,
        generationConfig: { temperature: 0.4 },
      }),
    },
  );
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    let msg = `Gemini a répondu avec une erreur (${upstream.status}).`;
    if (upstream.status === 429) msg = 'Limite d’utilisation de Gemini atteinte. Réessayez dans une minute.';
    if (upstream.status === 400 && /API key/i.test(detail)) msg = 'La clé GEMINI_API_KEY est invalide.';
    if (upstream.status === 404) msg = `Le modèle « ${model} » est introuvable. Changez le secret GEMINI_MODEL.`;
    console.error(upstream.status, detail.slice(0, 500));
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
