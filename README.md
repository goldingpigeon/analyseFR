# Permis de construire — explorateur local

**tamim k. · 2026 edition**

Application web d'une seule page pour filtrer les fichiers officiels
« Liste des permis de construire et autres autorisations d'urbanisme »
(data.gouv.fr / DiDo) par période, et obtenir pour chaque permis le **code commune (INSEE)**
et la **date d'autorisation**.

Tout se passe dans votre navigateur : **aucun fichier n'est envoyé sur internet**.

## Fonctionnalités

- Glisser-déposer d'un ou plusieurs fichiers **CSV** ou **Excel (.xlsx)** : logements,
  locaux non résidentiels, permis d'aménager, permis de démolir. Chaque ligne garde le
  nom du fichier d'origine.
- Fichiers énormes acceptés (jusqu'à ~1 Go) : le CSV est lu **par tranches de 8 Mo**
  dans un Web Worker, jamais en entier en mémoire. L'interface ne se fige pas.
- Séparateur point-virgule, virgule ou tabulation ; encodage UTF-8 ou Latin-1 ;
  dates au format `AAAA-MM-JJ` ou `JJ/MM/AAAA` (et dates Excel).
- Détection automatique des colonnes (`COMM`, `DATE_REELLE_AUTORISATION`, `DEP`,
  `NUM_DAU`, `DENOM_DEM`, `SIREN_DEM`, `NB_LGT_TOT_CREES`, `SURF_HAB_CREEE`…).
  Si elles ne sont pas reconnues, des menus permettent de les choisir.
  Quand `COMM` ne contient que 3 chiffres, le code INSEE est recomposé avec `DEP`.
- Filtres : période (Du / Au + raccourcis), codes communes, département.
- Résultats : cartes de synthèse, vue « Par commune », tri par colonne, tableau virtualisé
  (fluide même avec des centaines de milliers de lignes).
- **Exporter pour Excel** : CSV en UTF-8 avec BOM et points-virgules, qui s'ouvre
  directement dans Excel en français.

## Installation

Il faut [Node.js](https://nodejs.org) 22.12.0 ou plus récent.

```bash
npm install
```

## Lancer en développement

```bash
npm run dev
```

Puis ouvrez l'adresse affichée (en général http://localhost:5173).

Pour tester sans télécharger les vrais fichiers, cliquez sur
**« Essayer avec le fichier d'exemple »** : il charge `public/exemple-permis.csv`
(20 permis fictifs).

## Construire la version finale

```bash
npm run build
```

Le site prêt à publier est créé dans le dossier `dist/`. Pour le tester localement :

```bash
npm run preview
```

Le contenu de `dist/` peut être hébergé sur n'importe quel hébergeur de fichiers statiques
(Netlify, GitHub Pages, un simple serveur web…).

## Comptes utilisateurs (facultatif)

La connexion utilise [Supabase](https://supabase.com) (gratuit). Sans configuration, le site
fonctionne normalement et le bouton « Se connecter » indique que la connexion n'est pas activée.

1. Créez un projet sur supabase.com.
2. **Authentication → URL Configuration** : *Site URL* =
   `https://goldingpigeon.github.io/analyseFR/` (ajoutez-la aussi dans *Redirect URLs*).
3. **Project Settings → API** : copiez la *Project URL* et la clé *anon public*.
4. Dans GitHub : **Settings → Secrets and variables → Actions → onglet Variables**, créez
   `SUPABASE_URL` et `SUPABASE_ANON_KEY`, puis relancez le workflow « Publier sur GitHub Pages ».

En local, mettez-les dans un fichier `.env.local` :

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=votre-cle-anon
```

Seuls le prénom et l'adresse e-mail sont enregistrés chez Supabase. Les fichiers analysés
ne quittent jamais l'appareil.

## Assistant IA (Claude Haiku 5.5, Google Gemini en secours)

Une fois connecté, la zone « Quoi de neuf ? » est un chat. On peut y joindre n'importe quel fichier :

- **CSV / Excel de permis** : analysés sur l'appareil par l'application ; seuls des totaux
  (par commune, mois, département, type) sont envoyés à l'IA. Aucun nom, SIREN ni n° de permis.
- **PDF, images, audio, vidéo** (15 Mo max) et **fichiers texte** : envoyés au service d'IA.
- Les résultats affichés dans l'espace de travail servent aussi de contexte.

Installation (une seule fois) :

1. Créez une clé gratuite sur https://aistudio.google.com/apikey (ou une clé Mistral).
2. Déploiement automatique : créez un jeton sur https://supabase.com/dashboard/account/tokens et
   ajoutez-le dans GitHub (**Settings → Secrets and variables → Actions → Secrets**) sous le nom
   `SUPABASE_ACCESS_TOKEN`. Le workflow « Déployer la fonction assistant » envoie ensuite
   `supabase/functions/assistant` dans Supabase à chaque modification.
3. Supabase → **Edge Functions → Secrets** : ajoutez `ANTHROPIC_API_KEY` (Claude, payant, utilisé en priorité ;
   `CLAUDE_MODEL` par défaut `claude-haiku-5-5`) et/ou `GEMINI_API_KEY` (gratuit, pris en secours
   automatiquement si Claude échoue).

La clé reste dans Supabase ; seuls les utilisateurs connectés peuvent appeler l'assistant.

## Historique des conversations et connexion Google

- **Historique** : exécutez une fois `supabase/migrations/20261128000000_conversations.sql` dans
  Supabase → **SQL Editor**. Chaque utilisateur ne voit que ses propres conversations.
  Les pièces jointes (images, PDF) ne sont pas conservées, seulement leur nom.
- **Google** : Supabase → **Authentication → Sign In / Providers → Google**, avec un identifiant
  OAuth créé dans Google Cloud (URI de redirection : `https://<projet>.supabase.co/auth/v1/callback`).

## Où trouver les fichiers

Sur data.gouv.fr, cherchez « Liste des permis de construire et autres autorisations
d'urbanisme » (données publiées via DiDo, ministère de la Transition écologique).
Téléchargez les fichiers CSV qui vous intéressent puis déposez-les dans l'application.

## Technique

Vite · React · TypeScript · Tailwind CSS · Framer Motion · PapaParse · SheetJS ·
@tanstack/react-virtual. Lecture et filtrage dans un Web Worker
(`src/worker/parser.worker.ts`).

Les animations respectent le réglage système « réduire les animations ».
