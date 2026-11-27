/**
 * Phrases d'accueil variées selon le moment de la journée et le jour.
 * « {n} » est remplacé par le prénom (ou retiré s'il est inconnu).
 */
const MATIN = ['Bonjour, {n}.', 'Bien réveillé, {n} ?', 'On commence par quoi ce matin, {n} ?', 'Un café et des permis, {n} ?'];
const MIDI = ['Quoi de neuf, {n} ?', 'Bon après-midi, {n}.', "On explore quoi aujourd'hui, {n} ?", 'Prêt pour une nouvelle analyse, {n} ?'];
const SOIR = ['Bonsoir, {n}.', 'Encore un peu de travail, {n} ?', 'Une dernière analyse, {n} ?', 'Comment s’est passée la journée, {n} ?'];
const NUIT = ['Il se fait tard, {n}.', 'Les données ne dorment jamais, {n}.', 'Une petite recherche nocturne, {n} ?'];
const TOUJOURS = [
  'Quoi de neuf, {n} ?',
  'Content de vous revoir, {n}.',
  'Que cherchez-vous aujourd’hui, {n} ?',
  'On regarde quels permis, {n} ?',
  'Qu’est-ce qu’on analyse, {n} ?',
  'Par où commencer, {n} ?',
];

export interface Greeting {
  /** Morceaux de la phrase ; `name: true` = le prénom (mis en valeur). */
  pieces: { text: string; name?: boolean }[];
  kicker: string;
}

export function pickGreeting(prenom: string, d = new Date()): Greeting {
  const h = d.getHours();
  const day = d.getDay(); // 0 = dimanche
  const moment = h >= 5 && h < 12 ? MATIN : h >= 12 && h < 18 ? MIDI : h >= 18 && h < 23 ? SOIR : NUIT;
  const pool = [...moment, ...moment, ...TOUJOURS]; // le moment de la journée compte double
  if (day === 1 && h < 14) pool.push('Bonne semaine, {n} !');
  if (day === 5 && h >= 14) pool.push('Bientôt le week-end, {n} !');
  if (day === 0 || day === 6) pool.push('Bon week-end, {n}.', 'Un peu de travail ce week-end, {n} ?');

  const tpl = pool[Math.floor(Math.random() * pool.length)];
  const pieces: Greeting['pieces'] = [];
  if (prenom) {
    const [a, b] = tpl.split('{n}');
    pieces.push({ text: a }, { text: prenom, name: true }, { text: b ?? '' });
  } else {
    // sans prénom : « Bonjour, {n}. » → « Bonjour. »
    pieces.push({ text: tpl.replace(/,?\s*\{n\}/, '').replace(/\s+([?!.])/, ' $1').replace(/ \./, '.') });
  }
  // espace fine avant ? et ! (typographie française)
  for (const p of pieces) p.text = p.text.replace(/\s([?!])/g, ' $1');

  const salut = h >= 5 && h < 18 ? 'Bonjour' : 'Bonsoir';
  const date = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  return { pieces, kicker: `${salut} · ${date}` };
}
