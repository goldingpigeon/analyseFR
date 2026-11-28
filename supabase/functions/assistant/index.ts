// Fonction Supabase « assistant » : relaie les questions du chat vers une IA (Mistral ou Google Gemini).
// Les clés restent ici, côté serveur : elles ne sont jamais envoyées au navigateur.
// Seuls les utilisateurs connectés peuvent l'appeler.
//
// Secrets (Supabase → Edge Functions → Secrets) — un seul suffit :
//   MISTRAL_API_KEY  clé créée sur https://console.mistral.ai/api-keys  (utilisée en priorité)
//   GEMINI_API_KEY   clé créée sur https://aistudio.google.com/apikey
//   AI_MODEL         (facultatif) nom de modèle à forcer

import { CREATOR, KNOWLEDGE } from './knowledge.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM = `Tu es l'assistant IA d'une application qui aide à explorer
les fichiers officiels français des permis de construire et autres autorisations d'urbanisme
(base Sitadel, publiée sur data.gouv.fr / DiDo : logements, locaux non résidentiels,
permis d'aménager, permis de démolir).

Règles :
- Réponds toujours en français, de façon claire et concise. Utilise du Markdown (listes, gras, tableaux) quand c'est utile.
- Quand des statistiques calculées par l'application sont fournies, appuie-toi uniquement sur elles et cite les chiffres. N'invente jamais de données.
- Si une information manque pour répondre, dis-le simplement et propose ce qu'il faudrait faire (par ex. lancer une recherche dans l'espace de travail).
- Les codes communes sont des codes INSEE à 5 caractères (ex. 12145 = Millau). Les dates sont au format JJ/MM/AAAA.
- Tu peux aussi aider sur tout autre fichier ou question que l'utilisateur t'envoie.
- Pour les questions sur la façon de trouver ou d'exploiter les permis (liens, procédure, prospection CSPS), appuie-toi sur le document de référence ci-dessous et donne ses liens.

${CREATOR}

${KNOWLEDGE}`;

/** Format envoyé par le site (celui de Gemini). */
type Part = { text: string } | { inlineData: { mimeType: string; data: string } };
type Msg = { role: 'user' | 'model'; parts: Part[] };

/** La fonction répond toujours avant cette limite (bien sous celles de Supabase). */
const BUDGET_MS = 25_000;

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
  const deadline = Date.now() + BUDGET_MS;

  // 1. Vérifier que l'utilisateur est connecté
  const auth = (req.headers.get('Authorization') ?? '').trim();
  const supabaseUrl = clean(Deno.env.get('SUPABASE_URL'));
  const anonKey = clean(Deno.env.get('SUPABASE_ANON_KEY')) || clean(req.headers.get('apikey'));
  if (!auth.startsWith('Bearer ') || !supabaseUrl) return json(401, { error: 'Connectez-vous pour utiliser l’assistant.' });
  const who = await timed(fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: auth, apikey: anonKey } }), 8_000);
  if (!who?.ok) return json(401, { error: 'Session expirée : reconnectez-vous.' });

  // 2. Lire la conversation
  let messages: Msg[];
  try {
    ({ messages } = await req.json());
    if (!Array.isArray(messages) || !messages.length) throw new Error();
  } catch {
    return json(400, { error: 'Requête invalide.' });
  }

  // 3. Choisir le fournisseur d'IA selon la clé disponible
  const mistralKey = clean(Deno.env.get('MISTRAL_API_KEY')).replace(/^MISTRAL_API_KEY[:=]/i, '');
  const geminiKey = clean(Deno.env.get('GEMINI_API_KEY')).replace(/^GEMINI_API_KEY[:=]/i, '');
  const forced = clean(Deno.env.get('AI_MODEL')) || clean(Deno.env.get('GEMINI_MODEL'));
  if (mistralKey) return mistral(mistralKey, messages, forced, deadline);
  if (geminiKey) return gemini(geminiKey, messages, forced, deadline);
  return json(500, { error: "Aucune clé d'IA n'est configurée : ajoutez le secret MISTRAL_API_KEY dans Supabase." });
}

/* ================================================================ Mistral */

async function mistral(key: string, messages: Msg[], forced: string, deadline: number): Promise<Response> {
  // Conversion vers le format Mistral (texte, images, PDF)
  const body = (model: string) =>
    JSON.stringify({
      model,
      stream: true,
      temperature: 0.4,
      messages: [
        { role: 'system', content: SYSTEM },
        ...messages.map((m) =>
          m.role === 'model'
            ? { role: 'assistant', content: m.parts.map((p) => ('text' in p ? p.text : '')).join('\n') }
            : {
                role: 'user',
                content: m.parts.map((p) => {
                  if ('text' in p) return { type: 'text', text: p.text };
                  const uri = `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`;
                  return p.inlineData.mimeType === 'application/pdf'
                    ? { type: 'document_url', document_url: uri }
                    : { type: 'image_url', image_url: uri };
                }),
              },
        ),
      ],
    });

  const models = forced ? [forced] : ['mistral-medium-latest', 'mistral-small-latest']; // principal, puis secours
  let res: Response | null = null;
  let status = 0;
  let detail = '';
  for (const model of models) {
    res = await timed(
      fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${key}` },
        body: body(model),
      }),
      deadline - Date.now(),
    );
    if (res?.ok && res.body) break;
    status = res?.status ?? 504;
    detail = res ? await res.text().catch(() => '') : 'délai dépassé';
    console.error('Mistral', model, status, detail.slice(0, 300));
    if (![429, 500, 502, 503, 504].includes(status)) break; // clé, requête… : le secours n'y changera rien
  }

  if (!res?.ok || !res.body) {
    let msg = `Mistral a répondu avec une erreur (${status}).`;
    if (status === 401 || status === 403) msg = 'Mistral refuse la clé MISTRAL_API_KEY. Recopiez-la depuis console.mistral.ai/api-keys.';
    else if (status === 429) msg = "Limite d'utilisation de Mistral atteinte. Réessayez dans une minute.";
    else if (status >= 500) msg = 'Mistral est surchargé en ce moment. Réessayez dans une minute.';
    else {
      const d = detail.match(/"(?:message|detail)":\s*"([^"]{1,200})/);
      if (d) msg += ` Détail : ${d[1]}`;
      if (/document|pdf/i.test(detail)) msg += ' (Ce fichier PDF ne peut peut-être pas être lu par Mistral.)';
    }
    return json(502, { error: msg });
  }

  // Flux SSE Mistral : data: {"choices":[{"delta":{"content":"..."}}]} … data: [DONE]
  return relay(res.body, (ev) => {
    const c = ev?.choices?.[0]?.delta?.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map((x: { text?: string }) => x?.text ?? '').join('');
    return '';
  });
}

