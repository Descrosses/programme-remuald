/**
 * Catalogue des exercices — §5, §7, §8, §12.
 *
 * `id` est GELÉ : c'est la clé de l'historique sur 12 semaines. On peut
 * corriger un `name`, une consigne ou une alternative sans rien casser ;
 * changer un `id` déconnecte l'historique de l'exercice.
 *
 * Ce fichier ne contient ni séries, ni répétitions, ni charges : elles
 * dépendent de la semaine et vivent dans `baseSessions.ts` / `mainLiftTable.ts`.
 */

import type { ExerciseDef } from './types';

/** Rappel §5, ajouté à chaque mouvement explosif. */
const REGLE_EXPLOSIF =
  'Chaque répétition est une tentative de performance. Reset complet 5-10 s entre les reps. ' +
  'Tu arrêtes l’exercice si la distance ou la hauteur baisse d’environ 5 %, si le contact au sol ' +
  'devient lent, si la réception devient lourde, ou si tu ne te sens plus explosif — même s’il ' +
  'reste des séries écrites.';

function def(e: ExerciseDef): ExerciseDef {
  return e.explosive ? { ...e, cues: [...(e.cues ?? []), REGLE_EXPLOSIF] } : e;
}

const LIST: ExerciseDef[] = [
  // ---------------------------------------------------------------- LUNDI --
  def({
    id: 'pogo-jumps',
    name: 'Pogo Jumps',
    fn: 'jump',
    role: 'power',
    explosive: true,
    intent: 'Contacts très courts, chevilles rigides, peu de flexion du genou.',
    cues: ['Arrêt dès que les rebonds deviennent lourds ou bruyants.'],
  }),
  def({
    id: 'box-jump',
    name: 'Box Jump',
    fn: 'jump',
    role: 'power',
    explosive: true,
    measure: 'cm',
    intent: 'Hauteur où tu atterris souple sans rentrer les genoux (60-75 cm).',
    altBasicFit: 'Zone fonctionnelle Basic-Fit ; sinon Vertical Jump sur cible murale.',
    cues: ['Réception silencieuse. Si elle devient bruyante, l’exercice est terminé.'],
  }),
  def({
    id: 'back-squat',
    name: 'Back Squat',
    fn: 'squat',
    role: 'main',
    liftId: 'back-squat',
    measure: 'kg',
    intent: 'Remontée avec intention d’accélération maximale.',
    cues: [
      'Semaines 1-3 — tempo 3-0-X : descente 3 s.',
      'Semaines 5-7 — fini le tempo 3 s : descente contrôlée ~2 s, remontée intention maximale, repos 4 min entiers.',
    ],
  }),
  def({
    id: 'bulgarian-split-squat',
    name: 'Bulgarian Split Squat',
    fn: 'squat',
    role: 'accessory',
    measure: 'kg',
    intent: 'Tempo 3-1-X-0. Genou avant stable, buste légèrement penché.',
    progressionRule: '8 reps propres à RPE ≤ 7,5 → +2 kg par haltère.',
  }),
  def({
    id: 'rdl',
    name: 'Romanian Deadlift',
    fn: 'hinge',
    role: 'accessory',
    liftId: 'rdl',
    measure: 'kg',
    intent:
      'Tempo 3-1-X-1. Descends jusqu’à l’étirement maximal des ischios sans perdre la neutralité lombaire.',
  }),
  def({
    id: 'ab-wheel',
    name: 'Ab Wheel',
    fn: 'core',
    role: 'core',
    measure: 'reps',
    intent: 'Bassin en rétroversion, jamais d’extension lombaire.',
    cues: ['Augmente l’amplitude avant d’augmenter les reps.'],
    altBasicFit: 'Rollout avec une barre chargée de deux disques.',
  }),

  // ------------------------------------------------------------- MERCREDI --
  def({
    id: 'plyo-push-up',
    name: 'Plyo Push-Up',
    fn: 'push',
    role: 'power',
    explosive: true,
    intent: 'Les mains décollent, réception souple.',
    cues: ['Arrêt si les mains décollent moins haut.'],
    altBasicFit: 'Mains sur un step si trop dur.',
  }),
  def({
    id: 'bench-press',
    name: 'Bench Press',
    fn: 'push',
    role: 'main',
    liftId: 'bench-press',
    measure: 'kg',
    intent: 'Tempo 2-1-X-0 : pause réelle 1 s sur le torse, poussée explosive.',
  }),
  def({
    id: 'weighted-pullup',
    name: 'Tractions lestées',
    fn: 'pull',
    role: 'main',
    liftId: 'weighted-pullup',
    measure: 'kg',
    intent: 'Dead hang complet, zéro kipping, poitrine vers la barre.',
    cues: ['Descente contrôlée 2 s.'],
  }),
  def({
    id: 'landmine-press-kneeling',
    name: 'Landmine Press half-kneeling',
    fn: 'push',
    role: 'accessory',
    measure: 'kg',
    intent: 'Transfert jambes → tronc → bras, tronc verrouillé.',
    altBasicFit:
      'Barre olympique calée dans un coin avec une serviette. Sinon développé haltère unilatéral à genou, 22 kg.',
  }),
  def({
    id: 'chest-supported-row',
    name: 'Chest-supported Dumbbell Row',
    fn: 'pull',
    role: 'accessory',
    measure: 'kg',
    intent: 'Pause 1 s en contraction.',
  }),
  def({
    id: 'face-pull',
    name: 'Face Pull',
    fn: 'pull',
    role: 'accessory',
    intent: 'Léger. Non négociable — robustesse de la coiffe et des scapulas.',
  }),
  def({
    id: 'cable-external-rotation',
    name: 'Rotation externe câble',
    fn: 'pull',
    role: 'accessory',
    intent: 'Léger. Non négociable.',
  }),
  def({
    id: 'pallof-press',
    name: 'Pallof Press Step-Out',
    fn: 'core',
    role: 'core',
    intent: 'Step-out → verrouillage 2 s → retour. Anti-rotation dynamique.',
  }),

  // -------------------------------------------------------------- VENDREDI --
  def({
    id: 'broad-jump',
    name: 'Broad Jump',
    fn: 'jump',
    role: 'power',
    explosive: true,
    measure: 'cm',
    intent: 'Maximal. Mesure chaque distance.',
    cues: [
      'Orteils au départ, talon le plus arrière à l’arrivée.',
      'Les 3 sauts du readiness test servent d’échauffement.',
    ],
  }),
  def({
    id: 'lateral-bound',
    name: 'Lateral Bound',
    fn: 'jump',
    role: 'power',
    explosive: true,
    measure: 'cm',
    intent: 'Tiens la réception 2 s. Puissance dans le plan frontal.',
  }),
  def({
    /*
     * `hang-high-pull` et non `hangHighPull` : tous les identifiants du
     * catalogue sont en tiret-minuscule, et c'est la clé de douze semaines
     * d'historique. Un seul identifiant écrit autrement serait la première
     * chose qu'on oublierait en cherchant un bug.
     */
    id: 'hang-high-pull',
    name: 'Hang High Pull',
    /*
     * `hinge` et non `pull` : la puissance vient de l'extension de hanche. Les
     * bras ne font que finir le geste — et tirer avec eux trop tôt est
     * justement l'erreur que la consigne ci-dessous vise.
     */
    fn: 'hinge',
    /*
     * `power` : c'est ce rôle qui fait appliquer la règle de deload des
     * mouvements explosifs (§8, « volume divisé par 2, intention maximale
     * conservée ») en semaines 4 et 8, sans rien écrire de spécifique.
     */
    role: 'power',
    /* Injecte la règle §5 — reset entre les reps, arrêt dès que ça ralentit. */
    explosive: true,
    measure: 'kg',
    intent:
      'Extension explosive hanches-genoux-chevilles, barre proche du corps, tirage jusqu’à hauteur de poitrine environ. Priorité à la vitesse, jamais à la charge.',
    progressionRule:
      '+2,5 kg quand les 3 reps de toutes les séries restent rapides et propres.',
    altBasicFit: 'Aucune nécessaire : une barre olympique et des disques suffisent.',
    cues: [
      'Erreur à éviter : tirer avec les bras avant l’extension complète des hanches.',
      'Erreur à éviter : la barre qui s’éloigne du corps.',
      'Pas de réception : la barre monte, tu ne passes jamais dessous. Ce n’est pas un hang clean.',
      'Reset complet entre chaque répétition (barre reposée ou position réinitialisée), 5 à 10 secondes de pause avant la rep suivante — jamais enchaîné en continu.',
    ],
  }),
  def({
    id: 'push-press',
    name: 'Push Press',
    fn: 'push',
    role: 'main',
    liftId: 'push-press',
    measure: 'kg',
    intent: 'Dip court (10-15 cm), drive explosif. La barre doit voler.',
    progressionRule: '+2,5 kg quand les reps de toutes les séries sont rapides.',
    cues: ['Si la dernière rep devient un strict press : trop lourd, tu arrêtes.'],
  }),
  def({
    id: 'speed-squat',
    name: 'Speed Squat',
    fn: 'squat',
    role: 'main',
    liftId: 'speed-squat',
    measure: 'kg',
    intent: 'Descente contrôlée, remontée la plus rapide possible.',
    cues: ['Arrêt dès que la vitesse baisse visiblement, même s’il reste des séries.'],
  }),
  def({
    id: 'jump-squat-db',
    name: 'Jump Squat haltères',
    fn: 'jump',
    role: 'power',
    explosive: true,
    intent: 'Vitesse de projection, pas de charge lourde.',
    cues: ['Ne mets pas 40 kg. L’objectif est la vitesse.'],
  }),
  def({
    id: 'explosive-cable-row',
    name: 'Explosive Cable Row',
    fn: 'pull',
    role: 'accessory',
    intent: 'Tirer vite, retour contrôlé.',
  }),
  def({
    id: 'farmer-carry',
    name: 'Farmer Carry',
    fn: 'carry',
    role: 'carry',
    measure: 'm',
    intent: 'DEUX haltères, une dans chaque main. Charge symétrique, buste haut, marche agressive.',
    progressionRule: '+2 kg quand les 25 m sont tenus sans ralentir.',
    cues: [
      'Ne pas confondre avec le Suitcase Carry du samedi : celui-là se porte d’un seul côté.',
    ],
  }),
  def({
    id: 'dead-bug-cable',
    name: 'Dead Bug avec câble',
    fn: 'core',
    role: 'core',
    intent: 'Anti-extension.',
  }),

  // ---------------------------------------------------------------- SAMEDI --
  def({
    id: 'deadlift',
    name: 'Deadlift conventionnel',
    fn: 'hinge',
    role: 'main',
    liftId: 'deadlift',
    measure: 'kg',
    intent:
      'Chaque rep part du sol, pas de touch-and-go. Hanches hautes, tension avant décollage, barre contre les tibias, montée avec intention de vitesse maximale.',
    cues: [
      'Ton 130 kg est très probablement sous-estimé : si la semaine 1 sort à RPE ≤ 6, applique la règle « trop facile » dès la semaine 2.',
    ],
  }),
  def({
    id: 'front-squat',
    name: 'Front Squat',
    fn: 'squat',
    role: 'main',
    liftId: 'front-squat',
    measure: 'kg',
    intent: 'Coudes hauts, buste vertical.',
    progressionRule: '+2,5 kg par semaine si le RPE est conforme.',
  }),
  def({
    id: 'hip-thrust',
    name: 'Hip Thrust',
    fn: 'hinge',
    role: 'accessory',
    measure: 'kg',
    intent: '2 s de contraction en haut, menton rentré.',
    progressionRule: '+10 kg quand le RPE est ≤ 7.',
    altBasicFit: 'Machine hip thrust si présente, sinon banc + barre avec pad.',
  }),
  def({
    id: 'nordic-curl',
    name: 'Nordic Curl',
    fn: 'hinge',
    role: 'accessory',
    intent: 'Descente 4-5 s, assistance des mains au sol.',
    altBasicFit: 'Pieds sous le rouleau d’une machine. Sinon Leg Curl 3 × 8, tempo 4-0-1-0.',
  }),
  def({
    id: 'single-leg-rdl',
    name: 'Single-Leg RDL haltère',
    fn: 'hinge',
    role: 'accessory',
    measure: 'kg',
    intent: 'Lent, hanche carrée.',
  }),
  def({
    id: 'copenhagen-plank',
    name: 'Copenhagen Plank dynamique',
    fn: 'core',
    role: 'core',
    intent: 'Pied supérieur sur banc, monte et descends le bassin.',
  }),
  def({
    id: 'suitcase-carry',
    name: 'Suitcase Carry',
    fn: 'carry',
    role: 'carry',
    measure: 'm',
    intent:
      'UNE SEULE haltère, comme une valise, puis l’autre côté. Zéro inclinaison, regarde droit devant.',
    cues: [
      'C’est le déséquilibre qui fait travailler le tronc : le porter à deux mains supprime l’exercice.',
      'Ne pas confondre avec le Farmer Carry du vendredi : celui-là se porte à deux mains.',
    ],
  }),

  // -------------------------------------------------------------- DIMANCHE --
  def({
    id: 'incline-db-press',
    name: 'Incline Dumbbell Press',
    fn: 'push',
    role: 'accessory',
    measure: 'kg',
  }),
  def({
    id: 'neutral-grip-pullup',
    name: 'Tractions prise neutre',
    fn: 'pull',
    role: 'accessory',
    measure: 'kg',
    intent: 'Ce n’est pas la séance lourde du mercredi.',
  }),
  def({
    id: 'one-arm-cable-row',
    name: 'One-Arm Cable Row',
    fn: 'pull',
    role: 'accessory',
  }),
  def({
    id: 'landmine-press-standing',
    name: 'Landmine Press debout',
    fn: 'push',
    role: 'accessory',
    intent: 'Transfert jambes → tronc → bras.',
  }),
  def({
    id: 'cable-chop',
    name: 'Cable Chop haut → bas',
    fn: 'core',
    role: 'core',
    intent: 'Rapide, pivote sur les hanches.',
  }),
  def({
    id: 'hanging-leg-raise',
    name: 'Hanging Leg Raise strict',
    fn: 'core',
    role: 'core',
    measure: 'reps',
    intent: 'Rétroversion du bassin.',
    altBasicFit: 'Genoux fléchis si trop dur.',
  }),
  def({
    id: 'bear-crawl',
    name: 'Bear Crawl',
    fn: 'core',
    role: 'core',
    measure: 'm',
    intent: 'Genoux à 5 cm du sol, bassin stable.',
  }),
  def({
    id: 'conditioning',
    name: 'Conditioning vélo / rameur',
    fn: 'conditioning',
    role: 'conditioning',
    intent: '8/10 sur les portions rapides, pas de sprint maximal. Coût musculaire faible.',
  }),
  def({
    id: 'zone2-bike',
    name: 'Zone 2 vélo',
    fn: 'conditioning',
    role: 'conditioning',
    intent: 'Facultatif. 10-15 min, rien de plus.',
  }),

  // ------------------------------------------------------- TESTS §12 --------
  def({
    id: 'test-bodyweight',
    name: 'Poids de corps',
    fn: 'test',
    role: 'test',
    measure: 'kg',
    intent: 'Moyenne de 3 matins, à jeun.',
  }),
  def({
    id: 'test-broad-jump',
    name: 'Broad Jump — test',
    fn: 'test',
    role: 'test',
    measure: 'cm',
    intent: 'Orteils au départ → talon le plus arrière à l’arrivée. Garde le meilleur essai.',
    cues: ['Le meilleur essai du test initial devient ta référence de readiness, définitivement.'],
  }),
  def({
    id: 'test-vertical-jump',
    name: 'Vertical Jump — test',
    fn: 'test',
    role: 'test',
    measure: 'cm',
    intent: 'Marque murale main tendue vs sommet du saut.',
  }),
  def({
    id: 'test-sprint-10m',
    name: 'Sprint 10 m',
    fn: 'test',
    role: 'test',
    measure: 's',
    intent: 'Chrono vidéo. Jamais sur tapis.',
    cues: ['Si la surface ne s’y prête pas, saute ce test — mais saute-le à chaque combine.'],
  }),
  def({
    id: 'test-sprint-20m',
    name: 'Sprint 20 m',
    fn: 'test',
    role: 'test',
    measure: 's',
    intent: 'Chrono vidéo. Jamais sur tapis.',
  }),
  def({
    id: 'test-squat-1rm',
    name: 'Back Squat 1RM',
    fn: 'test',
    role: 'test',
    measure: 'kg',
    intent: 'Repos 4-5 min entre les singles.',
    cues: ['Un squat propre à 152,5 vaut plus qu’un grinder hideux à 160.'],
  }),
  def({
    id: 'test-bench-1rm',
    name: 'Bench 1RM',
    fn: 'test',
    role: 'test',
    measure: 'kg',
    intent: 'Repos 4-5 min entre les singles.',
  }),
  def({
    id: 'test-deadlift-1rm',
    name: 'Deadlift 1RM',
    fn: 'test',
    role: 'test',
    measure: 'kg',
    intent: 'Progression selon la vitesse de barre. Si la barre ralentit franchement, c’est le max.',
  }),
  def({
    id: 'test-weighted-pullup-1rm',
    name: 'Tractions lestées 1RM',
    fn: 'test',
    role: 'test',
    measure: 'kg',
    intent: 'Dead hang, zéro kipping, menton franchement au-dessus. Repos 4 min.',
  }),
  def({
    id: 'test-strict-pullup-max',
    name: 'Tractions strictes max',
    fn: 'test',
    role: 'test',
    measure: 'reps',
    intent: '1 série, poitrine à la barre.',
  }),
  def({
    id: 'test-ab-wheel-max',
    name: 'Ab Wheel max',
    fn: 'test',
    role: 'test',
    measure: 'reps',
    intent: '1 série stricte. Arrêt à la perte de rétroversion.',
  }),
  def({
    id: 'test-leg-raise-max',
    name: 'Hanging Leg Raise max',
    fn: 'test',
    role: 'test',
    measure: 'reps',
    intent: '1 série stricte.',
  }),
  def({
    id: 'test-farmer-carry',
    name: 'Farmer Carry — test',
    fn: 'test',
    role: 'test',
    measure: 'm',
    intent: 'Distance max sans poser, haltères 2 × 40 kg.',
    cues: ['Arrêt : haltère posé, grip perdu ou posture dégradée.'],
  }),
  def({
    id: 'ramp-up',
    name: 'Montées de charge',
    fn: 'test',
    role: 'test',
    intent: 'Suis les paliers, repos 2-3 min entre les derniers.',
  }),
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
