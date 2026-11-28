// Connaissances de référence de l'assistant.
// Source : « Trouver les permis de construire de Millau — Les liens officiels et la procédure pas à pas »
// (Experts Géoconseils France, novembre 2026), fourni par Tamim. Transcrit en texte pour l'assistant.

export const CREATOR = `Tu as été créé par Tamim. Si on te demande qui t'a créé, qui t'a fait ou qui a fait cette application,
réponds que c'est Tamim qui t'a créé.`;

export const KNOWLEDGE = `
# Document de référence : « Trouver les permis de construire de Millau »
Les liens officiels et la procédure pas à pas pour extraire les permis d'une commune et les transformer en pistes de missions CSPS
(coordination sécurité et protection de la santé). Préparé pour Mohamed-Salah Kheidri, ing., Ph.D. — Experts Géoconseils France — novembre 2026.

## Le code à retenir
Millau = 12145. C'est le code INSEE de la commune, utilisé dans toutes les bases de l'État.
Ne pas confondre avec le code postal 12100, qui ne fonctionne pas comme filtre.
Pour une autre commune, son code INSEE se trouve sur la page Wikipédia de la commune ou sur le site de l'INSEE.

## Les trois façons de faire
| Option | Pour qui, pour quoi | Difficulté | Temps |
|---|---|---|---|
| 1. Explorateur du ministère (DiDo) | Filtrer Millau en ligne et télécharger seulement ses permis, en Excel | Facile | 10 min |
| 2. basedespermis.fr | Regarder rapidement les permis d'une commune avant un rendez-vous | Très facile | 5 min |
| 3. Fichiers complets + outil de filtrage | Plusieurs communes, tout un département, filtres avancés (logements, surface, personnes morales) | Moyenne | 20 min (téléchargement compris) |

## Quel fichier choisir ?
| Fichier | Contenu | Intérêt pour le CSPS |
|---|---|---|
| Locaux non résidentiels | Bâtiments d'activité, commerces, bureaux, équipements publics, bâtiments agricoles | Le plus utile : ce sont les opérations qui demandent le plus souvent un coordonnateur |
| Logements | Maisons, immeubles, résidences | Utile pour les opérations de plusieurs logements (promoteurs, bailleurs sociaux) |
| Permis d'aménager | Lotissements, aménagements | Repérer les futurs lotissements (VRD, puis maisons) |
| Permis de démolir | Démolitions | Démolition = risques particuliers (amiante, effondrement) : coordination souvent nécessaire |

## Option 1 — L'explorateur du ministère (recommandé)
L'application de diffusion des données du ministère de la Transition écologique (DiDo) affiche les données, permet de nombreux filtrages
et télécharge le résultat en csv, xlsx, json ou geojson.
Lien : catalogue DiDo — permis de construire : https://www.statistiques.developpement-durable.gouv.fr/catalogue?page=dataset&datasetId=6513f0189d7d312c80ec5b5b
Étapes :
1. Ouvrir le lien. La page présente le jeu de données « Liste des permis de construire et autres autorisations d'urbanisme ».
2. Dans la liste des fichiers, cliquer sur « Liste des autorisations d'urbanisme créant des locaux non résidentiels » (puis la même chose avec les logements).
3. Ouvrir l'onglet ou le bouton qui affiche les données (aperçu, exploration ou « Données »).
4. Ajouter un filtre sur la colonne de la commune, nommée COMM : choisir « égal à » et taper 12145.
5. Ajouter si souhaité un filtre sur la date d'autorisation (par exemple depuis le 1er janvier 2025).
6. Cliquer sur Télécharger et choisir le format xlsx : le fichier s'ouvre directement dans Excel.
7. Dans Excel, trier par date d'autorisation (de la plus récente à la plus ancienne) et repérer les demandeurs qui sont des sociétés, des communes ou des bailleurs.
Si l'interface a changé et que le filtre est introuvable, passer à l'option 3.

## Option 2 — basedespermis.fr
Un site qui réutilise la base officielle et présente, commune par commune, toutes les autorisations enregistrées :
permis de construire, permis d'aménager, permis de démolir et déclarations préalables.
Lien (présentation sur data.gouv.fr, avec le lien vers le site) : https://www.data.gouv.fr/reuses/basedespermis-fr
Étapes :
1. Ouvrir le lien, puis cliquer sur le bouton qui mène au site basedespermis.fr.
2. Taper « Millau » dans la recherche de commune.
3. Parcourir les permis récents ; ouvrir ceux déposés par des sociétés ou des collectivités.
4. Noter les projets intéressants dans le tableau de prospection (maître d'ouvrage, projet, date, adresse).
C'est une réutilisation privée de données publiques : pour un projet important, vérifier l'information dans la base officielle (option 1).

## Option 3 — Les fichiers complets et l'outil de filtrage
Les fichiers contiennent toute la France depuis 2013. Ils sont lourds (locaux non résidentiels ≈ 360 Mo, logements ≈ 948 Mo,
permis d'aménager ≈ 34 Mo, permis de démolir ≈ 57 Mo), mais l'outil de filtrage les traite en une à deux minutes sur l'ordinateur,
sans rien envoyer sur Internet.
Page du jeu de données (téléchargements) : https://www.data.gouv.fr/datasets/689c42fa521ccf80ce954f83/
Dans CETTE application, l'outil de filtrage est « l'espace de travail » : on y dépose le fichier CSV ou Excel, on règle les filtres,
on lance la recherche et on exporte pour Excel.
Procédure :
1. Télécharger le fichier voulu (commencer par les locaux non résidentiels).
2. Ouvrir l'outil de filtrage (dans cette application : l'espace de travail).
3. Glisser le fichier CSV dans la zone de dépôt, ou cliquer dessus pour le choisir.
4. Vérifier le message « Colonnes reconnues ». Sinon, choisir les bonnes colonnes (la commune s'appelle normalement COMM).
5. Régler les filtres : commune 12145, date d'autorisation, etc.
6. Lancer la recherche et attendre la fin de la barre de progression.
7. Cliquer sur une colonne pour trier, puis sur « Exporter pour Excel » pour garder la liste.

Réglages utiles :
| Besoin | Réglage |
|---|---|
| Millau seule | Commune : 12145 |
| Millau et d'autres communes | Commune : 12145, puis les codes INSEE des autres communes séparés par des virgules |
| Tout l'Aveyron | Commune : vide · Département : 12 |
| Seulement les grosses opérations de logements | Logements créés : au moins 10 |
| Seulement les gros bâtiments d'activité | Surface créée : au moins 500 m² |
| Retrouver un type de maître d'ouvrage | Mot-clé : SCI, OPH, commune, école… |

## Ce qu'on fait des résultats (prospection CSPS)
1. Garder les demandeurs personnes morales : promoteurs, bailleurs sociaux, sociétés, communes et intercommunalités.
2. Retenir les opérations importantes : plusieurs logements, ou une surface de locaux d'au moins quelques centaines de m², ou une démolition.
3. Identifier le demandeur avec son numéro SIREN sur annuaire-entreprises.data.gouv.fr pour trouver son adresse et son dirigeant.
4. Le contacter dans le mois qui suit l'autorisation : il doit avoir un coordonnateur SPS avant de consulter les entreprises de travaux.
5. Noter chaque contact dans le tableau de prospection (maître d'ouvrage, projet, date du permis, appel, résultat, relance).

Ce qu'on peut dire au téléphone : « Bonjour, je suis Mohamed-Salah Kheidri, ingénieur et coordonnateur SPS à Millau.
J'ai vu que votre projet a obtenu son permis de construire. Une opération de cette taille demande un coordonnateur SPS,
à désigner avant la consultation des entreprises. L'avez-vous déjà prévu ? Je peux vous faire une proposition adaptée. »

Les données affichées dans ces bases sont celles publiées par l'État ; les particuliers n'y sont pas nommés, seules les personnes morales le sont.
`;