/* ================================================================ Gemini */

async function gemini(key: string, messages: Msg[], forced: string, deadline: number): Promise<Response> {
  // Gemma (modèle ouvert de Google) a son propre quota gratuit, bien plus large : dernier secours.
  // Il ne connaît ni les instructions système ni le réglage de « réflexion » : on adapte la requête.
  const isGemma = (m: string) => m.startsWith('gemma');
  const body = (m: string, fast: boolean) => {
    if (isGemma(m)) {
      const contents = messages.map((msg, i) => ({
        role: msg.role,
        parts: [
          ...(i === 0 ? [{ text: `${SYSTEM}\n\n---\n` }] : []),
          // Gemma lit le texte et les images, pas les PDF / audio / vidéo
          ...msg.parts.map((p) =>
            'inlineData' in p && !p.inlineData.mimeType.startsWith('image/')
              ? { text: '(Pièce jointe non lisible par le modèle de secours.)' }
              : p,
          ),
        ],
      }));
      return JSON.stringify({ contents, generationConfig: { temperature: 0.4 } });
    }
    return JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: messages,
      generationConfig: { temperature: 0.4, ...(fast ? { thinkingConfig: { thinkingLevel: 'low' } } : {}) },
    });
  };
  const url = (m: string) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:streamGenerateContent?alt=sse`;

  const models = forced ? [forced] : ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemma-3-27b-it'];
  // Un modèle surchargé n'a droit qu'à 10 s, pour laisser le temps aux modèles de secours.
  const call = (m: string, fast: boolean, last: boolean) =>
    timed(
      fetch(url(m), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: body(m, fast) }),
      last ? deadline - Date.now() : Math.min(10_000, deadline - Date.now()),
    );

  let res: Response | null = null;
  let status = 0;
  let detail = '';
  for (let i = 0; i < models.length; i++) {
    const m = models[i];
    const last = i === models.length - 1;
    res = await call(m, !isGemma(m), last);
    if (res && res.status === 400 && !isGemma(m)) {
      detail = await res.text().catch(() => '');
      res = /thinking/i.test(detail) ? await call(m, false, last) : new Response(detail, { status: 400 });
    }
    if (res?.ok && res.body) break;
    status = res?.status ?? 504;
    detail = res ? await res.text().catch(() => '') : 'délai dépassé';
    console.error('Gemini', m, status, detail.slice(0, 300));
    // surcharge, quota épuisé ou modèle indisponible : on passe au suivant
    if (![404, 429, 500, 503, 504].includes(status)) break;
  }
  if (!res?.ok || !res.body) {
    let msg = `Google a répondu avec une erreur (${status}).`;
    if ([500, 503, 504].includes(status)) msg = 'Les modèles gratuits de Google sont surchargés en ce moment. Réessayez dans quelques minutes.';
    else if (status === 429) msg = "Le quota gratuit de Google est épuisé pour l'instant (il se renouvelle chaque jour). Réessayez plus tard.";
    else if ([400, 401, 403].includes(status) && /key|credential|auth|permission/i.test(detail)) msg = 'Google refuse la clé GEMINI_API_KEY.';
    else if (status === 404) msg = 'Aucun modèle disponible. Ajoutez le secret AI_MODEL avec un nom de modèle listé dans AI Studio.';
    return json(502, { error: msg });
  }
  return relay(res.body, (ev) => {
    const parts = ev?.candidates?.[0]?.content?.parts ?? [];
    let out = '';
    for (const p of parts) if (typeof p.text === 'string' && !p.thought) out += p.text;
    const block = ev?.promptFeedback?.blockReason;
    if (block) out += `\n\n_(Réponse bloquée : ${block}.)_`;
    return out;
  });
}

/* ================================================================ Outils */

/** Attend une promesse au plus `ms` millisecondes ; renvoie null si le délai est dépassé ou en cas d'erreur réseau. */
async function timed<T>(p: Promise<T>, ms: number): Promise<T | null> {
  if (ms < 1_000) return null;
  let timer: number | undefined;
  try {
    return await Promise.race([p, new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), ms)))]);
  } catch (e) {
    console.error('réseau', e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Relaie un flux SSE en ne gardant que le texte, au fil de l'eau. */
function relay(upstream: ReadableStream<Uint8Array>, extract: (ev: any) => string): Response {
  const reader = upstream.getReader();
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
            const data = line.slice(5).trim();
            if (data === '[DONE]') continue;
            try {
              const text = extract(JSON.parse(data));
              if (text) ctrl.enqueue(enc.encode(text));
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
