/**
 * Les 4 séances de référence de Remuald (bloc apprentissage, semaines 1-3).
 *
 * C'est l'unique trame écrite à la main. Les blocs deload, force + muscle,
 * muscle + densité et allègement sont obtenus en appliquant `blockRules.ts` à
 * ces quatre trames — jamais en les recopiant douze fois.
 *
 * Charges : AUCUNE n'est écrite ici. Remuald est débutant, il n'a pas de 1RM
 * testé : à la première séance, il choisit la charge qui donne le RPE cible
 * (charge autorégulée, `autoreg` sans point de départ), puis §11 prend le
 * relais à partir de ce qu'il a réellement soulevé.
 */

import {
  autoreg,
  bodyweight,
  meters,
  noLoad,
  reps,
  rpe,
  rpeRange,
  type DayIndex,
  type LoadSpec,
  type RPETarget,
  type SessionBlueprint,
  type Slot,
  type Work,
} from './types';

const s = (
  exId: string,
  sets: number,
  work: Work,
  load: LoadSpec,
  targetRPE: RPETarget | null,
  restSec: number,
  note?: string,
): Slot => ({ exId, sets, work, load, targetRPE, restSec, ...(note ? { note } : {}) });

/** Barre ou machine à plaques : pas de 2,5 kg. */
const barre = () => autoreg(undefined, 2.5, 'barbell');
/** Paire d'haltères : pas de 2 kg. */
const halteres = () => autoreg(undefined, 2, 'dbPair');
/** Un seul haltère. */
const haltere = () => autoreg(undefined, 2, 'dbSingle');
/** Poulie : pas de 1 kg. */
const poulie = () => autoreg(undefined, 1, 'cable');

/** Cardio zone 2 en fin de séance. */
export const zone2 = (minutes: number): Slot =>
  s('zone2-cardio', 1, { kind: 'time', seconds: minutes * 60 }, noLoad(), null, 0,
    'Vélo, rameur ou marche inclinée — tu peux parler en phrases complètes.');

// ---------------------------------------------------------------------------

const LUNDI: SessionBlueprint = {
  day: 0,
  title: 'Bas du corps A — squat',
  durationLabel: '≈ 100 min',
  intensity: 'DUR',
  warmup: 'lower',
  readinessTest: true,
  notes: ['Après le travail : prends ta banane à 15 h 45 et 0,5 L d’eau avant d’arriver.'],
  slots: [
    s('goblet-squat', 3, reps(8), halteres(), rpe(7), 120, 'Tempo 3-0-X : descente 3 s.'),
    s('leg-press', 3, reps(10), barre(), rpe(7), 120),
    s('db-rdl', 3, reps(10), halteres(), rpe(7), 120),
    s('leg-curl', 3, reps(12), barre(), rpeRange(7, 8), 90),
    s('step-up', 2, reps(8, true, 'jambe'), halteres(), rpe(7), 90),
    s('dead-bug', 3, reps(8, true), bodyweight(), null, 45),
    zone2(25),
  ],
};

const MARDI: SessionBlueprint = {
  day: 1,
  title: 'Haut du corps A — force',
  durationLabel: '≈ 95 min',
  intensity: 'DUR',
  warmup: 'upper',
  readinessTest: false,
  notes: [],
  slots: [
    s('bench-press', 3, reps({ min: 6, max: 8 }), barre(), rpe(7), 150),
    s('lat-pulldown', 3, reps(8), barre(), rpe(7), 120, 'Remplace les tractions lestées.'),
    s('chest-supported-row', 3, reps(10), halteres(), rpeRange(7, 8), 90),
    s('db-shoulder-press', 3, reps(10), halteres(), rpe(7), 90),
    s('face-pull', 2, reps(15), poulie(), null, 45),
    s('cable-external-rotation', 2, reps(12, true), poulie(), null, 45),
    s('pallof-press', 3, reps(8, true), poulie(), null, 60),
    zone2(25),
  ],
};

const JEUDI: SessionBlueprint = {
  day: 3,
  title: 'Bas du corps B — chaîne postérieure',
  durationLabel: '≈ 100 min',
  intensity: 'DUR',
  warmup: 'lower',
  readinessTest: true,
  notes: ['Après le travail : prends ta banane à 15 h 45 et 0,5 L d’eau avant d’arriver.'],
  slots: [
    s('hip-thrust', 3, reps(10), barre(), rpeRange(7, 8), 90),
    s('rdl', 3, reps(6), barre(), rpe(7), 150),
    s('single-leg-press', 2, reps(12, true, 'jambe'), barre(), rpe(7), 90),
    s('seated-leg-curl', 3, reps(10), barre(), rpeRange(7, 8), 90),
    s('adductor-machine', 2, reps(12), barre(), rpe(7), 60),
    s('suitcase-carry', 3, meters(20, true), haltere(), null, 60),
    s('plank', 3, { kind: 'time', seconds: 30 }, bodyweight(), null, 60, '3 fois 30 s.'),
    zone2(25),
  ],
};

const DIMANCHE: SessionBlueprint = {
  day: 6,
  title: 'Haut du corps B + tronc + cardio',
  durationLabel: '≈ 90 min',
  intensity: 'MODÉRÉ',
  warmup: 'upper',
  readinessTest: false,
  notes: [
    'Séance à 10 h. Pas de gros travail excentrique jambes : la séance squat est demain.',
  ],
  slots: [
    s('incline-db-press', 3, reps(10), halteres(), rpeRange(7, 8), 90),
    s('neutral-lat-pulldown', 3, reps(10), barre(), rpe(7), 90),
    s('one-arm-cable-row', 3, reps(12, true), poulie(), null, 75),
    s('cable-chop', 3, reps(10, true), poulie(), null, 60),
    s('knee-raise', 3, reps(10), bodyweight(), null, 60),
    s('farmer-carry', 4, meters(25), halteres(), null, 90),
    s(
      'conditioning',
      1,
      { kind: 'intervals', rounds: 8, workSec: 20, easySec: 70 },
      noLoad(),
      null,
      0,
      '12 min. 8/10 sur les 20 s, pas de sprint maximal.',
    ),
  ],
};

/**
 * Les quatre trames, rangées par jour réel. Mercredi, vendredi et samedi n'ont
 * pas de trame : ce sont des jours de repos.
 */
export const BASE_SESSIONS: Partial<Record<DayIndex, SessionBlueprint>> = {
  0: LUNDI,
  1: MARDI,
  3: JEUDI,
  6: DIMANCHE,
};
