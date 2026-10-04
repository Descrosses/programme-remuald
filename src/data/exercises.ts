/**
 * Catalogue des exercices — programme Remuald (débutant, perte de poids).
 *
 * `id` est GELÉ : c'est la clé de l'historique sur 13 semaines. On peut
 * corriger un `name`, une consigne ou une alternative sans rien casser ;
 * changer un `id` déconnecte l'historique de l'exercice.
 *
 * Consigne de départ : aucun saut au début, travail adaptatif. Le catalogue
 * ne contient donc AUCUN mouvement d'impact (pas de sauts, pas de sprint).
 *
 * Ce fichier ne contient ni séries, ni répétitions, ni charges : elles
 * dépendent de la semaine et vivent dans `baseSessions.ts` / `blockRules.ts`.
 */

import type { ExerciseDef } from './types';

const LIST: ExerciseDef[] = [
  // ---------------------------------------------------------------- LUNDI --
  {
    id: 'goblet-squat',
    name: 'Goblet Squat',
    fn: 'squat',
    role: 'main',
    measure: 'kg',
    /* Une seule haltère, tenue à deux mains : ni une paire, ni un côté à la
       fois. Le rappel de prise ne peut pas se déduire de la charge ici. */
    grip: 'dbBothHands',
    intent:
      'Haltère tenu contre la poitrine. Descente contrôlée 3 s, genoux dans l’axe des pieds, remontée avec intention.',
    cues: [
      'C’est l’apprentissage du squat : la technique passe avant la charge.',
      'Descends aussi bas que tu restes dos droit, talons au sol.',
    ],
    altBasicFit: 'Presse à cuisses si une gêne apparaît.',
  },
  {
    id: 'back-squat',
    name: 'Squat barre',
    fn: 'squat',
    role: 'main',
    measure: 'kg',
    intent: 'Barre sur les trapèzes, descente contrôlée ~2 s, remontée avec intention.',
    cues: [
      'Introduit à partir de la semaine 5, seulement si le Goblet Squat est propre (vidéo à envoyer à ton coach).',
      'Toujours dans le rack, barres de sécurité réglées juste sous ta position basse.',
    ],
    altBasicFit: 'Si la technique n’est pas encore validée : reste au Goblet Squat, même schéma.',
  },
  {
    id: 'leg-press',
    name: 'Presse à cuisses',
    fn: 'squat',
    role: 'accessory',
    measure: 'kg',
    intent: 'Pieds largeur d’épaules, bas du dos collé au dossier. Ne verrouille pas les genoux en haut.',
  },
  {
    id: 'db-rdl',
    name: 'RDL haltères',
    fn: 'hinge',
    role: 'accessory',
    measure: 'kg',
    intent:
      'Tempo 3-1-X-1. Hanches vers l’arrière, dos neutre, haltères le long des cuisses ; descends jusqu’à l’étirement des ischios.',
  },
  {
    id: 'leg-curl',
    name: 'Leg Curl',
    fn: 'hinge',
    role: 'accessory',
    measure: 'kg',
    intent: 'Montée contrôlée, descente lente en 3 s.',
  },
  {
    id: 'step-up',
    name: 'Step-up sur banc bas',
    fn: 'squat',
    role: 'accessory',
    measure: 'kg',
    intent: 'Pousse sur la jambe du dessus, sans élan de la jambe arrière. Descente contrôlée.',
    altBasicFit: 'Fentes arrière en tenant une barre d’appui.',
  },
  {
    id: 'dead-bug',
    name: 'Dead Bug',
    fn: 'core',
    role: 'core',
    intent: 'Bas du dos plaqué au sol. Bras et jambe opposés s’allongent lentement, souffle expiré.',
  },
  {
    id: 'zone2-cardio',
    name: 'Cardio zone 2',
    fn: 'conditioning',
    role: 'conditioning',
    intent:
      'Vélo, rameur ou marche inclinée. Effort où tu peux encore parler en phrases complètes.',
    cues: ['Pas de course : consigne de départ, aucun impact au début.'],
  },

  // ---------------------------------------------------------------- MARDI --
  {
    id: 'bench-press',
    name: 'Développé couché barre',
    fn: 'push',
    role: 'main',
    measure: 'kg',
    intent: 'Pause réelle 1 s sur le torse, poussée explosive.',
    cues: ['Dans le rack, barres de sécurité réglées, ou avec un partenaire.'],
  },
  {
    id: 'lat-pulldown',
    name: 'Tirage vertical',
    fn: 'pull',
    role: 'main',
    measure: 'kg',
    intent:
      'Poitrine haute, tire la barre vers le haut de la poitrine, coudes vers les hanches, retour contrôlé.',
    cues: ['Pas de balancement du buste pour aller chercher la charge.'],
  },
  {
    id: 'chest-supported-row',
    name: 'Rowing haltères buste appuyé',
    fn: 'pull',
    role: 'accessory',
    measure: 'kg',
    intent: 'Pause 1 s en contraction.',
  },
  {
    id: 'db-shoulder-press',
    name: 'Développé épaules haltères assis',
    fn: 'push',
    role: 'accessory',
    measure: 'kg',
    intent: 'Dos appuyé, gainage serré, pas de cambrure.',
  },
  {
    id: 'face-pull',
    name: 'Face Pull',
    fn: 'pull',
    role: 'accessory',
    intent: 'Léger. Non négociable — robustesse des épaules.',
  },
  {
    id: 'cable-external-rotation',
    name: 'Rotation externe câble',
    fn: 'pull',
    role: 'accessory',
    intent: 'Léger. Non négociable.',
  },
  {
    id: 'pallof-press',
    name: 'Pallof Press',
    fn: 'core',
    role: 'core',
    intent: 'Bras tendus devant toi, résiste à la rotation, tiens 2 s.',
  },

  // ---------------------------------------------------------------- JEUDI --
  {
    id: 'hip-thrust',
    name: 'Hip Thrust',
    fn: 'hinge',
    role: 'main',
    measure: 'kg',
    intent: '2 s de contraction en haut, menton rentré.',
    altBasicFit: 'Machine hip thrust si présente, sinon banc + barre avec pad.',
  },
  {
    id: 'rdl',
    name: 'RDL barre',
    fn: 'hinge',
    role: 'main',
    measure: 'kg',
    intent:
      'Tempo 3-1-X-1. Descends jusqu’à l’étirement maximal des ischios sans perdre la neutralité lombaire.',
    cues: ['C’est l’apprentissage du soulevé de terre : la technique passe avant la charge.'],
  },
  {
    id: 'single-leg-press',
    name: 'Presse à cuisses unilatérale',
    fn: 'squat',
    role: 'accessory',
    measure: 'kg',
    intent: 'Une jambe à la fois, genou dans l’axe, amplitude contrôlée.',
  },
  {
    id: 'seated-leg-curl',
    name: 'Leg Curl assis',
    fn: 'hinge',
    role: 'accessory',
    measure: 'kg',
    intent: 'Descente lente en 3 s.',
  },
  {
    id: 'adductor-machine',
    name: 'Adducteurs machine',
    fn: 'squat',
    role: 'accessory',
    measure: 'kg',
    intent: 'Amplitude confortable, retour contrôlé.',
  },
  {
    id: 'suitcase-carry',
    name: 'Suitcase Carry',
    fn: 'carry',
    role: 'carry',
    measure: 'm',
    intent: 'Un haltère d’un seul côté. Zéro inclinaison, regarde droit devant.',
  },
  {
    id: 'plank',
    name: 'Planche',
    fn: 'core',
    role: 'core',
    measure: 's',
    intent: 'Coudes sous les épaules, fessiers serrés, bassin aligné.',
    altBasicFit: 'Genoux au sol si le bassin s’affaisse.',
  },

  // ------------------------------------------------------------- DIMANCHE --
  {
    id: 'incline-db-press',
    name: 'Développé incliné haltères',
    fn: 'push',
    role: 'accessory',
    measure: 'kg',
    intent: 'Banc à 30°, descente contrôlée.',
  },
  {
    id: 'neutral-lat-pulldown',
    name: 'Tirage vertical prise neutre',
    fn: 'pull',
    role: 'accessory',
    measure: 'kg',
    intent: 'Même consigne que le tirage vertical, poignée prise neutre.',
  },
  {
    id: 'one-arm-cable-row',
    name: 'Rowing poulie un bras',
    fn: 'pull',
    role: 'accessory',
    intent: 'Épaule basse, tire le coude vers la hanche.',
  },
  {
    id: 'cable-chop',
    name: 'Cable Chop haut → bas',
    fn: 'core',
    role: 'core',
    intent: 'Rapide, pivote sur les hanches.',
  },
  {
    id: 'knee-raise',
    name: 'Relevé de genoux (chaise romaine)',
    fn: 'core',
    role: 'core',
    measure: 'reps',
    intent: 'Dos collé au dossier, monte les genoux sans élan.',
  },
  {
    id: 'farmer-carry',
    name: 'Farmer Carry',
    fn: 'carry',
    role: 'carry',
    measure: 'm',
    intent: 'Buste haut, marche dynamique.',
    progressionRule: '+2 kg quand les 25 m sont tenus sans ralentir.',
  },
  {
    id: 'conditioning',
    name: 'Fractionné vélo / rameur',
    fn: 'conditioning',
    role: 'conditioning',
    intent: '8/10 sur les portions rapides, pas de sprint maximal. Vélo ou rameur uniquement.',
  },

  // ------------------------------------------------------------- TESTS -----
  {
    id: 'test-bodyweight',
    name: 'Poids de corps',
    fn: 'test',
    role: 'test',
    measure: 'kg',
    intent: 'Moyenne de 3 matins, à jeun.',
  },
  {
    id: 'test-waist',
    name: 'Tour de taille',
    fn: 'test',
    role: 'test',
    measure: 'cm',
    intent: 'Au niveau du nombril, le matin, toujours au même repère.',
  },
  {
    id: 'test-leg-press-5rm',
    name: 'Presse à cuisses — 5 reps',
    fn: 'test',
    role: 'test',
    measure: 'kg',
    intent: 'Charge pour 5 répétitions à RPE 8 : il t’en resterait 2 en réserve. Note la charge.',
  },
  {
    id: 'test-bench-5rm',
    name: 'Développé couché — 5 reps',
    fn: 'test',
    role: 'test',
    measure: 'kg',
    intent: '5 répétitions à RPE 8, barres de sécurité réglées. Note la charge.',
  },
  {
    id: 'test-lat-pulldown-5rm',
    name: 'Tirage vertical — 5 reps',
    fn: 'test',
    role: 'test',
    measure: 'kg',
    intent: '5 répétitions à RPE 8. Note la charge.',
  },
  {
    id: 'test-cable-row-8rm',
    name: 'Rowing poulie — 8 reps',
    fn: 'test',
    role: 'test',
    measure: 'kg',
    intent: '8 répétitions à RPE 8. Note la charge.',
  },
  {
    id: 'test-hip-thrust-8rm',
    name: 'Hip Thrust — 8 reps',
    fn: 'test',
    role: 'test',
    measure: 'kg',
    intent: '8 répétitions à RPE 8. Note la charge.',
  },
  {
    id: 'test-plank-max',
    name: 'Planche — temps max',
    fn: 'test',
    role: 'test',
    measure: 's',
    intent: 'Arrêt dès que le bassin s’affaisse.',
  },
  {
    id: 'test-bike-10min',
    name: 'Vélo — 10 min',
    fn: 'test',
    role: 'test',
    measure: 'm',
    intent: 'Distance max en 10 min à effort soutenu, même vélo, même résistance à chaque bilan.',
  },
  {
    id: 'test-farmer-carry',
    name: 'Farmer Carry — test',
    fn: 'test',
    role: 'test',
    measure: 'm',
    intent: 'Distance max sans poser, haltères 2 × 20 kg.',
    cues: ['Arrêt : haltère posé, grip perdu ou posture dégradée.'],
  },
];

export const EXERCISES: Record<string, ExerciseDef> = Object.fromEntries(
  LIST.map((e) => [e.id, e]),
);

export const EXERCISE_IDS = LIST.map((e) => e.id);

/** Lève si l'id n'existe pas : une faute de frappe dans une trame se voit tout de suite. */
export function exercise(id: string): ExerciseDef {
  const e = EXERCISES[id];
  if (!e) throw new Error(`Exercice inconnu : « ${id} »`);
  return e;
}
